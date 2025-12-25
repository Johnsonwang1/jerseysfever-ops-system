#!/usr/bin/env python3
"""
同步 Mailchimp 订阅客户到 Supabase customers 表
- 读取 Mailchimp 导出的 subscribed CSV 文件
- 对比数据库中现有客户
- 只导入新客户（不更新现有客户）
"""

import csv
import sys
from supabase import create_client, Client

# Supabase 配置
SUPABASE_URL = "https://iwzohjbvuhwvfidyevpf.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NjQ4OTAsImV4cCI6MjA4MDI0MDg5MH0.82F_hoRBAWLUAUzv-7-rM0-EhoaUNb4G5jhxbcH-MIo"

# Mailchimp CSV 文件路径
MAILCHIMP_CSV = "/Users/yushengwang/Desktop/Python Project/jerseysfever/jerseysfever-ops-system/mailchip_client/subscribed_email_audience_export_080fa1e782.csv"

# 国家代码到站点的映射
COUNTRY_SITE_MAPPING = {
    'DE': 'de', 'AT': 'de', 'CH': 'de', 'NL': 'de',
    'GB': 'uk', 'UK': 'uk', 'IE': 'uk',
    'FR': 'fr', 'BE': 'fr', 'LU': 'fr',
    'IT': 'com', 'ES': 'com', 'PT': 'com', 'US': 'com',
}

# 邮箱域名后缀到站点的映射
EMAIL_DOMAIN_SITE_MAPPING = {
    '.de': 'de', '.uk': 'uk', '.co.uk': 'uk', '.fr': 'fr',
}


def parse_address(address_str: str) -> dict:
    """解析 Mailchimp 地址字符串"""
    if not address_str:
        return {}
    
    parts = [p.strip() for p in address_str.split('  ') if p.strip()]
    result = {}
    
    if len(parts) >= 1:
        result['address_1'] = parts[0]
    if len(parts) >= 2:
        result['city'] = parts[1]
    if len(parts) >= 3:
        remaining = parts[2:]
        if remaining:
            last = remaining[-1]
            if len(last) == 2 and last.isalpha():
                result['country'] = last.upper()
                remaining = remaining[:-1]
            if remaining:
                if len(remaining) == 1:
                    result['postcode'] = remaining[0]
                elif len(remaining) >= 2:
                    result['state'] = remaining[0]
                    result['postcode'] = remaining[1]
    
    return result


def determine_site(row: dict) -> tuple[str, str, str]:
    """确定客户应分配到哪个站点"""
    # 1. 从地址国家
    address = row.get('Address', '')
    if address:
        parsed = parse_address(address)
        country = parsed.get('country')
        if country and country.upper() in COUNTRY_SITE_MAPPING:
            return COUNTRY_SITE_MAPPING[country.upper()], 'address', f"Country: {country}"
    
    # 2. 从 CC 字段
    cc = row.get('CC', '').upper()
    if cc and cc in COUNTRY_SITE_MAPPING:
        return COUNTRY_SITE_MAPPING[cc], 'address', f"CC: {cc}"
    
    # 3. 从邮箱域名
    email = row.get('Email Address', '').lower()
    for domain, site in EMAIL_DOMAIN_SITE_MAPPING.items():
        if email.endswith(domain):
            return site, 'email_domain', f"Email: {domain}"
    
    # 4. 从 tags (使用 manual 作为 method，因为是基于 Mailchimp 标签手动分配)
    tags = row.get('TAGS', '').lower()
    if 'jerseysfever de' in tags:
        return 'de', 'manual', 'Mailchimp tag: DE'
    if 'jerseysfever uk' in tags:
        return 'uk', 'manual', 'Mailchimp tag: UK'
    if 'jerseysfever fr' in tags:
        return 'fr', 'manual', 'Mailchimp tag: FR'
    
    # 5. 默认 (使用 manual 作为 method)
    return 'com', 'manual', 'Default assignment'


def read_mailchimp_csv(filepath: str) -> list[dict]:
    """读取 Mailchimp CSV"""
    customers = []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get('Email Address', '').strip().lower()
            if not email or '@' not in email:
                continue
            
            parsed_address = parse_address(row.get('Address', ''))
            assigned_site, method, reason = determine_site(row)
            
            first_name = (row.get('First Name', '') or '').strip() or None
            last_name = (row.get('Last Name', '') or '').strip() or None
            phone = (row.get('Phone Number', '') or '').strip() or None
            
            country = parsed_address.get('country', '') or row.get('CC', '')
            
            billing_address = {
                'first_name': first_name or '',
                'last_name': last_name or '',
                'address_1': parsed_address.get('address_1', ''),
                'address_2': '',
                'city': parsed_address.get('city', ''),
                'state': parsed_address.get('state', ''),
                'postcode': parsed_address.get('postcode', ''),
                'country': country.upper() if country else '',
                'email': email,
                'phone': phone or '',
            }
            
            customers.append({
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'phone': phone,
                'billing_address': billing_address,
                'shipping_address': billing_address.copy(),
                'assigned_site': assigned_site,
                'assignment_method': method,
                'assignment_reason': reason,
            })
    
    return customers


def get_all_existing_emails(supabase: Client) -> set:
    """使用 RPC 或分页获取所有现有邮箱"""
    print("   正在获取数据库中所有客户邮箱...")
    
    emails = set()
    last_email = ''
    batch_count = 0
    
    while True:
        # 使用 email 排序和过滤来分页
        query = supabase.table('customers').select('email').order('email').limit(1000)
        if last_email:
            query = query.gt('email', last_email)
        
        response = query.execute()
        
        if not response.data:
            break
        
        for row in response.data:
            emails.add(row['email'].lower())
        
        last_email = response.data[-1]['email']
        batch_count += 1
        print(f"   已获取 {len(emails)} 个邮箱 (批次 {batch_count})...")
        
        if len(response.data) < 1000:
            break
    
    return emails


def insert_customers_one_by_one(supabase: Client, customers: list[dict], existing_emails: set) -> tuple[int, int, int]:
    """逐个插入新客户，跳过已存在的"""
    inserted = 0
    skipped = 0
    errors = 0
    total = len(customers)
    
    for i, customer in enumerate(customers):
        email = customer['email'].lower()
        
        # 跳过已存在的
        if email in existing_emails:
            skipped += 1
            continue
        
        try:
            insert_data = {
                'email': email,
                'first_name': customer['first_name'],
                'last_name': customer['last_name'],
                'phone': customer['phone'],
                'billing_address': customer['billing_address'],
                'shipping_address': customer['shipping_address'],
                'assigned_site': customer['assigned_site'],
                'assignment_method': customer['assignment_method'],
                'assignment_reason': customer['assignment_reason'],
                'migration_status': 'pending',
            }
            
            supabase.table('customers').insert(insert_data).execute()
            inserted += 1
            existing_emails.add(email)  # 添加到已存在列表防止重复
            
            if inserted % 100 == 0:
                print(f"   ✅ 已插入 {inserted} 个新客户 (进度: {i+1}/{total})")
                
        except Exception as e:
            error_msg = str(e)
            if '409' in error_msg or 'duplicate' in error_msg.lower():
                skipped += 1
                existing_emails.add(email)
            elif '400' in error_msg:
                # 400 错误通常是数据问题，跳过
                skipped += 1
            else:
                errors += 1
                if errors <= 5:  # 只打印前5个错误
                    print(f"   ❌ 错误 [{email}]: {error_msg[:200]}")
    
    return inserted, skipped, errors


def main():
    print("=" * 60)
    print("Mailchimp 客户同步工具 v2")
    print("=" * 60)
    
    # 1. 读取 Mailchimp CSV
    print(f"\n📂 正在读取 Mailchimp CSV 文件...")
    mailchimp_customers = read_mailchimp_csv(MAILCHIMP_CSV)
    print(f"   找到 {len(mailchimp_customers)} 个有效订阅客户")
    
    # 2. 连接 Supabase
    print(f"\n🔗 正在连接 Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 3. 获取现有客户邮箱
    print(f"\n📊 正在获取数据库中现有客户...")
    existing_emails = get_all_existing_emails(supabase)
    print(f"   数据库中有 {len(existing_emails)} 个客户")
    
    # 4. 统计新客户
    mailchimp_emails = {c['email'].lower() for c in mailchimp_customers}
    new_emails = mailchimp_emails - existing_emails
    
    print(f"\n📈 对比结果:")
    print(f"   Mailchimp 订阅客户: {len(mailchimp_emails)}")
    print(f"   数据库现有客户: {len(existing_emails)}")
    print(f"   新客户数量: {len(new_emails)}")
    
    if not new_emails:
        print("\n✨ 没有新客户需要导入!")
        return
    
    # 5. 站点分配统计
    site_stats = {'de': 0, 'uk': 0, 'fr': 0, 'com': 0}
    for customer in mailchimp_customers:
        if customer['email'].lower() in new_emails:
            site_stats[customer['assigned_site']] = site_stats.get(customer['assigned_site'], 0) + 1
    
    print(f"\n📍 新客户站点分配:")
    for site, count in sorted(site_stats.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"   {site}: {count}")
    
    # 6. 确认
    if '--yes' not in sys.argv and '-y' not in sys.argv:
        confirm = input(f"\n❓ 是否导入 {len(new_emails)} 个新客户? (y/n): ")
        if confirm.lower() != 'y':
            print("❌ 已取消")
            return
    else:
        print(f"\n✅ 自动确认导入...")
    
    # 7. 执行导入
    print(f"\n🚀 开始导入新客户...")
    inserted, skipped, errors = insert_customers_one_by_one(supabase, mailchimp_customers, existing_emails)
    
    print(f"\n" + "=" * 60)
    print(f"✅ 导入完成!")
    print(f"   新增: {inserted}")
    print(f"   跳过(已存在): {skipped}")
    print(f"   错误: {errors}")
    print("=" * 60)


if __name__ == '__main__':
    main()
