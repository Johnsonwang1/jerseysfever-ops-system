#!/usr/bin/env python3
"""
同步 DE 客户到 Klaviyo
- 从 Supabase 获取所有 DE 客户
- 从 Klaviyo 获取已有客户
- 对比后只导入新客户
"""

import sys
import time
import requests
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

# Supabase 配置
SUPABASE_URL = "https://iwzohjbvuhwvfidyevpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjQ4OTAsImV4cCI6MjA4MDI0MDg5MH0.82F_hoRBAWLUAUzv-7-rM0-EhoaUNb4G5jhxbcH-MIo"

KLAVIYO_API_URL = "https://a.klaviyo.com/api"

# 国家代码转全名
COUNTRY_NAMES = {
    'GB': 'United Kingdom', 'UK': 'United Kingdom',
    'DE': 'Germany', 'FR': 'France', 'US': 'United States',
    'ES': 'Spain', 'IT': 'Italy', 'NL': 'Netherlands',
    'BE': 'Belgium', 'AT': 'Austria', 'CH': 'Switzerland',
    'IE': 'Ireland', 'PT': 'Portugal', 'PL': 'Poland',
    'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark',
}


def get_all_de_customers():
    """从 Supabase 获取所有 DE 客户"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    all_customers = []
    last_email = ''
    
    print("   正在获取 Supabase DE 客户...")
    
    while True:
        query = supabase.table('customers') \
            .select('email, first_name, last_name, phone, billing_address, shipping_address, assigned_site, order_stats') \
            .eq('assigned_site', 'de') \
            .order('email') \
            .limit(1000)
        
        if last_email:
            query = query.gt('email', last_email)
        
        response = query.execute()
        
        if not response.data:
            break
        
        all_customers.extend(response.data)
        last_email = response.data[-1]['email']
        print(f"   已获取 {len(all_customers)} 个客户...")
        
        if len(response.data) < 1000:
            break
    
    return all_customers


def get_klaviyo_profiles(api_key: str) -> set:
    """从 Klaviyo 获取所有 Profile 的 email"""
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "Accept": "application/json",
        "revision": "2024-10-15"
    }
    
    emails = set()
    next_cursor = None
    page = 0
    
    print("   正在获取 Klaviyo 已有客户...")
    
    while True:
        url = f"{KLAVIYO_API_URL}/profiles"
        params = {
            "page[size]": 100,
            "fields[profile]": "email"
        }
        
        if next_cursor:
            params["page[cursor]"] = next_cursor
        
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            
            if response.status_code != 200:
                print(f"   ❌ Klaviyo API 错误 ({response.status_code}): {response.text[:200]}")
                break
            
            data = response.json()
            profiles = data.get('data', [])
            
            for profile in profiles:
                email = profile.get('attributes', {}).get('email', '').lower()
                if email:
                    emails.add(email)
            
            page += 1
            print(f"   已获取 {len(emails)} 个 Klaviyo 客户 (第 {page} 页)...")
            
            # 检查是否有下一页
            links = data.get('links', {})
            next_url = links.get('next')
            
            if not next_url or not profiles:
                break
            
            # 提取 cursor
            if 'page[cursor]=' in next_url:
                next_cursor = next_url.split('page[cursor]=')[1].split('&')[0]
            else:
                break
            
            time.sleep(0.3)  # 避免限流
            
        except Exception as e:
            print(f"   ❌ 获取 Klaviyo 客户错误: {e}")
            break
    
    return emails


def build_klaviyo_profile(customer: dict) -> dict:
    """构建 Klaviyo Profile 数据"""
    attrs = {
        "email": customer['email'],
        "external_id": customer['email'],
    }
    
    if customer.get('first_name'):
        attrs["first_name"] = customer['first_name']
    if customer.get('last_name'):
        attrs["last_name"] = customer['last_name']
    
    # 电话号码 (格式化为 E.164)
    if customer.get('phone'):
        phone = customer['phone'].replace(' ', '').replace('-', '')
        if not phone.startswith('+'):
            phone = '+49' + phone.lstrip('0')  # DE 客户默认 +49
        attrs["phone_number"] = phone
    
    # Locale
    attrs["locale"] = "de-DE"
    
    # 地址信息
    billing = customer.get('billing_address') or {}
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
    
    # 自定义属性
    properties = {
        "assigned_site": "de",
    }
    
    if billing.get('country'):
        properties["country_code"] = billing['country']
    
    # 订单统计
    order_stats = customer.get('order_stats') or {}
    if order_stats:
        if order_stats.get('total_orders'):
            properties["total_orders"] = order_stats['total_orders']
        if order_stats.get('total_spent'):
            properties["total_spent"] = float(order_stats['total_spent'])
        if order_stats.get('last_order_date'):
            properties["last_order_date"] = order_stats['last_order_date']
        if order_stats.get('first_order_date'):
            properties["first_order_date"] = order_stats['first_order_date']
    
    attrs["properties"] = properties
    
    return {
        "type": "profile",
        "attributes": attrs
    }


def import_to_klaviyo(api_key: str, customers: list) -> tuple[int, int]:
    """批量导入客户到 Klaviyo"""
    headers = {
        "Authorization": f"Klaviyo-API-Key {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "revision": "2024-10-15"
    }
    
    BATCH_SIZE = 100
    total_submitted = 0
    total_failed = 0
    
    for i in range(0, len(customers), BATCH_SIZE):
        batch = customers[i:i+BATCH_SIZE]
        
        profiles = [build_klaviyo_profile(c) for c in batch]
        
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
                total_submitted += len(batch)
            else:
                total_failed += len(batch)
                print(f"   ❌ 批次失败 ({response.status_code}): {response.text[:200]}")
        except Exception as e:
            total_failed += len(batch)
            print(f"   ❌ 批次错误: {e}")
        
        # 显示进度
        progress = i + len(batch)
        pct = progress * 100 // len(customers)
        print(f"   进度: {progress}/{len(customers)} ({pct}%)", flush=True)
        
        time.sleep(0.5)  # 避免 API 限流
    
    return total_submitted, total_failed


def main():
    if len(sys.argv) < 2:
        print("用法: python klaviyo_sync_de_customers.py <klaviyo_api_key> [--yes]")
        print("示例: python klaviyo_sync_de_customers.py pk_xxx --yes")
        sys.exit(1)
    
    api_key = sys.argv[1]
    auto_confirm = '--yes' in sys.argv or '-y' in sys.argv
    
    print("=" * 60)
    print("同步 DE 客户到 Klaviyo (只导入新客户)")
    print("=" * 60)
    
    # 1. 获取 Supabase DE 客户
    print(f"\n[1/3] 从 Supabase 获取 DE 客户...")
    supabase_customers = get_all_de_customers()
    supabase_emails = {c['email'].lower() for c in supabase_customers}
    print(f"   共 {len(supabase_emails)} 个 DE 客户")
    
    # 2. 获取 Klaviyo 已有客户
    print(f"\n[2/3] 从 Klaviyo 获取已有客户...")
    klaviyo_emails = get_klaviyo_profiles(api_key)
    print(f"   共 {len(klaviyo_emails)} 个 Klaviyo 客户")
    
    # 3. 找出新客户
    new_emails = supabase_emails - klaviyo_emails
    new_customers = [c for c in supabase_customers if c['email'].lower() in new_emails]
    
    print(f"\n📊 对比结果:")
    print(f"   Supabase DE 客户: {len(supabase_emails)}")
    print(f"   Klaviyo 已有客户: {len(klaviyo_emails)}")
    print(f"   需要导入的新客户: {len(new_customers)}")
    
    if not new_customers:
        print("\n✨ 没有新客户需要导入!")
        return
    
    # 显示前几个
    print(f"\n   新客户预览 (前 10 个):")
    for c in new_customers[:10]:
        print(f"   - {c['email']} ({c.get('first_name', '')} {c.get('last_name', '')})")
    
    # 确认
    if not auto_confirm:
        confirm = input(f"\n❓ 确认导入 {len(new_customers)} 个新客户到 Klaviyo? (y/n): ")
        if confirm.lower() != 'y':
            print("❌ 已取消")
            return
    else:
        print(f"\n✅ 自动确认导入...")
    
    # 4. 导入
    print(f"\n[3/3] 导入新客户到 Klaviyo...")
    submitted, failed = import_to_klaviyo(api_key, new_customers)
    
    print(f"\n" + "=" * 60)
    print(f"✅ 导入完成!")
    print(f"   成功提交: {submitted}")
    print(f"   失败: {failed}")
    print("=" * 60)


if __name__ == '__main__':
    main()

