#!/usr/bin/env python3
"""
从 WooCommerce 订单同步客户到 Supabase
包含访客下单的客户
"""

import sys
import requests
from base64 import b64encode
import time
import argparse

sys.stdout.reconfigure(line_buffering=True)

# Supabase 配置
SUPABASE_URL = "https://iwzohjbvuhwvfidyevpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY2NDg5MCwiZXhwIjoyMDgwMjQwODkwfQ.dmsBSx5WLphgT90N1BYxyRHqDegHHnlhtHg9yFXhDOw"

# WooCommerce 配置
WOO_SITES = {
    "de": {
        "domain": "jerseysfever.de",
        "key": "ck_3f99da12ba804e5e19728453d38969909f876ffd",
        "secret": "cs_e43e59c8aeaa18b726d42d680cc201f4a34f1784",
    },
    "com": {
        "domain": "jerseysfever.com",
        "key": "ck_ef971832c16308aa87fed8f6318d67b49ca189ee",
        "secret": "cs_81ac0091b0cc9bc4cffe4e422fcfb8e72b676dc5",
    },
    "uk": {
        "domain": "jerseysfever.uk",
        "key": "ck_f57b40ac92270cb5f8af10680cbc8a16b301f876",
        "secret": "cs_b3ccf99d853a04506b3e81c56a77d81a1fdd60de",
    },
    "fr": {
        "domain": "jerseysfever.fr",
        "key": "ck_0dbcc01d41b5b1780362ec7ffe5d17ed6a5fe317",
        "secret": "cs_928b2a043e7e60f50c3f4853fb4f25183ac5d211",
    },
}

# 国家到站点映射
COUNTRY_TO_SITE = {
    "DE": "de", "AT": "de", "CH": "de", "LI": "de",
    "FR": "fr", "BE": "fr", "LU": "fr", "MC": "fr",
    "GB": "uk", "IE": "uk", "IM": "uk", "JE": "uk", "GG": "uk", "GI": "uk",
}

# Rate limiter
class RateLimiter:
    def __init__(self, qps: int):
        self.qps = qps
        self.interval = 1.0 / qps
        self.last_call = 0

    def wait(self):
        now = time.time()
        elapsed = now - self.last_call
        if elapsed < self.interval:
            time.sleep(self.interval - elapsed)
        self.last_call = time.time()

session = requests.Session()


def get_woo_auth(site: str) -> str:
    config = WOO_SITES[site]
    return b64encode(f"{config['key']}:{config['secret']}".encode()).decode()


def fetch_woo_orders(site: str, page: int = 1, per_page: int = 100, rate_limiter: RateLimiter = None, max_retries: int = 3):
    """获取 WooCommerce 订单列表"""
    config = WOO_SITES[site]
    url = f"https://{config['domain']}/wp-json/wc/v3/orders"

    for attempt in range(max_retries):
        if rate_limiter:
            rate_limiter.wait()

        try:
            response = session.get(
                url,
                params={"page": page, "per_page": per_page, "status": "any"},
                headers={"Authorization": f"Basic {get_woo_auth(site)}"},
                timeout=60
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                print(f"    [Retry] Page {page} failed ({e}), retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise


def get_existing_customers(emails: list) -> dict:
    """批量获取已存在的客户"""
    if not emails:
        return {}

    url = f"{SUPABASE_URL}/rest/v1/customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    existing = {}
    for i in range(0, len(emails), 100):
        batch = emails[i:i+100]
        email_filter = ",".join(batch)

        response = session.get(
            url,
            params={"email": f"in.({email_filter})", "select": "email,woo_ids,assigned_site"},
            headers=headers,
            timeout=30
        )

        if response.status_code == 200:
            for row in response.json():
                existing[row["email"]] = {
                    "woo_ids": row.get("woo_ids") or {},
                    "assigned_site": row.get("assigned_site")
                }

    return existing


def batch_upsert_customers(updates: list, creates: list) -> tuple:
    """批量 upsert 客户"""
    url = f"{SUPABASE_URL}/rest/v1/customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    errors = []

    if updates:
        try:
            response = session.post(url, headers=headers, json=updates, timeout=60)
            if response.status_code not in [200, 201]:
                errors.append(f"Updates: HTTP {response.status_code}: {response.text[:100]}")
        except Exception as e:
            errors.append(f"Updates error: {str(e)}")

    if creates:
        try:
            response = session.post(url, headers=headers, json=creates, timeout=60)
            if response.status_code not in [200, 201]:
                errors.append(f"Creates: HTTP {response.status_code}: {response.text[:100]}")
        except Exception as e:
            errors.append(f"Creates error: {str(e)}")

    if errors:
        return False, "; ".join(errors)
    return True, None


def sync_site(site: str, qps: int = 30, batch_size: int = 1000, start_page: int = 1):
    """从订单同步客户"""
    print(f"\n{'='*60}")
    print(f"Syncing {site.upper()} orders ({WOO_SITES[site]['domain']})")
    print(f"QPS: {qps}, Batch size: {batch_size}, Start page: {start_page}")
    print(f"{'='*60}")

    rate_limiter = RateLimiter(qps)
    total_synced = 0
    total_created = 0
    page = start_page
    start_time = time.time()

    pending_updates = []
    pending_creates = []
    all_processed = {}  # 已处理的邮箱

    while True:
        try:
            orders = fetch_woo_orders(site, page=page, per_page=100, rate_limiter=rate_limiter)

            if not orders:
                break

            # 提取所有邮箱
            emails = []
            for order in orders:
                email = (order.get("billing", {}).get("email") or "").lower().strip()
                if email and email not in all_processed:
                    emails.append(email)

            # 获取已存在的客户
            existing_map = get_existing_customers(emails)

            # 处理订单
            for order in orders:
                billing = order.get("billing") or {}
                shipping = order.get("shipping") or {}
                email = (billing.get("email") or "").lower().strip()

                if not email or email in all_processed:
                    continue

                country = shipping.get("country") or billing.get("country")
                customer_id = order.get("customer_id", 0)  # 0 表示访客

                if email in existing_map:
                    # 已存在的客户 - 更新 woo_ids（如果有 customer_id）
                    current = existing_map[email]
                    current_woo_ids = current["woo_ids"].copy()

                    # 只有注册用户才更新 woo_id
                    if customer_id > 0:
                        current_woo_ids[site] = customer_id
                        pending_updates.append({
                            "email": email,
                            "woo_ids": current_woo_ids,
                        })

                    all_processed[email] = True
                else:
                    # 新客户
                    assigned_site = COUNTRY_TO_SITE.get(country, "com") if country else None

                    woo_ids = {}
                    if customer_id > 0:
                        woo_ids[site] = customer_id

                    pending_creates.append({
                        "email": email,
                        "first_name": billing.get("first_name") or "",
                        "last_name": billing.get("last_name") or "",
                        "phone": billing.get("phone"),
                        "woo_ids": woo_ids,
                        "billing_address": billing,
                        "shipping_address": shipping,
                        "assigned_site": assigned_site,
                        "assignment_method": "address" if assigned_site else None,
                        "assignment_confidence": 0.85 if assigned_site else None,
                        "assignment_reason": f"Based on WooCommerce order address: {country}" if assigned_site else None,
                        "order_stats": {
                            "total_orders": 0, "total_spent": 0,
                            "valid_orders": 0, "valid_spent": 0,
                            "invalid_orders": 0, "invalid_spent": 0,
                            "first_order_date": None, "last_order_date": None,
                            "by_site": {},
                        },
                    })
                    all_processed[email] = True

            # 批量写入
            total_pending = len(pending_updates) + len(pending_creates)
            if total_pending >= batch_size:
                success, error = batch_upsert_customers(pending_updates, pending_creates)
                if success:
                    total_synced += len(pending_updates)
                    total_created += len(pending_creates)
                    elapsed = time.time() - start_time
                    rate = (total_synced + total_created) / elapsed if elapsed > 0 else 0
                    print(f"  [Batch] Wrote {total_pending} (+{len(pending_creates)} new, +{len(pending_updates)} updated) | Total: {total_synced + total_created} | {rate:.0f}/sec")
                else:
                    print(f"  [ERROR] {error}")

                pending_updates = []
                pending_creates = []

            elapsed = time.time() - start_time
            total_pending = len(pending_updates) + len(pending_creates)
            print(f"  Page {page}: {len(orders)} orders | Pending: {total_pending} | Elapsed: {elapsed:.1f}s")

            if len(orders) < 100:
                break

            page += 1

        except Exception as e:
            print(f"  Page {page}: Error - {e}")
            import traceback
            traceback.print_exc()
            break

    # 写入剩余数据
    total_pending = len(pending_updates) + len(pending_creates)
    if total_pending > 0:
        success, error = batch_upsert_customers(pending_updates, pending_creates)
        if success:
            total_synced += len(pending_updates)
            total_created += len(pending_creates)
            print(f"  [Final] Wrote {total_pending} (+{len(pending_creates)} new, +{len(pending_updates)} updated)")
        else:
            print(f"  [ERROR] {error}")

    elapsed = time.time() - start_time
    print(f"\n  {site.upper()} Done: created={total_created}, updated={total_synced} in {elapsed:.1f}s")
    return total_synced, total_created


def main():
    parser = argparse.ArgumentParser(description='Sync customers from WooCommerce orders')
    parser.add_argument('--site', type=str, choices=['de', 'com', 'uk', 'fr'],
                        help='Site to sync (if not specified, syncs all)')
    parser.add_argument('--qps', type=int, default=30, help='Queries per second (default: 30)')
    parser.add_argument('--batch', type=int, default=1000, help='Batch size (default: 1000)')
    parser.add_argument('--start-page', type=int, default=1, help='Starting page (default: 1)')
    args = parser.parse_args()

    print("="*60)
    print("WooCommerce Orders -> Customers Sync")
    print(f"QPS: {args.qps}, Batch Size: {args.batch}")
    print("="*60)

    sites = [args.site] if args.site else ["de", "com", "uk", "fr"]
    results = {}
    total_start = time.time()

    for i, site in enumerate(sites):
        sp = args.start_page if i == 0 else 1
        synced, created = sync_site(site, qps=args.qps, batch_size=args.batch, start_page=sp)
        results[site] = {"synced": synced, "created": created}

    total_elapsed = time.time() - total_start

    print("\n" + "="*60)
    print("FINAL SUMMARY")
    print("="*60)

    total_synced = 0
    total_created = 0

    for site, data in results.items():
        print(f"  {site.upper()}: updated={data['synced']}, created={data['created']}")
        total_synced += data['synced']
        total_created += data['created']

    print(f"\n  TOTAL: updated={total_synced}, created={total_created}")
    print(f"  TIME: {total_elapsed:.1f}s ({total_elapsed/60:.1f} min)")


if __name__ == "__main__":
    main()
