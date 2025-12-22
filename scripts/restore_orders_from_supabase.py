#!/usr/bin/env python3
"""
从 Supabase 恢复丢失的订单到 WooCommerce
"""

import os
import sys
import json
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('VITE_SUPABASE_SERVICE_ROLE_KEY')

# WooCommerce API credentials
WOO_SITES = {
    'de': {
        'url': 'https://jerseysfever.de',
        'key': os.getenv('WOO_DE_KEY'),
        'secret': os.getenv('WOO_DE_SECRET'),
    }
}


def get_missing_orders(site: str, after_id: int):
    """从 Supabase 获取丢失的订单"""
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    result = supabase.from_('orders') \
        .select('*') \
        .eq('site', site) \
        .gt('woo_id', after_id) \
        .order('woo_id') \
        .execute()

    return result.data or []


def create_woo_order(site: str, order_data: dict):
    """通过 WooCommerce API 创建订单"""
    config = WOO_SITES[site]
    url = f"{config['url']}/wp-json/wc/v3/orders"

    # 构建订单数据
    billing = order_data.get('billing_address', {})
    shipping = order_data.get('shipping_address', {})

    # 构建 line items
    line_items = []
    for item in order_data.get('line_items', []):
        line_item = {
            'product_id': item.get('product_id'),
            'quantity': item.get('quantity', 1),
            'subtotal': str(item.get('price', 0) * item.get('quantity', 1)),
            'total': str(item.get('price', 0) * item.get('quantity', 1)),
        }
        if item.get('variation_id'):
            line_item['variation_id'] = item['variation_id']

        # 添加 meta_data
        meta_data = []
        for meta in item.get('meta_data', []):
            if meta.get('key') and not meta['key'].startswith('_'):
                meta_data.append({
                    'key': meta['key'],
                    'value': meta.get('value', '')
                })
        if meta_data:
            line_item['meta_data'] = meta_data

        line_items.append(line_item)

    # 构建 shipping lines
    shipping_lines = []
    for sl in order_data.get('shipping_lines', []):
        method_title = sl.get('method_title', 'Shipping')
        # 根据 method_title 确定 method_id
        if 'free' in method_title.lower():
            method_id = 'free_shipping'
        elif 'flat' in method_title.lower():
            method_id = 'flat_rate'
        else:
            method_id = 'flat_rate'

        shipping_lines.append({
            'method_id': method_id,
            'method_title': method_title,
            'total': str(sl.get('total', 0))
        })

    woo_order = {
        'status': order_data.get('status', 'processing'),
        'currency': order_data.get('currency', 'EUR'),
        'billing': {
            'first_name': billing.get('first_name', ''),
            'last_name': billing.get('last_name', ''),
            'address_1': billing.get('address_1', ''),
            'address_2': billing.get('address_2', ''),
            'city': billing.get('city', ''),
            'state': billing.get('state', ''),
            'postcode': billing.get('postcode', ''),
            'country': billing.get('country', ''),
            'email': billing.get('email', ''),
            'phone': billing.get('phone', ''),
        },
        'shipping': {
            'first_name': shipping.get('first_name', ''),
            'last_name': shipping.get('last_name', ''),
            'address_1': shipping.get('address_1', ''),
            'address_2': shipping.get('address_2', ''),
            'city': shipping.get('city', ''),
            'state': shipping.get('state', ''),
            'postcode': shipping.get('postcode', ''),
            'country': shipping.get('country', ''),
        },
        'line_items': line_items,
        'shipping_lines': shipping_lines if shipping_lines else [{'method_id': 'free_shipping', 'method_title': 'Free shipping', 'total': '0'}],
        'payment_method': order_data.get('payment_method', ''),
        'payment_method_title': order_data.get('payment_method_title', ''),
        'set_paid': order_data.get('date_paid') is not None,
    }

    # 如果有折扣
    if order_data.get('discount_total') and float(order_data['discount_total']) > 0:
        woo_order['discount_total'] = str(order_data['discount_total'])

    # 如果有客户备注
    if order_data.get('customer_note'):
        woo_order['customer_note'] = order_data['customer_note']

    try:
        response = requests.post(
            url,
            json=woo_order,
            auth=(config['key'], config['secret']),
            timeout=30
        )

        if response.status_code in [200, 201]:
            result = response.json()
            return {'success': True, 'new_id': result.get('id'), 'old_id': order_data['woo_id']}
        else:
            return {'success': False, 'error': response.text[:200], 'old_id': order_data['woo_id']}
    except Exception as e:
        return {'success': False, 'error': str(e), 'old_id': order_data['woo_id']}


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else 'de'
    after_id = int(sys.argv[2]) if len(sys.argv) > 2 else 85163

    print("=" * 60)
    print(f"从 Supabase 恢复订单到 WooCommerce ({site.upper()})")
    print(f"恢复 ID > {after_id} 的订单")
    print("=" * 60)

    # 获取丢失的订单
    print("\n[1/2] 从 Supabase 获取订单...")
    orders = get_missing_orders(site, after_id)
    print(f"找到 {len(orders)} 个订单需要恢复")

    if not orders:
        print("没有需要恢复的订单")
        return

    # 显示订单摘要
    print("\n订单列表:")
    for o in orders:
        status_icon = "✓" if o.get('date_paid') else "○"
        print(f"  {status_icon} #{o['woo_id']} - {o['customer_name']} - €{o['total']} ({o['status']})")

    # 确认
    confirm = input("\n确认恢复这些订单? (y/n): ")
    if confirm.lower() != 'y':
        print("取消")
        return

    # 恢复订单
    print("\n[2/2] 恢复订单到 WooCommerce...")
    success = 0
    failed = 0

    for order in orders:
        result = create_woo_order(site, order)
        if result['success']:
            print(f"  ✓ #{result['old_id']} -> #{result['new_id']}")
            success += 1
        else:
            print(f"  ✗ #{result['old_id']}: {result['error']}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"完成! 成功: {success}, 失败: {failed}")
    print("=" * 60)


if __name__ == '__main__':
    main()
