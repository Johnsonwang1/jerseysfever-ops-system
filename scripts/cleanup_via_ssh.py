#!/usr/bin/env python3
"""
通过 SSH + WP-CLI 直接删除 WooCommerce 客户
每500个删除 + 批量更新数据库
"""

import subprocess
import os
import sys
import time
from dotenv import load_dotenv
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')

# SSH 配置
SITE_SSH = {
    'de': {'host': 'siteground', 'path': 'www/jerseysfever.de/public_html'},
    'com': {'host': 'siteground-com', 'path': 'www/jerseysfever.com/public_html'},
    'uk': {'host': 'siteground-uk', 'path': 'www/jerseysfever.uk/public_html'},
    'fr': {'host': 'siteground-fr', 'path': 'www/jerseysfever.fr/public_html'},
}

BATCH_SIZE = 500  # 每批500个


def cleanup_site(site: str):
    """清理单个站点"""
    print(f"\n{'='*60}", flush=True)
    print(f"开始清理 {site.upper()} 站点 (SSH + WP-CLI, 批量{BATCH_SIZE})", flush=True)
    print(f"{'='*60}", flush=True)

    config = SITE_SSH[site]
    start_time = time.time()
    total_deleted = 0
    batch_num = 0

    while True:
        batch_num += 1

        # 每次重新创建客户端
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

        try:
            result = supabase.rpc('get_customers_to_cleanup', {
                'target_site': site,
                'batch_limit': BATCH_SIZE
            }).execute()
        except Exception as e:
            print(f"[{site}] 获取失败: {e}, 重试...", flush=True)
            time.sleep(2)
            continue

        customers = result.data or []
        if not customers:
            print(f"[{site}] 没有更多需要删除的客户", flush=True)
            break

        # 提取 ID 和 email
        user_ids = [c['woo_ids'].get(site) for c in customers if c['woo_ids'].get(site)]
        emails = [c['email'] for c in customers]

        if not user_ids:
            break

        # SSH 删除用户
        ids_str = ' '.join(str(uid) for uid in user_ids)
        cmd = f"ssh {config['host']} 'cd {config['path']} && wp user delete {ids_str} --yes 2>&1'"

        try:
            subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
            deleted = len(user_ids)
        except subprocess.TimeoutExpired:
            print(f"[{site}] SSH超时，继续下一批", flush=True)
            deleted = len(user_ids)
        except Exception as e:
            print(f"[{site}] SSH错误: {e}", flush=True)
            deleted = 0

        # 更新 Supabase（重试）
        for attempt in range(3):
            try:
                supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                supabase.rpc('batch_remove_woo_id', {
                    'target_site': site,
                    'emails': emails
                }).execute()
                break
            except Exception as e:
                if attempt == 2:
                    print(f"[{site}] DB更新失败: {e}", flush=True)
                time.sleep(1)

        total_deleted += deleted
        elapsed = time.time() - start_time
        rate = total_deleted / elapsed if elapsed > 0 else 0

        print(f"[{site}] 批次 {batch_num}: 删除 {deleted}, 累计 {total_deleted}, {rate:.1f}/s", flush=True)

    elapsed = time.time() - start_time
    print(f"\n[{site}] 完成! 删除 {total_deleted}, 耗时 {elapsed:.1f}s", flush=True)
    return {'site': site, 'deleted': total_deleted, 'time': elapsed}


def main():
    sites = sys.argv[1:] if len(sys.argv) > 1 else ['com', 'uk', 'fr']

    print("="*60, flush=True)
    print(f"客户清理脚本 - SSH + WP-CLI (每批{BATCH_SIZE}个)", flush=True)
    print(f"目标站点: {', '.join(sites)}", flush=True)
    print("="*60, flush=True)

    results = []
    for site in sites:
        r = cleanup_site(site)
        results.append(r)

    print("\n" + "="*60, flush=True)
    print("总结", flush=True)
    print("="*60, flush=True)
    total_deleted = 0
    total_time = 0
    for r in results:
        print(f"  {r['site'].upper()}: 删除 {r['deleted']}, 耗时 {r['time']:.1f}s", flush=True)
        total_deleted += r['deleted']
        total_time += r['time']
    print(f"  总计: {total_deleted} 条, {total_time:.1f}s", flush=True)


if __name__ == '__main__':
    main()
