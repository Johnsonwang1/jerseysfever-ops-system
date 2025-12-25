#!/usr/bin/env python3
"""
将最近导入的新 DE 客户写入 Klaviyo
只处理最近 1 小时内创建的 assigned_site='de' 的客户
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


def get_new_de_customers(hours: int = 1):
    """从 Supabase 获取最近 N 小时内创建的 DE 客户"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 获取最近 N 小时内创建的 DE 客户
    response = supabase.table('customers') \
        .select('email, first_name, last_name, phone, billing_address, shipping_address, assigned_site, order_stats') \
        .eq('assigned_site', 'de') \
        .gte('created_at', f'now() - interval \'{hours} hours\'') \
        .execute()
    
    return response.data or []


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
        "source": "mailchimp_import",
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
                print(f"  ✅ 批次成功: {len(batch)} 个客户")
            else:
                total_failed += len(batch)
                print(f"  ❌ 批次失败 ({response.status_code}): {response.text[:200]}")
        except Exception as e:
            total_failed += len(batch)
            print(f"  ❌ 批次错误: {e}")
        
        time.sleep(0.5)  # 避免 API 限流
    
    return total_submitted, total_failed


def main():
    if len(sys.argv) < 2:
        print("用法: python klaviyo_import_new_de_customers.py <klaviyo_api_key> [hours]")
        print("示例: python klaviyo_import_new_de_customers.py pk_xxx 1")
        print("      - hours: 获取最近 N 小时内的新客户 (默认 1)")
        sys.exit(1)
    
    api_key = sys.argv[1]
    hours = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    
    print("=" * 60)
    print(f"导入最近 {hours} 小时内的新 DE 客户到 Klaviyo")
    print("=" * 60)
    
    # 1. 获取新客户
    print(f"\n[1/2] 从 Supabase 获取新 DE 客户...")
    customers = get_new_de_customers(hours)
    print(f"   找到 {len(customers)} 个新 DE 客户")
    
    if not customers:
        print("\n✨ 没有新客户需要导入!")
        return
    
    # 显示前几个
    print(f"\n   前 5 个客户预览:")
    for c in customers[:5]:
        print(f"   - {c['email']} ({c.get('first_name', '')} {c.get('last_name', '')})")
    
    # 2. 确认
    if '--yes' not in sys.argv and '-y' not in sys.argv:
        confirm = input(f"\n❓ 确认导入 {len(customers)} 个客户到 Klaviyo? (y/n): ")
        if confirm.lower() != 'y':
            print("❌ 已取消")
            return
    else:
        print(f"\n✅ 自动确认导入...")
    
    # 3. 导入
    print(f"\n[2/2] 导入到 Klaviyo...")
    submitted, failed = import_to_klaviyo(api_key, customers)
    
    print(f"\n" + "=" * 60)
    print(f"✅ 导入完成!")
    print(f"   成功提交: {submitted}")
    print(f"   失败: {failed}")
    print("=" * 60)


if __name__ == '__main__':
    main()

