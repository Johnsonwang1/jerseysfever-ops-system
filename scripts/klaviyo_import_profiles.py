#!/usr/bin/env python3
"""
导入客户 Profile 到 Klaviyo，添加 assigned_site 属性
"""

import os
import sys
import time
import json
import requests
from dotenv import load_dotenv
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')

KLAVIYO_API_URL = "https://a.klaviyo.com/api"


def get_customers_by_site(site: str):
    """从 Supabase 获取指定站点的客户 (使用 RPC)"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_customers = []
    offset = 0
    batch_size = 500

    while True:
        result = supabase.rpc('get_customers_for_klaviyo', {
            'target_site': site,
            'batch_offset': offset,
            'batch_limit': batch_size
        }).execute()

        data = result.data or []
        if not data:
            break

        all_customers.extend(data)
        print(f"  已获取 {len(all_customers)} 个客户...", flush=True)
        offset += batch_size

        if len(data) < batch_size:
            break

    return all_customers


def bulk_import_profiles(api_key: str, customers: list):
    """批量导入 Profiles 到 Klaviyo"""

    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "revision": "2024-10-15"
    }

    # Klaviyo 批量 API 每次最多 10000 个，但建议用小批次
    BATCH_SIZE = 100
    total_submitted = 0
    total_failed = 0
    job_ids = []

    for i in range(0, len(customers), BATCH_SIZE):
        batch = customers[i:i+BATCH_SIZE]

        profiles = []
        for c in batch:
            # 国家代码转全名
            COUNTRY_NAMES = {
                'GB': 'United Kingdom', 'UK': 'United Kingdom',
                'DE': 'Germany', 'FR': 'France', 'US': 'United States',
                'ES': 'Spain', 'IT': 'Italy', 'NL': 'Netherlands',
                'BE': 'Belgium', 'AT': 'Austria', 'CH': 'Switzerland',
                'IE': 'Ireland', 'PT': 'Portugal', 'PL': 'Poland',
                'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark',
                'FI': 'Finland', 'AU': 'Australia', 'CA': 'Canada',
                'NZ': 'New Zealand', 'JP': 'Japan', 'CN': 'China',
            }

            # Locale 映射
            SITE_LOCALE = {
                'uk': 'en-GB', 'com': 'en-US', 'de': 'de-DE', 'fr': 'fr-FR'
            }

            # 基本属性
            attrs = {
                "email": c['email'],
                "external_id": c['email'],  # 用 email 作为外部 ID
            }

            if c.get('first_name'):
                attrs["first_name"] = c['first_name']
            if c.get('last_name'):
                attrs["last_name"] = c['last_name']
            if c.get('phone'):
                # 格式化电话号码 (E.164)
                phone = c['phone'].replace(' ', '').replace('-', '')
                if not phone.startswith('+'):
                    # 根据站点添加国家代码
                    if c.get('assigned_site') == 'uk':
                        phone = '+44' + phone.lstrip('0')
                    elif c.get('assigned_site') == 'de':
                        phone = '+49' + phone.lstrip('0')
                    elif c.get('assigned_site') == 'fr':
                        phone = '+33' + phone.lstrip('0')
                    else:
                        phone = '+1' + phone
                attrs["phone_number"] = phone

            # Locale
            site = c.get('assigned_site', '')
            if site in SITE_LOCALE:
                attrs["locale"] = SITE_LOCALE[site]

            # 地址信息 (从 billing_address)
            billing = c.get('billing_address') or {}
            if billing.get('city') or billing.get('country'):
                country_code = billing.get('country', '')
                country_name = COUNTRY_NAMES.get(country_code, country_code)

                location = {}
                if billing.get('address_1'):
                    location["address1"] = billing['address_1']
                if billing.get('address_2'):
                    location["address2"] = billing['address_2']
                if billing.get('city'):
                    location["city"] = billing['city']
                if billing.get('state'):
                    location["region"] = billing['state']
                if billing.get('postcode'):
                    location["zip"] = billing['postcode']
                if country_name:
                    location["country"] = country_name

                if location:
                    attrs["location"] = location

            # 自定义属性 (properties)
            properties = {
                "assigned_site": c.get('assigned_site', ''),
            }

            # 国家代码
            if billing.get('country'):
                properties["country_code"] = billing['country']

            # 订单统计
            order_stats = c.get('order_stats') or {}
            if order_stats:
                if order_stats.get('total_orders'):
                    properties["total_orders"] = order_stats['total_orders']
                if order_stats.get('total_spent'):
                    properties["total_spent"] = float(order_stats['total_spent'])
                if order_stats.get('last_order_date'):
                    properties["last_order_date"] = order_stats['last_order_date']
                if order_stats.get('first_order_date'):
                    properties["first_order_date"] = order_stats['first_order_date']
                if order_stats.get('average_order_value'):
                    properties["average_order_value"] = float(order_stats['average_order_value'])

            attrs["properties"] = properties

            profile = {
                "type": "profile",
                "attributes": attrs
            }

            profiles.append(profile)

        # 批量导入 API
        url = f"{KLAVIYO_API_URL}/profile-bulk-import-jobs"
        payload = {
            "data": {
                "type": "profile-bulk-import-job",
                "attributes": {
                    "profiles": {
                        "data": profiles
                    }
                }
            }
        }

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=60)

            if response.status_code in [200, 201, 202]:
                result = response.json()
                job_id = result.get('data', {}).get('id')
                if job_id:
                    job_ids.append(job_id)
                total_submitted += len(batch)
            else:
                total_failed += len(batch)
                print(f"  批次失败 ({response.status_code}): {response.text[:200]}")
        except Exception as e:
            total_failed += len(batch)
            print(f"  批次错误: {e}")

        # 显示进度
        progress = i + len(batch)
        pct = progress * 100 // len(customers)
        print(f"  进度: {progress}/{len(customers)} ({pct}%)", flush=True)

        # 避免 API 限流
        time.sleep(0.5)

    return total_submitted, total_failed, job_ids


def main():
    if len(sys.argv) < 3:
        print("用法: python3 klaviyo_import_profiles.py <site> <api_key>")
        print("示例: python3 klaviyo_import_profiles.py uk pk_xxx")
        sys.exit(1)

    site = sys.argv[1]
    api_key = sys.argv[2]

    print("=" * 60)
    print(f"导入 {site.upper()} 客户到 Klaviyo")
    print("=" * 60)

    # 获取客户数据
    print(f"\n[1/2] 从 Supabase 获取 assigned_site={site} 的客户...")
    customers = get_customers_by_site(site)
    print(f"共 {len(customers)} 个客户")

    if not customers:
        print("没有客户数据")
        return

    # 确认
    print(f"\n前 5 个客户:")
    for c in customers[:5]:
        print(f"  - {c['email']} ({c.get('first_name', '')} {c.get('last_name', '')})")

    confirm = input(f"\n确认导入 {len(customers)} 个客户到 Klaviyo? (y/n): ")
    if confirm.lower() != 'y':
        print("取消")
        return

    # 导入
    print(f"\n[2/2] 导入到 Klaviyo...")
    submitted, failed, job_ids = bulk_import_profiles(api_key, customers)

    print("\n" + "=" * 60)
    print("完成!")
    print(f"  提交: {submitted}")
    print(f"  失败: {failed}")
    if job_ids:
        print(f"  Job IDs: {len(job_ids)} 个任务已创建")
    print("=" * 60)


if __name__ == '__main__':
    main()
