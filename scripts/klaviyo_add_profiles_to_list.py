#!/usr/bin/env python3
"""
Klaviyo: 批量将所有 Profiles 添加到 Email List
"""

import requests
import time

# Klaviyo UK API Key
API_KEY = "pk_42ff6891b70a7efb58fce9673ba0f8417e"

HEADERS = {
    "Authorization": f"Klaviyo-API-Key {API_KEY}",
    "accept": "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
    "revision": "2024-10-15"
}

# 创建禁用代理的 session
session = requests.Session()
session.trust_env = False

def get_lists():
    """获取所有 Lists"""
    url = "https://a.klaviyo.com/api/lists"
    response = session.get(url, headers=HEADERS)
    response.raise_for_status()
    data = response.json()
    
    lists = []
    for item in data.get('data', []):
        lists.append({
            'id': item['id'],
            'name': item['attributes']['name']
        })
    return lists

def get_all_profiles():
    """获取所有 Profiles（分页）"""
    profiles = []
    url = "https://a.klaviyo.com/api/profiles?page[size]=100"
    
    page = 1
    max_retries = 3
    
    while url:
        print(f"  获取 profiles 第 {page} 页...")
        
        for retry in range(max_retries):
            try:
                response = session.get(url, headers=HEADERS, timeout=30)
                response.raise_for_status()
                data = response.json()
                
                for item in data.get('data', []):
                    email = item['attributes'].get('email')
                    if email:
                        profiles.append({
                            'id': item['id'],
                            'email': email
                        })
                
                # 获取下一页
                url = data.get('links', {}).get('next')
                break  # 成功，跳出重试循环
                
            except Exception as e:
                if retry < max_retries - 1:
                    print(f"    重试 {retry + 1}/{max_retries}...")
                    time.sleep(2 ** retry)  # 指数退避
                else:
                    raise e
        
        page += 1
        
        # 避免速率限制 - 增加延迟
        time.sleep(0.5)
    
    return profiles

def add_profiles_to_list(list_id: str, profile_ids: list):
    """批量将 profiles 添加到 list"""
    url = f"https://a.klaviyo.com/api/lists/{list_id}/relationships/profiles"
    
    # Klaviyo API 限制每次最多 1000 个
    batch_size = 1000
    total_added = 0
    
    for i in range(0, len(profile_ids), batch_size):
        batch = profile_ids[i:i + batch_size]
        
        payload = {
            "data": [{"type": "profile", "id": pid} for pid in batch]
        }
        
        print(f"  添加 {len(batch)} 个 profiles (batch {i//batch_size + 1})...")
        
        response = session.post(url, headers=HEADERS, json=payload)
        
        if response.status_code == 204:
            total_added += len(batch)
            print(f"    ✓ 成功添加 {len(batch)} 个")
        else:
            print(f"    ✗ 错误: {response.status_code} - {response.text}")
        
        # 避免速率限制
        time.sleep(0.5)
    
    return total_added

def main():
    print("=" * 50)
    print("Klaviyo UK: 批量添加 Profiles 到 Email List")
    print("=" * 50)
    
    # 1. 获取所有 Lists
    print("\n[1/3] 获取 Lists...")
    lists = get_lists()
    
    print(f"  找到 {len(lists)} 个 Lists:")
    for i, lst in enumerate(lists):
        print(f"    {i+1}. {lst['name']} (ID: {lst['id']})")
    
    # 找到 Email List
    email_list = None
    for lst in lists:
        if lst['name'] == 'Email List':
            email_list = lst
            break
    
    if not email_list:
        print("\n❌ 未找到 'Email List'，请检查 List 名称")
        return
    
    print(f"\n  目标 List: {email_list['name']} (ID: {email_list['id']})")
    
    # 2. 获取所有 Profiles
    print("\n[2/3] 获取所有 Profiles...")
    profiles = get_all_profiles()
    print(f"  共获取 {len(profiles)} 个有 email 的 profiles")
    
    if not profiles:
        print("\n❌ 没有找到 profiles")
        return
    
    # 3. 添加到 List
    print(f"\n[3/3] 添加 {len(profiles)} 个 profiles 到 '{email_list['name']}'...")
    profile_ids = [p['id'] for p in profiles]
    added = add_profiles_to_list(email_list['id'], profile_ids)
    
    print("\n" + "=" * 50)
    print(f"✅ 完成! 成功添加 {added} 个 profiles 到 Email List")
    print("=" * 50)

if __name__ == "__main__":
    main()

