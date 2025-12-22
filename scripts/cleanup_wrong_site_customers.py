#!/usr/bin/env python3
"""
快速清理错误站点的客户
并发30，批量更新数据库
"""

import asyncio
import aiohttp
import base64
import os
import sys
import time
from dotenv import load_dotenv
from supabase import create_client

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')

SITE_CONFIGS = {
    'com': {'domain': 'jerseysfever.com', 'key': os.getenv('WOO_COM_KEY'), 'secret': os.getenv('WOO_COM_SECRET')},
    'uk': {'domain': 'jerseysfever.uk', 'key': os.getenv('WOO_UK_KEY'), 'secret': os.getenv('WOO_UK_SECRET')},
    'de': {'domain': 'jerseysfever.de', 'key': os.getenv('WOO_DE_KEY'), 'secret': os.getenv('WOO_DE_SECRET')},
    'fr': {'domain': 'jerseysfever.fr', 'key': os.getenv('WOO_FR_KEY'), 'secret': os.getenv('WOO_FR_SECRET')},
}

CONCURRENT = 30
BATCH_SIZE = 500
DB_UPDATE_BATCH = 1000


def get_auth_header(site: str) -> str:
    config = SITE_CONFIGS[site]
    auth = base64.b64encode(f"{config['key']}:{config['secret']}".encode()).decode()
    return f"Basic {auth}"


async def delete_woo_customer(session: aiohttp.ClientSession, semaphore: asyncio.Semaphore, site: str, customer_id: int, email: str) -> dict:
    async with semaphore:
        config = SITE_CONFIGS[site]
        url = f"https://{config['domain']}/wp-json/wc/v3/customers/{customer_id}?force=true"
        try:
            async with session.delete(url, headers={'Authorization': get_auth_header(site)}) as resp:
                if resp.status in [200, 404]:
                    return {'email': email, 'success': True}
                return {'email': email, 'success': False}
        except:
            return {'email': email, 'success': False}


async def batch_update_db(supabase, site: str, emails: list):
    """使用 RPC 批量更新"""
    if not emails:
        return 0
    try:
        result = supabase.rpc('batch_remove_woo_id', {
            'target_site': site,
            'emails': emails
        }).execute()
        return result.data if result.data else 0
    except Exception as e:
        print(f"  批量更新失败: {e}", flush=True)
        return 0


async def cleanup_site(site: str):
    print(f"\n{'='*60}", flush=True)
    print(f"开始清理 {site.upper()} 站点 (并发={CONCURRENT})", flush=True)
    print(f"{'='*60}", flush=True)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    semaphore = asyncio.Semaphore(CONCURRENT)

    total_deleted = 0
    total_failed = 0
    pending_emails = []
    start_time = time.time()

    connector = aiohttp.TCPConnector(limit=CONCURRENT * 2)
    timeout = aiohttp.ClientTimeout(total=60, connect=10)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        batch_num = 0
        while True:
            batch_num += 1

            try:
                result = supabase.rpc('get_customers_to_cleanup', {
                    'target_site': site,
                    'batch_limit': BATCH_SIZE
                }).execute()
            except Exception as e:
                print(f"[{site}] 获取失败: {e}", flush=True)
                await asyncio.sleep(2)
                continue

            customers = result.data
            if not customers:
                break

            tasks = [
                delete_woo_customer(session, semaphore, site, c['woo_ids'].get(site), c['email'])
                for c in customers if c['woo_ids'].get(site)
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            batch_deleted = 0
            for r in results:
                if isinstance(r, dict) and r.get('success'):
                    batch_deleted += 1
                    pending_emails.append(r['email'])
                else:
                    total_failed += 1

            total_deleted += batch_deleted

            # 批量更新数据库
            if len(pending_emails) >= DB_UPDATE_BATCH:
                updated = await batch_update_db(supabase, site, pending_emails)
                print(f"    DB批量更新 {updated} 条", flush=True)
                pending_emails = []

            elapsed = time.time() - start_time
            rate = total_deleted / elapsed if elapsed > 0 else 0
            print(f"[{site}] 批次 {batch_num}: {batch_deleted}/{len(customers)}, 累计 {total_deleted}, {rate:.1f}/s", flush=True)

    # 更新剩余
    if pending_emails:
        updated = await batch_update_db(supabase, site, pending_emails)
        print(f"    DB批量更新剩余 {updated} 条", flush=True)

    elapsed = time.time() - start_time
    print(f"\n[{site}] 完成! 删除 {total_deleted}, 失败 {total_failed}, 耗时 {elapsed:.1f}s", flush=True)
    return {'site': site, 'deleted': total_deleted, 'failed': total_failed, 'time': elapsed}


async def main():
    sites = sys.argv[1:] if len(sys.argv) > 1 else ['de', 'com', 'uk', 'fr']

    print("="*60, flush=True)
    print(f"客户清理脚本 - 并发 {CONCURRENT}, 批量更新数据库", flush=True)
    print(f"目标站点: {', '.join(sites)}", flush=True)
    print("="*60, flush=True)

    results = []
    for site in sites:
        r = await cleanup_site(site)
        results.append(r)

    print("\n" + "="*60, flush=True)
    print("总结", flush=True)
    print("="*60, flush=True)
    total_deleted = 0
    total_time = 0
    for r in results:
        print(f"  {r['site'].upper()}: 删除 {r['deleted']}, 失败 {r['failed']}, 耗时 {r['time']:.1f}s", flush=True)
        total_deleted += r['deleted']
        total_time += r['time']
    print(f"  总计: {total_deleted} 条, {total_time:.1f}s", flush=True)


if __name__ == '__main__':
    asyncio.run(main())
