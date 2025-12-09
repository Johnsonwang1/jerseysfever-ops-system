#!/bin/bash

# 检查 Facebook 插件所有 JS 文件的访问性
# 用法: ./check-facebook-js-files.sh de

SITE=${1:-de}

case $SITE in
    de)
        DOMAIN="jerseysfever.de"
        ;;
    com)
        DOMAIN="jerseysfever.com"
        ;;
    fr)
        DOMAIN="jerseysfever.fr"
        ;;
    uk)
        DOMAIN="jerseysfever.uk"
        ;;
    *)
        echo "错误: 无效的网站代码。请使用: de, com, fr, uk"
        exit 1
        ;;
esac

echo "=========================================="
echo "检查 Facebook 插件 JS 文件访问性"
echo "网站: $DOMAIN"
echo "=========================================="
echo ""

BASE_URL="https://$DOMAIN/wp-content/plugins/facebook-for-woocommerce/assets/build/admin"

# 需要检查的 JS 文件列表（根据代码中的 enqueue）
JS_FILES=(
    "infobanner.js"
    "modal.js"
    "google-product-category-fields.js"
    "products-admin.js"
    "plugin-rendering.js"
    "index.js"
    "metabox.js"
    "enhanced-settings-sync.js"
    "settings-commerce.js"
    "settings-sync.js"
    "whatsapp-billing.js"
    "whatsapp-connection.js"
    "whatsapp-consent-remove.js"
    "whatsapp-consent.js"
    "whatsapp-disconnect.js"
    "whatsapp-events.js"
    "whatsapp-finish.js"
    "whatsapp-templates.js"
    "product-categories.js"
)

echo "检查 JS 文件访问性和内容类型..."
echo ""

for js_file in "${JS_FILES[@]}"; do
    url="$BASE_URL/$js_file"
    
    # 检查 HTTP 状态码和 Content-Type
    response=$(curl -s -I "$url" 2>&1)
    status=$(echo "$response" | grep -i "HTTP" | head -1)
    content_type=$(echo "$response" | grep -i "content-type" | head -1)
    
    # 检查文件内容（前100字符）
    content=$(curl -s "$url" 2>&1 | head -c 100)
    
    echo "文件: $js_file"
    echo "  URL: $url"
    
    if echo "$status" | grep -q "200"; then
        echo "  状态: ✅ 200 OK"
        
        if echo "$content_type" | grep -qi "javascript"; then
            echo "  类型: ✅ application/javascript"
        else
            echo "  类型: ⚠️  $content_type (可能不是 JavaScript)"
        fi
        
        # 检查内容是否包含 HTML（错误标志）
        if echo "$content" | grep -q "<!DOCTYPE\|<html\|<?php"; then
            echo "  内容: ❌ 包含 HTML/PHP（可能是 404 页面）"
        elif [ -z "$content" ] || [ ${#content} -lt 10 ]; then
            echo "  内容: ⚠️  文件为空或几乎为空"
        else
            echo "  内容: ✅ 看起来是有效的 JavaScript"
        fi
    else
        echo "  状态: ❌ $status"
        echo "  内容: $(echo "$content" | head -c 50)..."
    fi
    
    echo ""
done

echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
echo "如果发现任何文件返回 HTML 或 404，请："
echo "1. 检查文件是否存在：ssh siteground 'ls -la www/$DOMAIN/public_html/wp-content/plugins/facebook-for-woocommerce/assets/build/admin/[文件名]'"
echo "2. 检查文件权限：ssh siteground 'ls -ld www/$DOMAIN/public_html/wp-content/plugins/facebook-for-woocommerce/assets/build/admin/'"
echo "3. 如果文件不存在，可能需要重新安装插件或重新构建资源文件"

