"""
JerseysFever 全量同步 Cloud Function

从 WooCommerce 拉取所有商品数据到 Supabase PIM
支持所有 4 个站点：com, uk, de, fr
"""

import os
import json
import base64
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

import functions_framework
from flask import Request, jsonify
import requests
from supabase import create_client, Client

# 线程锁，用于更新进度
progress_lock = threading.Lock()

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Supabase 配置
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://iwzohjbvuhwvfidyevpf.supabase.co')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')

# WooCommerce 站点配置
SITES = {
    'com': {
        'url': 'https://jerseysfever.com',
        'key': os.environ.get('WOO_COM_KEY'),
        'secret': os.environ.get('WOO_COM_SECRET'),
    },
    'uk': {
        'url': 'https://jerseysfever.uk',
        'key': os.environ.get('WOO_UK_KEY'),
        'secret': os.environ.get('WOO_UK_SECRET'),
    },
    'de': {
        'url': 'https://jerseysfever.de',
        'key': os.environ.get('WOO_DE_KEY'),
        'secret': os.environ.get('WOO_DE_SECRET'),
    },
    'fr': {
        'url': 'https://jerseysfever.fr',
        'key': os.environ.get('WOO_FR_KEY'),
        'secret': os.environ.get('WOO_FR_SECRET'),
    },
}


class WooCommerceClient:
    """WooCommerce REST API 客户端"""
    
    def __init__(self, site: str):
        self.site = site
        config = SITES.get(site)
        if not config:
            raise ValueError(f"Unknown site: {site}")
        
        self.base_url = f"{config['url']}/wp-json/wc/v3"
        self.auth = (config['key'], config['secret'])
    
    def _request_with_retry(self, url: str, max_retries: int = 3) -> requests.Response:
        """带重试的请求"""
        import time
        for attempt in range(max_retries):
            try:
                response = requests.get(url, auth=self.auth, timeout=30)
                if response.status_code == 503:
                    if attempt < max_retries - 1:
                        wait_time = (attempt + 1) * 2  # 2, 4, 6 秒
                        logger.warning(f"503 错误，{wait_time}秒后重试 ({attempt + 1}/{max_retries})")
                        time.sleep(wait_time)
                        continue
                response.raise_for_status()
                return response
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    logger.warning(f"请求失败: {e}，{wait_time}秒后重试")
                    time.sleep(wait_time)
                else:
                    raise
        raise Exception("Max retries exceeded")
    
    def get_product(self, product_id: int) -> Dict[str, Any]:
        """获取单个商品"""
        url = f"{self.base_url}/products/{product_id}"
        response = self._request_with_retry(url)
        return response.json()
    
    def get_products_page(self, page: int = 1, per_page: int = 100) -> List[Dict[str, Any]]:
        """批量获取商品（分页）"""
        url = f"{self.base_url}/products?page={page}&per_page={per_page}"
        response = self._request_with_retry(url)
        return response.json()
    
    def get_all_products(self) -> List[Dict[str, Any]]:
        """获取所有商品"""
        all_products = []
        page = 1
        while True:
            logger.info(f"📦 获取第 {page} 页商品...")
            products = self.get_products_page(page=page, per_page=100)
            if not products:
                break
            all_products.extend(products)
            logger.info(f"   获取到 {len(products)} 个，累计 {len(all_products)} 个")
            if len(products) < 100:
                break
            page += 1
        return all_products
    
    def get_product_variations(self, product_id: int) -> List[Dict[str, Any]]:
        """获取商品变体"""
        url = f"{self.base_url}/products/{product_id}/variations?per_page=100"
        response = self._request_with_retry(url)
        return response.json()


def get_supabase_client() -> Client:
    """获取 Supabase 客户端"""
    if not SUPABASE_KEY:
        raise ValueError("SUPABASE_SERVICE_KEY not set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_product_from_woo(
    sku: str,
    woo_id: int,
    site: str
) -> Dict[str, Any]:
    """从 WooCommerce 获取商品数据（不写入数据库）"""
    try:
        client = WooCommerceClient(site)
        woo_product = client.get_product(woo_id)
        
        # 提取数据
        update_data = {
            'sku': sku,  # 用于批量更新时的匹配
            'prices': {site: float(woo_product.get('sale_price') or woo_product.get('price') or 0)},
            'regular_prices': {site: float(woo_product.get('regular_price') or woo_product.get('price') or 0)},
            'stock_quantities': {site: woo_product.get('stock_quantity') or 100},
            'stock_statuses': {site: woo_product.get('stock_status', 'instock')},
            'statuses': {site: woo_product.get('status', 'publish')},
            'content': {
                site: {
                    'name': woo_product.get('name', ''),
                    'description': woo_product.get('description', ''),
                    'short_description': woo_product.get('short_description', ''),
                }
            },
            'sync_status': {site: 'synced'},
            'last_synced_at': datetime.utcnow().isoformat(),
        }
        
        # 如果是主站点 (com)，更新共享数据
        if site == 'com':
            update_data['name'] = woo_product.get('name', '')
            update_data['images'] = [img['src'] for img in woo_product.get('images', [])]
            update_data['categories'] = [c['name'] for c in woo_product.get('categories', [])]
            
            # 提取属性
            attributes = {}
            for attr in woo_product.get('attributes', []):
                attr_name = (attr.get('name', '') or '').lower().replace(' ', '')
                value = (attr.get('options') or [''])[0] if attr.get('options') else ''
                
                if attr_name in ('genderage', 'gender'):
                    attributes['gender'] = value
                elif attr_name == 'season':
                    attributes['season'] = value
                elif attr_name in ('jerseytype', 'type'):
                    attributes['type'] = value
                elif attr_name in ('style', 'version'):
                    attributes['version'] = value
                elif attr_name in ('sleevelength', 'sleeve'):
                    attributes['sleeve'] = value
                elif attr_name == 'team':
                    attributes['team'] = value
                elif attr_name in ('event', 'events'):
                    attributes['events'] = attr.get('options', [])
            
            if attributes:
                update_data['attributes'] = attributes
        
        # 获取变体信息
        site_variations = []
        if woo_product.get('type') == 'variable':
            try:
                variations = client.get_product_variations(woo_id)
                site_variations = [
                    {
                        'id': v['id'],
                        'sku': v.get('sku', ''),
                        'attributes': v.get('attributes', []),
                        'regular_price': v.get('regular_price', ''),
                        'sale_price': v.get('sale_price', ''),
                        'stock_quantity': v.get('stock_quantity'),
                        'stock_status': v.get('stock_status', 'instock'),
                    }
                    for v in variations
                ]
            except Exception as e:
                logger.warning(f"[{sku}] 获取变体失败: {e}")
        
        update_data['variations'] = {site: site_variations}
        update_data['variation_counts'] = {site: len(site_variations)}
        
        return {'sku': sku, 'success': True, 'data': update_data}
        
    except Exception as e:
        logger.error(f"❌ [{sku}] 拉取失败: {e}")
        return {'sku': sku, 'success': False, 'error': str(e)}


def batch_update_products(supabase: Client, updates: List[Dict], site: str):
    """批量更新商品到数据库"""
    if not updates:
        return
    
    logger.info(f"📝 批量写入 {len(updates)} 个商品...")
    
    # 获取所有 SKU 的现有数据
    skus = [u['sku'] for u in updates]
    existing_result = supabase.table('products').select(
        'sku, prices, regular_prices, stock_quantities, stock_statuses, statuses, content, sync_status, variations, variation_counts'
    ).in_('sku', skus).execute()
    
    existing_map = {p['sku']: p for p in (existing_result.data or [])}
    
    def safe_dict(val):
        return val if isinstance(val, dict) else {}
    
    # 合并数据
    final_updates = []
    for update in updates:
        sku = update['sku']
        existing = existing_map.get(sku, {})
        
        merged = {
            'sku': sku,
            'prices': {**safe_dict(existing.get('prices')), **update.get('prices', {})},
            'regular_prices': {**safe_dict(existing.get('regular_prices')), **update.get('regular_prices', {})},
            'stock_quantities': {**safe_dict(existing.get('stock_quantities')), **update.get('stock_quantities', {})},
            'stock_statuses': {**safe_dict(existing.get('stock_statuses')), **update.get('stock_statuses', {})},
            'statuses': {**safe_dict(existing.get('statuses')), **update.get('statuses', {})},
            'content': {**safe_dict(existing.get('content')), **update.get('content', {})},
            'sync_status': {**safe_dict(existing.get('sync_status')), **update.get('sync_status', {})},
            'variations': {**safe_dict(existing.get('variations')), **update.get('variations', {})},
            'variation_counts': {**safe_dict(existing.get('variation_counts')), **update.get('variation_counts', {})},
            'last_synced_at': update.get('last_synced_at'),
        }
        
        # 如果有共享字段（name, images, categories, attributes），也加上
        if 'name' in update:
            merged['name'] = update['name']
        if 'images' in update:
            merged['images'] = update['images']
        if 'categories' in update:
            merged['categories'] = update['categories']
        if 'attributes' in update:
            merged['attributes'] = update['attributes']
        
        final_updates.append(merged)
    
    # 批量 upsert
    supabase.table('products').upsert(final_updates, on_conflict='sku').execute()
    logger.info(f"✅ 批量写入完成")


# 保留旧函数用于单个商品同步
def pull_product_from_site(
    supabase: Client,
    sku: str,
    woo_id: int,
    site: str
) -> Dict[str, Any]:
    """从单个站点拉取商品数据（单个写入，用于重试）"""
    result = fetch_product_from_woo(sku, woo_id, site)
    if result.get('success') and result.get('data'):
        batch_update_products(supabase, [result['data']], site)
    return result


def update_progress(supabase: Client, site: str, current: int, total: int, success: int, failed: int, status: str = 'running', message: str = ''):
    """更新同步进度到数据库"""
    try:
        supabase.table('sync_progress').upsert({
            'id': 'current',
            'status': status,
            'site': site,
            'current': current,
            'total': total,
            'success': success,
            'failed': failed,
            'message': message,
            'updated_at': datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        logger.warning(f"更新进度失败: {e}")


def check_if_cancelled(supabase: Client) -> bool:
    """检查是否被用户取消"""
    try:
        result = supabase.table('sync_progress').select('status').eq('id', 'current').single().execute()
        return result.data and result.data.get('status') == 'cancelled'
    except:
        return False


def get_all_products(supabase: Client) -> List[Dict]:
    """获取所有商品（突破 1000 行限制）"""
    all_products = []
    page_size = 1000
    offset = 0
    
    while True:
        result = supabase.table('products').select('sku, woo_ids').range(offset, offset + page_size - 1).execute()
        if not result.data:
            break
        all_products.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size
    
    return all_products


def full_sync_site(supabase: Client, site: str, max_workers: int = 10) -> Dict[str, Any]:
    """
    全量同步单个站点（两步优化）
    步骤1: 批量获取主商品 (GET /products?per_page=100)
    步骤2: 10线程并行获取变体
    """
    logger.info(f"🚀 开始全量同步站点: {site} (并发: {max_workers})")
    start_time = datetime.utcnow()
    
    client = WooCommerceClient(site)
    
    # ==================== 步骤1: 批量获取主商品 ====================
    update_progress(supabase, site, 0, 0, 0, 0, 'running', f'步骤1: 从 {site} 批量获取商品...')
    
    try:
        woo_products = client.get_all_products()
    except Exception as e:
        logger.error(f"❌ [{site}] 获取商品列表失败: {e}")
        update_progress(supabase, site, 0, 0, 0, 0, 'error', f'获取商品列表失败: {e}')
        return {'site': site, 'total': 0, 'success': 0, 'failed': 0, 'skipped': 0, 'error': str(e)}
    
    if not woo_products:
        logger.warning(f"[{site}] 没有找到商品")
        update_progress(supabase, site, 0, 0, 0, 0, 'completed', '没有找到商品')
        return {'site': site, 'total': 0, 'success': 0, 'failed': 0, 'skipped': 0}
    
    total = len(woo_products)
    logger.info(f"📦 [{site}] 获取到 {total} 个商品")
    
    # 检查取消
    if check_if_cancelled(supabase):
        update_progress(supabase, site, 0, total, 0, 0, 'cancelled', '用户取消')
        return {'site': site, 'total': total, 'success': 0, 'failed': 0, 'skipped': 0, 'cancelled': True}
    
    # ==================== 步骤2: 处理商品数据并获取变体 ====================
    update_progress(supabase, site, 0, total, 0, 0, 'running', f'步骤2: 处理 {total} 个商品，10线程获取变体...')
    
    progress = {'completed': 0, 'success': 0, 'failed': 0, 'cancelled': False}
    pending_updates = []
    failed_skus = []
    BATCH_SIZE = 300
    
    def process_woo_product(woo_product):
        """处理单个 WooCommerce 商品"""
        if progress['cancelled']:
            return None
        
        sku = woo_product.get('sku', '')
        woo_id = woo_product.get('id')
        
        if not sku:
            logger.warning(f"商品 {woo_id} 没有 SKU，跳过")
            return None
        
        try:
            # 提取主商品数据
            update_data = {
                'sku': sku,
                'prices': {site: float(woo_product.get('sale_price') or woo_product.get('price') or 0)},
                'regular_prices': {site: float(woo_product.get('regular_price') or woo_product.get('price') or 0)},
                'stock_quantities': {site: woo_product.get('stock_quantity') or 100},
                'stock_statuses': {site: woo_product.get('stock_status', 'instock')},
                'statuses': {site: woo_product.get('status', 'publish')},
                'content': {
                    site: {
                        'name': woo_product.get('name', ''),
                        'description': woo_product.get('description', ''),
                        'short_description': woo_product.get('short_description', ''),
                    }
                },
                'sync_status': {site: 'synced'},
                'last_synced_at': datetime.utcnow().isoformat(),
                'woo_ids': {site: woo_id},
            }
            
            # 如果是主站点 (com)，更新共享数据
            if site == 'com':
                update_data['name'] = woo_product.get('name', '')
                update_data['images'] = [img['src'] for img in woo_product.get('images', [])]
                update_data['categories'] = [c['name'] for c in woo_product.get('categories', [])]
                
                # 提取属性
                attributes = {}
                for attr in woo_product.get('attributes', []):
                    attr_name = (attr.get('name', '') or '').lower().replace(' ', '')
                    value = (attr.get('options') or [''])[0] if attr.get('options') else ''
                    
                    if attr_name in ('genderage', 'gender'):
                        attributes['gender'] = value
                    elif attr_name == 'season':
                        attributes['season'] = value
                    elif attr_name in ('jerseytype', 'type'):
                        attributes['type'] = value
                    elif attr_name in ('style', 'version'):
                        attributes['version'] = value
                    elif attr_name in ('sleevelength', 'sleeve'):
                        attributes['sleeve'] = value
                    elif attr_name == 'team':
                        attributes['team'] = value
                    elif attr_name in ('event', 'events'):
                        attributes['events'] = attr.get('options', [])
                
                if attributes:
                    update_data['attributes'] = attributes
            
            # 获取变体（如果是可变商品）
            site_variations = []
            if woo_product.get('type') == 'variable':
                try:
                    variations = client.get_product_variations(woo_id)
                    site_variations = [
                        {
                            'id': v['id'],
                            'sku': v.get('sku', ''),
                            'attributes': v.get('attributes', []),
                            'regular_price': v.get('regular_price', ''),
                            'sale_price': v.get('sale_price', ''),
                            'stock_quantity': v.get('stock_quantity'),
                            'stock_status': v.get('stock_status', 'instock'),
                        }
                        for v in variations
                    ]
                except Exception as e:
                    logger.warning(f"[{sku}] 获取变体失败: {e}")
            
            update_data['variations'] = {site: site_variations}
            update_data['variation_counts'] = {site: len(site_variations)}
            
            return {'sku': sku, 'success': True, 'data': update_data}
            
        except Exception as e:
            logger.error(f"❌ [{sku}] 处理失败: {e}")
            return {'sku': sku, 'success': False, 'error': str(e)}
    
    # 多线程并行处理
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_woo_product, p): p for p in woo_products}
        
        for future in as_completed(futures):
            if progress['cancelled']:
                break
                
            try:
                result = future.result()
                if result is None:
                    continue
                    
                with progress_lock:
                    progress['completed'] += 1
                    
                    if result.get('success'):
                        progress['success'] += 1
                        if result.get('data'):
                            pending_updates.append(result['data'])
                    else:
                        progress['failed'] += 1
                        failed_skus.append(result.get('sku'))
                    
                    # 批量写入（在锁内复制列表）
                    batch_to_write = None
                    if len(pending_updates) >= BATCH_SIZE:
                        batch_to_write = pending_updates.copy()
                        pending_updates.clear()
                
                # 在锁外执行数据库写入（避免长时间持有锁）
                if batch_to_write:
                    batch_update_products(supabase, batch_to_write, site)
                
                # 更新进度
                if progress['completed'] % 50 == 0 or progress['completed'] == total:
                    # 先检查取消状态
                    if check_if_cancelled(supabase):
                        progress['cancelled'] = True
                        logger.warning(f"[{site}] 检测到取消请求，停止同步")
                    
                    # 只有未取消时才更新状态为 running
                    if not progress['cancelled']:
                        update_progress(
                            supabase, site,
                            progress['completed'], total,
                            progress['success'], progress['failed'],
                            'running',
                            f"进度: {progress['completed']}/{total}"
                        )
                    logger.info(f"[{site}] 进度: {progress['completed']}/{total} (成功: {progress['success']}, 失败: {progress['failed']})")
                        
            except Exception as e:
                logger.error(f"任务异常: {e}")
    
    # 写入剩余数据
    if pending_updates and not progress['cancelled']:
        batch_update_products(supabase, pending_updates, site)
        pending_updates.clear()
    
    duration = (datetime.utcnow() - start_time).total_seconds()
    final_status = 'cancelled' if progress['cancelled'] else 'completed'
    update_progress(supabase, site, progress['completed'], total, progress['success'], progress['failed'], final_status, f'同步完成 ({duration:.1f}s)')
    logger.info(f"✅ [{site}] 同步完成: {progress['success']}/{total} 成功, {progress['failed']} 失败 ({duration:.1f}s)")
    
    return {
        'site': site,
        'total': total,
        'success': progress['success'],
        'failed': progress['failed'],
        'duration': duration,
        'cancelled': progress['cancelled'],
    }


def full_sync_all(supabase: Client, sites: Optional[List[str]] = None) -> Dict[str, Any]:
    """全量同步所有站点（或指定站点）"""
    if sites is None:
        sites = ['com', 'uk', 'de', 'fr']
    
    logger.info(f"🚀 开始全量同步，站点: {sites}")
    start_time = datetime.utcnow()
    
    results = {}
    for site in sites:
        if site not in SITES:
            logger.warning(f"跳过未知站点: {site}")
            continue
        results[site] = full_sync_site(supabase, site)
    
    total_duration = (datetime.utcnow() - start_time).total_seconds()
    total_success = sum(r['success'] for r in results.values())
    total_failed = sum(r['failed'] for r in results.values())
    
    logger.info(f"🏁 全量同步完成: {total_success} 成功, {total_failed} 失败 ({total_duration:.1f}s)")
    
    return {
        'success': True,
        'results': results,
        'total_duration': total_duration,
    }


@functions_framework.http
def main(request: Request):
    """HTTP Cloud Function 入口"""
    # CORS 处理
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '3600',
        }
        return ('', 204, headers)
    
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
    }
    
    try:
        # 解析请求
        request_json = request.get_json(silent=True) or {}
        action = request_json.get('action', 'full-sync')
        sites = request_json.get('sites')  # 可选，指定要同步的站点
        
        # 获取 Supabase 客户端
        supabase = get_supabase_client()
        
        if action == 'full-sync':
            result = full_sync_all(supabase, sites)
            return (json.dumps(result), 200, headers)
        
        elif action == 'sync-site':
            site = request_json.get('site', 'com')
            result = full_sync_site(supabase, site)
            return (json.dumps({'success': True, **result}), 200, headers)
        
        elif action == 'test-product':
            # 测试单个商品同步
            sku = request_json.get('sku')
            site = request_json.get('site', 'com')
            woo_id = request_json.get('woo_id')
            
            if not sku or not woo_id:
                return (json.dumps({'error': 'sku and woo_id required'}), 400, headers)
            
            result = pull_product_from_site(supabase, sku, int(woo_id), site)
            return (json.dumps(result), 200, headers)
        
        elif action == 'test-woo-api':
            # 测试 WooCommerce API 连接
            site = request_json.get('site', 'com')
            try:
                client = WooCommerceClient(site)
                url = f"{client.base_url}/products?per_page=1"
                response = requests.get(url, auth=client.auth, timeout=10)
                return (json.dumps({
                    'success': True,
                    'site': site,
                    'status_code': response.status_code,
                    'product_count': len(response.json()) if response.ok else 0,
                }), 200, headers)
            except Exception as e:
                return (json.dumps({'success': False, 'error': str(e)}), 200, headers)
        
        elif action == 'health':
            return (json.dumps({'status': 'ok', 'timestamp': datetime.utcnow().isoformat()}), 200, headers)
        
        else:
            return (json.dumps({'error': f'Unknown action: {action}'}), 400, headers)
    
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return (json.dumps({'success': False, 'error': str(e)}), 500, headers)


# 本地测试
if __name__ == '__main__':
    import sys
    from dotenv import load_dotenv
    load_dotenv()
    
    supabase = get_supabase_client()
    
    if len(sys.argv) > 1:
        site = sys.argv[1]
        result = full_sync_site(supabase, site)
    else:
        result = full_sync_all(supabase)
    
    print(json.dumps(result, indent=2))

