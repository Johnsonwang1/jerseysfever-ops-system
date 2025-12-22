#!/usr/bin/env python3
"""
从 WordPress 数据库直接同步客户到 Supabase
"""

import subprocess
import json
import requests
import sys
import argparse

sys.stdout.reconfigure(line_buffering=True)

SUPABASE_URL = "https://iwzohjbvuhwvfidyevpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY2NDg5MCwiZXhwIjoyMDgwMjQwODkwfQ.dmsBSx5WLphgT90N1BYxyRHqDegHHnlhtHg9yFXhDOw"

SSH_HOSTS = {
    "de": "siteground",
    "com": "siteground-com",
    "uk": "siteground-uk",
    "fr": "siteground-fr",
}

WP_PATHS = {
    "de": "www/jerseysfever.de/public_html",
    "com": "www/jerseysfever.com/public_html",
    "uk": "www/jerseysfever.uk/public_html",
    "fr": "www/jerseysfever.fr/public_html",
}

COUNTRY_TO_SITE = {
    "DE": "de", "AT": "de", "CH": "de", "LI": "de",
    "FR": "fr", "BE": "fr", "LU": "fr", "MC": "fr",
    "GB": "uk", "IE": "uk", "IM": "uk", "JE": "uk", "GG": "uk", "GI": "uk",
}

session = requests.Session()


def fetch_wp_customers(site: str, offset: int = 0, limit: int = 1000):
    """从 WordPress 数据库获取客户"""
    host = SSH_HOSTS[site]
    path = WP_PATHS[site]

    query = f"SELECT customer_id, user_id, first_name, last_name, email, date_last_active, date_registered, country, postcode, city, state FROM wp_wc_customer_lookup ORDER BY customer_id LIMIT {limit} OFFSET {offset}"

    cmd = ['ssh', host, f'cd {path} && wp db query "{query}" --skip-column-names']
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return []

    customers = []
    for line in result.stdout.strip().split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 11:
            customers.append({
                'customer_id': int(parts[0]) if parts[0] else None,
                'user_id': int(parts[1]) if parts[1] and parts[1] != 'NULL' else None,
                'first_name': parts[2] if parts[2] != 'NULL' else '',
                'last_name': parts[3] if parts[3] != 'NULL' else '',
                'email': parts[4].lower().strip() if parts[4] != 'NULL' else '',
                'date_last_active': parts[5] if parts[5] != 'NULL' else None,
                'date_registered': parts[6] if parts[6] != 'NULL' else None,
                'country': parts[7] if parts[7] != 'NULL' else '',
                'postcode': parts[8] if parts[8] != 'NULL' else '',
                'city': parts[9] if parts[9] != 'NULL' else '',
                'state': parts[10] if parts[10] != 'NULL' else '',
            })

    return customers


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
    # Smaller batches to avoid timeout
    for i in range(0, len(emails), 50):
        batch = emails[i:i+50]
        email_filter = ",".join(batch)

        try:
            response = session.get(
                url,
                params={"email": f"in.({email_filter})", "select": "email,woo_ids,assigned_site"},
                headers=headers,
                timeout=60
            )

            if response.status_code == 200:
                for row in response.json():
                    existing[row["email"]] = {
                        "woo_ids": row.get("woo_ids") or {},
                        "assigned_site": row.get("assigned_site")
                    }
        except Exception as e:
            print(f"    Warning: batch query failed: {e}")

    return existing


def batch_upsert(updates: list, creates: list) -> tuple:
    """批量 upsert"""
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

    return (False, "; ".join(errors)) if errors else (True, None)


def sync_site(site: str, batch_size: int = 1000):
    """同步单个站点"""
    print(f"\n{'='*60}")
    print(f"Syncing {site.upper()} from WordPress database")
    print(f"{'='*60}")

    offset = 0
    total_created = 0
    total_updated = 0
    all_processed = set()

    while True:
        print(f"  Fetching offset {offset}...")
        wp_customers = fetch_wp_customers(site, offset=offset, limit=batch_size)
        print(f"  Got {len(wp_customers)} customers from DB")

        if not wp_customers:
            break

        # Get emails
        emails = [c['email'] for c in wp_customers if c['email'] and c['email'] not in all_processed]
        existing = get_existing_customers(emails)

        updates = []
        creates = []

        for c in wp_customers:
            email = c['email']
            if not email or email in all_processed:
                continue

            all_processed.add(email)
            country = c['country']

            if email in existing:
                # Update woo_ids if customer_id exists
                current = existing[email]
                if c['customer_id']:
                    new_woo_ids = current["woo_ids"].copy()
                    new_woo_ids[site] = c['customer_id']
                    updates.append({
                        "email": email,
                        "woo_ids": new_woo_ids,
                    })
            else:
                # Create new customer
                assigned_site = COUNTRY_TO_SITE.get(country, "com") if country else None

                creates.append({
                    "email": email,
                    "first_name": c['first_name'],
                    "last_name": c['last_name'],
                    "woo_ids": {site: c['customer_id']} if c['customer_id'] else {},
                    "billing_address": {
                        "country": country,
                        "postcode": c['postcode'],
                        "city": c['city'],
                        "state": c['state'],
                    },
                    "shipping_address": {},
                    "assigned_site": assigned_site,
                    "assignment_method": "address" if assigned_site else None,
                    "assignment_confidence": 0.85 if assigned_site else None,
                    "assignment_reason": f"From WP database: {country}" if assigned_site else None,
                    "order_stats": {
                        "total_orders": 0, "total_spent": 0,
                        "valid_orders": 0, "valid_spent": 0,
                        "invalid_orders": 0, "invalid_spent": 0,
                        "first_order_date": None, "last_order_date": None,
                        "by_site": {},
                    },
                })

        # Batch upsert
        if updates or creates:
            success, error = batch_upsert(updates, creates)
            if success:
                total_updated += len(updates)
                total_created += len(creates)
                print(f"  Offset {offset}: +{len(creates)} new, +{len(updates)} updated")
            else:
                print(f"  [ERROR] {error}")
        else:
            print(f"  Offset {offset}: no new customers")

        # Allow some tolerance for parsing issues (99% threshold)
        if len(wp_customers) < batch_size * 0.9:
            print(f"  Ending: got {len(wp_customers)} < {int(batch_size * 0.9)}")
            break

        offset += batch_size
        print(f"  Continuing to offset {offset}...")

    print(f"\n  {site.upper()} Done: created={total_created}, updated={total_updated}")
    return total_updated, total_created


def main():
    parser = argparse.ArgumentParser(description='Sync customers from WordPress database')
    parser.add_argument('--site', type=str, choices=['de', 'com', 'uk', 'fr'])
    parser.add_argument('--batch', type=int, default=1000)
    args = parser.parse_args()

    print("="*60)
    print("WordPress Database -> Supabase Customer Sync")
    print("="*60)

    sites = [args.site] if args.site else ["de", "com", "uk", "fr"]

    for site in sites:
        sync_site(site, batch_size=args.batch)


if __name__ == "__main__":
    main()
