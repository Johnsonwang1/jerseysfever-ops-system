#!/usr/bin/env python3
"""
重建 wp_wc_customer_lookup 表
按 assigned_site 分配客户到各站点
"""

import subprocess
import os
import sys
import json
from dotenv import load_dotenv
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')

SITE_SSH = {
    'de': {'host': 'siteground', 'path': 'www/jerseysfever.de/public_html'},
    'com': {'host': 'siteground-com', 'path': 'www/jerseysfever.com/public_html'},
    'uk': {'host': 'siteground-uk', 'path': 'www/jerseysfever.uk/public_html'},
    'fr': {'host': 'siteground-fr', 'path': 'www/jerseysfever.fr/public_html'},
}


def get_customers_for_site(site: str) -> list:
    """从 Supabase 获取该站点的客户 (使用 RPC 函数)"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_customers = []
    offset = 0
    batch_size = 500  # Supabase RPC 有行数限制，用小批次

    while True:
        result = supabase.rpc('get_customers_by_site', {
            'target_site': site,
            'batch_offset': offset,
            'batch_limit': batch_size
        }).execute()

        data = result.data or []
        if not data:
            break

        all_customers.extend(data)
        offset += batch_size  # 固定增加 offset

        if len(data) < batch_size:
            break

    return all_customers


def clear_customer_lookup(site: str):
    """清空 wp_wc_customer_lookup 表"""
    config = SITE_SSH[site]
    cmd = f"ssh {config['host']} 'cd {config['path']} && wp db query \"TRUNCATE TABLE wp_wc_customer_lookup\"'"
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
    return result.returncode == 0


def escape_sql(value):
    """转义 SQL 字符串"""
    if value is None:
        return ''
    return str(value).replace("'", "''").replace("\\", "\\\\")


def insert_customers_batch(site: str, customers: list) -> int:
    """批量插入客户到 wp_wc_customer_lookup - 使用临时文件"""
    if not customers:
        return 0

    config = SITE_SSH[site]
    inserted = 0
    BATCH = 50  # 每批 50 条，避免命令行过长

    for i in range(0, len(customers), BATCH):
        batch = customers[i:i+BATCH]

        # 构建 INSERT 语句
        values = []
        for c in batch:
            email = escape_sql(c.get('email', ''))
            first_name = escape_sql(c.get('first_name', ''))
            last_name = escape_sql(c.get('last_name', ''))
            country = escape_sql(c.get('country', ''))
            city = escape_sql(c.get('city', ''))
            postcode = escape_sql(c.get('postcode', ''))
            state = escape_sql(c.get('state', ''))

            values.append(f"(NULL, '', '{first_name}', '{last_name}', '{email}', NULL, NULL, '{country}', '{postcode}', '{city}', '{state}')")

        sql = f"INSERT INTO wp_wc_customer_lookup (user_id, username, first_name, last_name, email, date_last_active, date_registered, country, postcode, city, state) VALUES {','.join(values)};"

        # 写入本地临时文件
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
            f.write(sql)
            tmp_file = f.name

        try:
            # 上传并执行 SQL
            remote_tmp = f"/tmp/insert_{site}_{i}.sql"
            # 上传文件
            upload_cmd = f"cat {tmp_file} | ssh {config['host']} 'cat > {remote_tmp}'"
            subprocess.run(upload_cmd, shell=True, capture_output=True, timeout=30)

            # 执行 SQL
            exec_cmd = f"ssh {config['host']} 'cd {config['path']} && wp db query < {remote_tmp} && rm {remote_tmp}'"
            result = subprocess.run(exec_cmd, shell=True, capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                inserted += len(batch)

            # 删除本地临时文件
            os.unlink(tmp_file)

        except Exception as e:
            print(f"[{site}] 批次 {i//BATCH + 1} 错误: {e}")
            try:
                os.unlink(tmp_file)
            except:
                pass

        # 显示进度（每 500 条）
        if (i + BATCH) % 500 == 0 or i + BATCH >= len(customers):
            print(f"[{site}] 进度: {min(i + BATCH, len(customers))}/{len(customers)}", flush=True)

    return inserted


def rebuild_site(site: str, dry_run: bool = False):
    """重建单个站点的 wp_wc_customer_lookup"""
    print(f"\n{'='*60}")
    print(f"重建 {site.upper()} 站点的 wp_wc_customer_lookup")
    print(f"{'='*60}")

    # 1. 获取客户
    print(f"[{site}] 从 Supabase 获取 assigned_site={site} 的客户...", flush=True)
    customers = get_customers_for_site(site)
    print(f"[{site}] 共 {len(customers)} 个客户", flush=True)

    if dry_run:
        print(f"[{site}] DRY RUN - 不执行实际操作")
        return {'site': site, 'customers': len(customers)}

    # 2. 清空表
    print(f"[{site}] 清空 wp_wc_customer_lookup 表...", flush=True)
    if not clear_customer_lookup(site):
        print(f"[{site}] 清空失败!")
        return {'site': site, 'customers': 0, 'inserted': 0}

    # 3. 插入客户
    print(f"[{site}] 插入 {len(customers)} 个客户...", flush=True)
    inserted = insert_customers_batch(site, customers)
    print(f"[{site}] 完成! 插入 {inserted} 个客户", flush=True)

    return {'site': site, 'customers': len(customers), 'inserted': inserted}


def main():
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    args = [a for a in args if a != '--dry-run']

    sites = args if args else ['de', 'com', 'uk', 'fr']

    print("="*60)
    print("重建 wp_wc_customer_lookup 表" + (" [DRY RUN]" if dry_run else ""))
    print(f"目标站点: {', '.join(sites)}")
    print("="*60)

    results = []
    for site in sites:
        r = rebuild_site(site, dry_run=dry_run)
        results.append(r)

    # 总结
    print("\n" + "="*60)
    print("总结")
    print("="*60)
    for r in results:
        if dry_run:
            print(f"  {r['site'].upper()}: 将导入 {r['customers']} 个客户")
        else:
            print(f"  {r['site'].upper()}: 导入 {r.get('inserted', 0)}/{r['customers']} 个客户")


if __name__ == '__main__':
    main()
