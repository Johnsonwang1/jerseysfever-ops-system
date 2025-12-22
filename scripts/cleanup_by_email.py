#!/usr/bin/env python3
"""
通过邮箱匹配删除错误站点的客户
Phase 1: 从 WP 删除 assigned_site != 当前站点 的用户
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

SITE_SSH = {
    'de': {'host': 'siteground', 'path': 'www/jerseysfever.de/public_html'},
    'com': {'host': 'siteground-com', 'path': 'www/jerseysfever.com/public_html'},
    'uk': {'host': 'siteground-uk', 'path': 'www/jerseysfever.uk/public_html'},
    'fr': {'host': 'siteground-fr', 'path': 'www/jerseysfever.fr/public_html'},
}

BATCH_SIZE = 100


def get_wp_users(site: str) -> dict:
    """获取站点所有 WP 用户 {email: user_id}"""
    config = SITE_SSH[site]
    cmd = f"ssh {config['host']} 'cd {config['path']} && wp user list --role=customer --fields=ID,user_email --format=csv 2>/dev/null'"

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        print(f"[{site}] SSH 超时获取用户列表")
        return {}

    users = {}
    for line in result.stdout.strip().split('\n')[1:]:  # 跳过 header
        if ',' in line:
            parts = line.split(',', 1)
            if len(parts) == 2:
                user_id, email = parts
                try:
                    users[email.lower().strip()] = int(user_id)
                except ValueError:
                    continue
    return users


def get_customers_to_delete(supabase, site: str, wp_emails: set) -> list:
    """获取需要删除的客户 (assigned_site != site 且在该站点有WP账户)"""
    # 分页获取所有 assigned_site != 当前站点 的客户
    all_customers = []
    offset = 0
    page_size = 1000

    while True:
        result = supabase.from_('customers') \
            .select('email, assigned_site') \
            .neq('assigned_site', site) \
            .not_.is_('assigned_site', 'null') \
            .range(offset, offset + page_size - 1) \
            .execute()

        if not result.data:
            break

        all_customers.extend(result.data)

        if len(result.data) < page_size:
            break
        offset += page_size

    # 筛选在该站点有 WP 账户的
    to_delete = []
    for c in all_customers:
        email = c['email'].lower().strip()
        if email in wp_emails:
            to_delete.append(email)

    return to_delete


def delete_wp_users(site: str, user_ids: list) -> bool:
    """批量删除 WP 用户"""
    if not user_ids:
        return True

    config = SITE_SSH[site]
    ids_str = ' '.join(str(uid) for uid in user_ids)
    cmd = f"ssh {config['host']} 'cd {config['path']} && wp user delete {ids_str} --yes 2>&1'"

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        return True
    except subprocess.TimeoutExpired:
        print(f"[{site}] SSH 删除超时")
        return True  # 继续下一批
    except Exception as e:
        print(f"[{site}] SSH 错误: {e}")
        return False


def update_supabase(supabase, site: str, emails: list):
    """更新 Supabase 移除 woo_id"""
    for attempt in range(3):
        try:
            supabase.rpc('batch_remove_woo_id', {
                'target_site': site,
                'emails': emails
            }).execute()
            return True
        except Exception as e:
            if attempt == 2:
                print(f"[{site}] DB更新失败: {e}")
            time.sleep(1)
    return False


def cleanup_site(site: str, dry_run: bool = False):
    """清理单个站点"""
    print(f"\n{'='*60}")
    print(f"清理 {site.upper()} 站点" + (" [DRY RUN]" if dry_run else ""))
    print(f"{'='*60}")

    start_time = time.time()

    # 1. 获取 WP 用户
    print(f"[{site}] 获取 WP 用户列表...", flush=True)
    wp_users = get_wp_users(site)
    print(f"[{site}] 共 {len(wp_users)} 个 WP 用户", flush=True)

    if not wp_users:
        print(f"[{site}] 无法获取用户列表")
        return {'site': site, 'deleted': 0, 'time': 0}

    # 2. 获取需要删除的客户
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"[{site}] 匹配 Supabase 数据...", flush=True)
    to_delete = get_customers_to_delete(supabase, site, set(wp_users.keys()))
    print(f"[{site}] 需要删除 {len(to_delete)} 个用户", flush=True)

    if not to_delete:
        print(f"[{site}] 无需清理")
        return {'site': site, 'deleted': 0, 'time': 0}

    if dry_run:
        print(f"[{site}] DRY RUN - 不执行实际删除")
        # 显示前 10 个要删除的用户
        print(f"[{site}] 示例要删除的用户:")
        for email in to_delete[:10]:
            print(f"  - {email} (WP ID: {wp_users[email]})")
        return {'site': site, 'deleted': 0, 'to_delete': len(to_delete), 'time': 0}

    # 3. 分批删除
    deleted = 0

    for i in range(0, len(to_delete), BATCH_SIZE):
        batch_emails = to_delete[i:i+BATCH_SIZE]
        batch_ids = [wp_users[email] for email in batch_emails]

        # 删除 WP 用户
        delete_wp_users(site, batch_ids)

        # 更新 Supabase (移除 woo_id)
        update_supabase(supabase, site, batch_emails)

        deleted += len(batch_ids)
        elapsed = time.time() - start_time
        rate = deleted / elapsed if elapsed > 0 else 0
        print(f"[{site}] 已删除 {deleted}/{len(to_delete)} ({rate:.1f}/s)", flush=True)

    elapsed = time.time() - start_time
    print(f"\n[{site}] 完成! 删除 {deleted} 个用户, 耗时 {elapsed:.1f}s", flush=True)
    return {'site': site, 'deleted': deleted, 'time': elapsed}


def main():
    # 解析参数
    args = sys.argv[1:]
    dry_run = '--dry-run' in args
    args = [a for a in args if a != '--dry-run']

    sites = args if args else ['com', 'uk', 'fr', 'de']

    print("="*60)
    print("客户清理脚本 - 按邮箱匹配" + (" [DRY RUN]" if dry_run else ""))
    print(f"目标站点: {', '.join(sites)}")
    print("="*60)

    results = []
    for site in sites:
        r = cleanup_site(site, dry_run=dry_run)
        results.append(r)

    # 总结
    print("\n" + "="*60)
    print("总结")
    print("="*60)

    if dry_run:
        total_to_delete = 0
        for r in results:
            to_del = r.get('to_delete', 0)
            print(f"  {r['site'].upper()}: 需要删除 {to_del} 个用户")
            total_to_delete += to_del
        print(f"  总计需删除: {total_to_delete} 个用户")
    else:
        total_deleted = 0
        total_time = 0
        for r in results:
            print(f"  {r['site'].upper()}: 删除 {r['deleted']} 个, 耗时 {r['time']:.1f}s")
            total_deleted += r['deleted']
            total_time += r['time']
        print(f"  总计: 删除 {total_deleted} 个, 耗时 {total_time:.1f}s")


if __name__ == '__main__':
    main()
