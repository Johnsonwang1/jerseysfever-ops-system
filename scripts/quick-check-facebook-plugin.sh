#!/bin/bash

# 快速检查 Facebook 插件的脚本
# 用法: ./quick-check-facebook-plugin.sh <site>
# 例如: ./quick-check-facebook-plugin.sh com

SITE=${1:-com}  # 默认检查 .com

case $SITE in
    de)
        SSH_HOST="siteground"
        DOMAIN="jerseysfever.de"
        ;;
    com)
        SSH_HOST="siteground-com"
        DOMAIN="jerseysfever.com"
        ;;
    fr)
        SSH_HOST="siteground-fr"
        DOMAIN="jerseysfever.fr"
        ;;
    uk)
        SSH_HOST="siteground-uk"
        DOMAIN="jerseysfever.uk"
        ;;
    *)
        echo "错误: 无效的网站代码。请使用: de, com, fr, uk"
        exit 1
        ;;
esac

echo "=========================================="
echo "快速检查: $DOMAIN"
echo "=========================================="
echo ""

PLUGIN_DIR="www/$DOMAIN/public_html/wp-content/plugins"

# 1. 列出所有 Facebook 相关插件
echo "1. Facebook 相关插件列表:"
ssh $SSH_HOST "ls -la $PLUGIN_DIR/ | grep -i facebook || echo '  未找到 Facebook 插件'"
echo ""

# 2. 查找具体的插件目录
echo "2. Facebook 插件目录:"
FB_PLUGIN=$(ssh $SSH_HOST "ls -d $PLUGIN_DIR/*facebook* 2>/dev/null | head -1")
if [ -z "$FB_PLUGIN" ]; then
    echo "  未找到 Facebook 插件目录"
    echo ""
    echo "请检查："
    echo "  - 插件是否已安装？"
    echo "  - 插件名称是否正确？"
    exit 1
else
    echo "  找到: $FB_PLUGIN"
fi
echo ""

# 3. 检查插件主文件
echo "3. 插件主文件:"
ssh $SSH_HOST "ls -la $FB_PLUGIN/*.php 2>/dev/null | head -5"
echo ""

# 4. 查找所有 JS 文件
echo "4. JavaScript 文件列表:"
ssh $SSH_HOST "find $FB_PLUGIN -name '*.js' -type f | head -10"
echo ""

# 5. 检查 JS 文件内容（前几行）
echo "5. 检查第一个 JS 文件的内容（前 5 行）:"
FIRST_JS=$(ssh $SSH_HOST "find $FB_PLUGIN -name '*.js' -type f | head -1")
if [ -n "$FIRST_JS" ]; then
    echo "  文件: $FIRST_JS"
    ssh $SSH_HOST "head -5 $FIRST_JS"
    echo ""
    
    # 检查是否是 HTML（错误标志）
    if ssh $SSH_HOST "head -1 $FIRST_JS | grep -q '<!DOCTYPE\|<html\|<?php'"; then
        echo "  ⚠️  警告: JS 文件包含 HTML/PHP 内容！这可能是问题所在。"
    fi
else
    echo "  未找到 JS 文件"
fi
echo ""

# 6. 检查文件权限
echo "6. 插件目录权限:"
ssh $SSH_HOST "ls -ld $FB_PLUGIN"
echo ""

# 7. 检查 .htaccess
echo "7. 检查网站根目录的 .htaccess:"
ssh $SSH_HOST "test -f www/$DOMAIN/public_html/.htaccess && echo '  存在 .htaccess' || echo '  不存在 .htaccess'"
echo ""

echo "=========================================="
echo "检查完成"
echo "=========================================="
echo ""
echo "下一步建议："
echo "1. 在浏览器中打开开发者工具（F12）"
echo "2. 查看 Console 标签页，找到报错的 JS 文件 URL"
echo "3. 在 Network 标签页中，点击失败的 JS 请求"
echo "4. 查看 Response 内容，如果返回的是 HTML，说明路径错误"
echo ""
echo "常见解决方案："
echo "- 如果文件不存在：重新安装插件"
echo "- 如果路径错误：检查插件的 wp_enqueue_script 配置"
echo "- 如果返回 HTML：检查 .htaccess 重写规则"



