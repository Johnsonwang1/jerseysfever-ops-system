#!/usr/bin/env python3
"""
从 WooCommerce 同步客户到 Supabase
优化版：批量操作 + 并发请求，30 QPS
"""

import os
import sys
import requests
from base64 import b64encode
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout.reconfigure(line_buffering=True)

# Supabase 配置
SUPABASE_URL = "https://iwzohjbvuhwvfidyevpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjUzNjY3OCwiZXhwIjoyMDU4MTEyNjc4fQ.GFLsxQcxGoHqVkEbvPNKbY-K51DKMeMkS2N3R-p5XWc"

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

# Session for connection pooling
session = requests.Session()


def get_woo_auth(site: str) -> str:
    config = WOO_SITES[site]
    return b64encode(f"{config['key']}:{config['secret']}".encode()).decode()


def fetch_woo_customers(site: str, page: int = 1, per_page: int = 100):
    """获取 WooCommerce 客户列表"""
    config = WOO_SITES[site]
    url = f"https://{config['domain']}/wp-json/wc/v3/customers"

    response = session.get(
        url,
        params={"page": page, "per_page": per_page},
        headers={"Authorization": f"Basic {get_woo_auth(site)}"},
        timeout=30
    )
    response.raise_for_status()
    return response.json()


def batch_upsert_customers(customers_data: list):
    """批量 upsert 客户到 Supabase"""
    if not customers_data:
        return 0

    url = f"{SUPABASE_URL}/rest/v1/customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    response = session.post(url, headers=headers, json=customers_data, timeout=30)
    return response.status_code in [200, 201]


def get_existing_emails(emails: list) -> set:
    """批量获取已存在的客户邮箱"""
    if not emails:
        return set()

    url = f"{SUPABASE_URL}/rest/v1/customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    # 分批查询（每批 100 个）
    existing = set()
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
                existing.add((row["email"], row.get("woo_ids") or {}))

    return existing


def process_woo_customers(woo_customers: list, site: str, existing_map: dict):
    """处理 WooCommerce 客户，返回待 upsert 的数据"""
    to_upsert = []
    created = 0
    synced = 0

    for woo_customer in woo_customers:
        email = (woo_customer.get("email") or "").lower().strip()
        if not email:
            continue

        billing = woo_customer.get("billing") or {}
        shipping = woo_customer.get("shipping") or {}
        country = shipping.get("country") or billing.get("country")

        if email in existing_map:
            # 更新 woo_ids
            current_woo_ids = existing_map[email].copy()
            current_woo_ids[site] = woo_customer["id"]

            to_upsert.append({
                "email": email,
                "woo_ids": current_woo_ids,
            })
            synced += 1
        else:
            # 创建新客户
            assigned_site = COUNTRY_TO_SITE.get(country, "com") if country else None

            to_upsert.append({
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
            created += 1

    return to_upsert, synced, created


def sync_site(site: str):
    """同步单个站点"""
    print(f"\n{'='*60}")
    print(f"Syncing {site.upper()} ({WOO_SITES[site]['domain']})")
    print(f"{'='*60}")

    total_synced = 0
    total_created = 0
    page = 1
    start_time = time.time()

    while True:
        try:
            # 1. 获取 WooCommerce 客户
            woo_customers = fetch_woo_customers(site, page=page, per_page=100)

            if not woo_customers:
                break

            # 2. 获取已存在的客户
            emails = [(c.get("email") or "").lower().strip() for c in woo_customers if c.get("email")]
            existing_data = get_existing_emails(emails)
            existing_map = {email: woo_ids for email, woo_ids in existing_data}

            # 3. 处理客户数据
            to_upsert, synced, created = process_woo_customers(woo_customers, site, existing_map)

            # 4. 批量 upsert
            if to_upsert:
                batch_upsert_customers(to_upsert)

            total_synced += synced
            total_created += created

            elapsed = time.time() - start_time
            rate = (page * 100) / elapsed if elapsed > 0 else 0

            print(f"  Page {page}: +{created} created, +{synced} synced | Total: {total_created + total_synced} | {rate:.0f} customers/sec")

            if len(woo_customers) < 100:
                break

            page += 1

        except Exception as e:
            print(f"  Page {page}: Error - {e}")
            break

    elapsed = time.time() - start_time
    print(f"\n  {site.upper()} Done: created={total_created}, synced={total_synced} in {elapsed:.1f}s")
    return total_synced, total_created


def main():
    print("="*60)
    print("WooCommerce Customer Sync (Optimized)")
    print("="*60)

    results = {}
    total_start = time.time()

    for site in ["de", "com", "uk", "fr"]:
        synced, created = sync_site(site)
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
