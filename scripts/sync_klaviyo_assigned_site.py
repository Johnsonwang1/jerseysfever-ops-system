#!/usr/bin/env python3
"""
同步 assigned_site 到 Klaviyo Profile
给每个客户的 Klaviyo Profile 添加 assigned_site 自定义属性
"""

import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')
KLAVIYO_API_KEY = os.getenv('KLAVIYO_API_KEY')

KLAVIYO_API_URL = "https://a.klaviyo.com/api"


def get_all_customers():
    """从 Supabase 获取所有有 assigned_site 的客户"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_customers = []
    offset = 0
    batch_size = 2000

    while True:
        result = supabase.rpc('get_customers_by_site_for_klaviyo', {
            'batch_offset': offset,
            'batch_limit': batch_size
        }).execute()

        data = result.data or []
        if not data:
            break

        all_customers.extend(data)
        offset += len(data)

        if len(data) < batch_size:
            break

    return all_customers


def update_klaviyo_profile(email: str, assigned_site: str, first_name: str = None, last_name: str = None):
    """更新或创建 Klaviyo Profile，添加 assigned_site 属性"""

    headers = {
        "Authorization": f"Klaviyo-API-Key {KLAVIYO_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "revision": "2024-02-15"
    }

    # 构建 Profile 数据
    profile_data = {
        "data": {
            "type": "profile",
            "attributes": {
                "email": email,
                "properties": {
                    "assigned_site": assigned_site
                }
            }
        }
    }

    # 添加姓名（如果有）
    if first_name:
        profile_data["data"]["attributes"]["first_name"] = first_name
    if last_name:
        profile_data["data"]["attributes"]["last_name"] = last_name

    # 使用 Create or Update Profile API
    url = f"{KLAVIYO_API_URL}/profile-import/"

    try:
        response = requests.post(url, json=profile_data, headers=headers, timeout=30)

        if response.status_code in [200, 201, 202]:
            return True
        else:
            return False
    except Exception as e:
        print(f"Error updating {email}: {e}")
        return False


def bulk_update_klaviyo_profiles(customers: list):
    """批量更新 Klaviyo Profiles"""

    headers = {
        "Authorization": f"Klaviyo-API-Key {KLAVIYO_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "revision": "2024-02-15"
    }

    # Klaviyo 批量 API 每次最多 100 个
    BATCH_SIZE = 100
    total_updated = 0
    total_failed = 0

    for i in range(0, len(customers), BATCH_SIZE):
        batch = customers[i:i+BATCH_SIZE]

        profiles = []
        for c in batch:
            profile = {
                "type": "profile",
                "attributes": {
                    "email": c['email'],
                    "properties": {
                        "assigned_site": c['assigned_site']
                    }
                }
            }
            if c.get('first_name'):
                profile["attributes"]["first_name"] = c['first_name']
            if c.get('last_name'):
                profile["attributes"]["last_name"] = c['last_name']

            profiles.append(profile)

        # 批量导入 API
        url = f"{KLAVIYO_API_URL}/profile-bulk-import-jobs/"
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
                total_updated += len(batch)
            else:
                total_failed += len(batch)
                print(f"Batch failed: {response.status_code} - {response.text[:200]}")
        except Exception as e:
            total_failed += len(batch)
            print(f"Batch error: {e}")

        # 显示进度
        progress = i + len(batch)
        print(f"进度: {progress}/{len(customers)} ({progress*100//len(customers)}%)", flush=True)

        # 避免 API 限流
        time.sleep(0.5)

    return total_updated, total_failed


def main():
    if not KLAVIYO_API_KEY:
        print("错误: 请设置 KLAVIYO_API_KEY 环境变量")
        print("在 .env 文件中添加: KLAVIYO_API_KEY=your_private_api_key")
        sys.exit(1)

    print("="*60)
    print("同步 assigned_site 到 Klaviyo")
    print("="*60)

    # 获取客户数据
    print("\n[1/2] 从 Supabase 获取客户数据...")
    customers = get_all_customers()
    print(f"共 {len(customers)} 个客户")

    if not customers:
        print("没有客户数据")
        return

    # 统计
    by_site = {}
    for c in customers:
        site = c.get('assigned_site', 'unknown')
        by_site[site] = by_site.get(site, 0) + 1

    print("\n按站点分布:")
    for site, count in sorted(by_site.items(), key=lambda x: -x[1]):
        print(f"  {site}: {count}")

    # 确认
    confirm = input("\n确认同步到 Klaviyo? (y/n): ")
    if confirm.lower() != 'y':
        print("取消")
        return

    # 同步
    print("\n[2/2] 同步到 Klaviyo...")
    updated, failed = bulk_update_klaviyo_profiles(customers)

    print("\n" + "="*60)
    print("完成!")
    print(f"  成功: {updated}")
    print(f"  失败: {failed}")
    print("="*60)


if __name__ == '__main__':
    main()
