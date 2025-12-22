#!/usr/bin/env python3
"""
从 WooCommerce 同步客户到 Supabase
V2: 单站点运行，30 QPS，每1000个写一次数据库
"""

import os
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

# Session for connection pooling
session = requests.Session()


def get_woo_auth(site: str) -> str:
    config = WOO_SITES[site]
    return b64encode(f"{config['key']}:{config['secret']}".encode()).decode()


def fetch_woo_customers(site: str, page: int = 1, per_page: int = 100, rate_limiter: RateLimiter = None, max_retries: int = 3):
    """获取 WooCommerce 客户列表，带重试"""
    config = WOO_SITES[site]
    url = f"https://{config['domain']}/wp-json/wc/v3/customers"

    for attempt in range(max_retries):
        if rate_limiter:
            rate_limiter.wait()

        try:
            response = session.get(
                url,
                params={"page": page, "per_page": per_page},
                headers={"Authorization": f"Basic {get_woo_auth(site)}"},
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt  # 1s, 2s, 4s
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
            params={"email": f"in.({email_filter})", "select": "email,woo_ids"},
            headers=headers,
            timeout=30
        )

        if response.status_code == 200:
            for row in response.json():
                existing[row["email"]] = row.get("woo_ids") or {}

    return existing


def batch_upsert_customers(updates: list, creates: list) -> tuple:
    """批量 upsert 客户到 Supabase，返回 (success, error_msg)
    updates: 已存在客户的更新（只有 email 和 woo_ids）
    creates: 新客户的创建（完整字段）
    """
    url = f"{SUPABASE_URL}/rest/v1/customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    errors = []

    # 1. 处理更新
    if updates:
        try:
            response = session.post(url, headers=headers, json=updates, timeout=60)
            if response.status_code not in [200, 201]:
                errors.append(f"Updates failed: HTTP {response.status_code}: {response.text[:100]}")
        except Exception as e:
            errors.append(f"Updates error: {str(e)}")

    # 2. 处理创建
    if creates:
        try:
            response = session.post(url, headers=headers, json=creates, timeout=60)
            if response.status_code not in [200, 201]:
                errors.append(f"Creates failed: HTTP {response.status_code}: {response.text[:100]}")
        except Exception as e:
            errors.append(f"Creates error: {str(e)}")

    if errors:
        return False, "; ".join(errors)
    return True, None


def sync_site(site: str, qps: int = 30, batch_size: int = 1000, start_page: int = 1):
    """同步单个站点"""
    print(f"\n{'='*60}")
    print(f"Syncing {site.upper()} ({WOO_SITES[site]['domain']})")
    print(f"QPS: {qps}, Batch size: {batch_size}, Start page: {start_page}")
    print(f"{'='*60}")

    rate_limiter = RateLimiter(qps)
    total_synced = 0
    total_created = 0
    page = start_page
    start_time = time.time()

    pending_updates = []  # 已存在客户的更新
    pending_creates = []  # 新客户
    all_existing = {}  # 记录所有已处理的邮箱

    while True:
        try:
            # 1. 获取 WooCommerce 客户
            woo_customers = fetch_woo_customers(site, page=page, per_page=100, rate_limiter=rate_limiter)

            if not woo_customers:
                break

            # 2. 获取已存在的客户
            emails = [(c.get("email") or "").lower().strip() for c in woo_customers if c.get("email")]
            existing_map = get_existing_customers(emails)

            # 3. 处理客户数据
            for woo_customer in woo_customers:
                email = (woo_customer.get("email") or "").lower().strip()
                if not email:
                    continue

                # 跳过已处理的邮箱
                if email in all_existing:
                    continue

                if email in existing_map:
                    # 更新已存在的客户
                    current_woo_ids = existing_map[email].copy()
                    current_woo_ids[site] = woo_customer["id"]
                    pending_updates.append({
                        "email": email,
                        "woo_ids": current_woo_ids,
                    })
                    all_existing[email] = current_woo_ids
                else:
                    # 创建新客户
                    billing = woo_customer.get("billing") or {}
                    shipping = woo_customer.get("shipping") or {}
                    country = shipping.get("country") or billing.get("country")
                    assigned_site = COUNTRY_TO_SITE.get(country, "com") if country else None

                    pending_creates.append({
                        "email": email,
                        "first_name": woo_customer.get("first_name") or billing.get("first_name") or "",
                        "last_name": woo_customer.get("last_name") or billing.get("last_name") or "",
                        "phone": billing.get("phone"),
                        "woo_ids": {site: woo_customer["id"]},
                        "billing_address": billing,
                        "shipping_address": shipping,
                        "assigned_site": assigned_site,
                        "assignment_method": "address" if assigned_site else None,
                        "assignment_confidence": 0.85 if assigned_site else None,
                        "assignment_reason": f"Based on WooCommerce address: {country}" if assigned_site else None,
                        "order_stats": {
                            "total_orders": 0, "total_spent": 0,
                            "valid_orders": 0, "valid_spent": 0,
                            "invalid_orders": 0, "invalid_spent": 0,
                            "first_order_date": None, "last_order_date": None,
                            "by_site": {},
                        },
                    })
                    all_existing[email] = {site: woo_customer["id"]}

            # 4. 达到批次大小时写入数据库
            total_pending = len(pending_updates) + len(pending_creates)
            if total_pending >= batch_size:
                success, error = batch_upsert_customers(pending_updates, pending_creates)
                if success:
                    total_synced += len(pending_updates)
                    total_created += len(pending_creates)
                    elapsed = time.time() - start_time
                    rate = (total_synced + total_created) / elapsed if elapsed > 0 else 0
                    print(f"  [Batch] Wrote {total_pending} customers (+{len(pending_creates)} new, +{len(pending_updates)} updated) | Total: {total_synced + total_created} | {rate:.0f}/sec")
                else:
                    print(f"  [ERROR] Failed to write batch: {error}")

                pending_updates = []
                pending_creates = []

            # 打印进度
            elapsed = time.time() - start_time
            total_pending = len(pending_updates) + len(pending_creates)
            print(f"  Page {page}: fetched {len(woo_customers)} customers | Pending: {total_pending} | Elapsed: {elapsed:.1f}s")

            if len(woo_customers) < 100:
                break

            page += 1

        except Exception as e:
            print(f"  Page {page}: Error - {e}")
            break

    # 5. 写入剩余的数据
    total_pending = len(pending_updates) + len(pending_creates)
    if total_pending > 0:
        success, error = batch_upsert_customers(pending_updates, pending_creates)
        if success:
            total_synced += len(pending_updates)
            total_created += len(pending_creates)
            print(f"  [Final] Wrote {total_pending} customers (+{len(pending_creates)} new, +{len(pending_updates)} updated)")
        else:
            print(f"  [ERROR] Failed to write final batch: {error}")

    elapsed = time.time() - start_time
    print(f"\n  {site.upper()} Done: created={total_created}, synced={total_synced} in {elapsed:.1f}s")
    return total_synced, total_created


def main():
    parser = argparse.ArgumentParser(description='Sync WooCommerce customers to Supabase')
    parser.add_argument('--site', type=str, choices=['de', 'com', 'uk', 'fr'],
                        help='Site to sync (if not specified, syncs all)')
    parser.add_argument('--qps', type=int, default=30, help='Queries per second (default: 30)')
    parser.add_argument('--batch', type=int, default=1000, help='Batch size for DB writes (default: 1000)')
    parser.add_argument('--start-page', type=int, default=1, help='Starting page (default: 1)')
    args = parser.parse_args()

    print("="*60)
    print("WooCommerce Customer Sync V2")
    print(f"QPS: {args.qps}, Batch Size: {args.batch}")
    print("="*60)

    sites = [args.site] if args.site else ["de", "com", "uk", "fr"]
    results = {}
    total_start = time.time()

    for i, site in enumerate(sites):
        # 只有第一个站点使用 start_page，后续站点从 1 开始
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
        print(f"  {site.upper()}: synced={data['synced']}, created={data['created']}")
        total_synced += data['synced']
        total_created += data['created']

    print(f"\n  TOTAL: synced={total_synced}, created={total_created}")
    print(f"  TIME: {total_elapsed:.1f}s ({total_elapsed/60:.1f} min)")


if __name__ == "__main__":
    main()
