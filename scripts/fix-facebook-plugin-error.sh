#!/bin/bash

# Facebook 插件错误修复脚本
# 用法: ./fix-facebook-plugin-error.sh de

SITE=${1:-de}

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
echo "Facebook 插件错误修复"
echo "网站: $DOMAIN"
echo "=========================================="
echo ""

PLUGIN_DIR="www/$DOMAIN/public_html/wp-content/plugins/facebook-for-woocommerce"

# 1. 检查插件版本
echo "1. 检查插件版本..."
PLUGIN_VERSION=$(ssh $SSH_HOST "grep 'Version:' $PLUGIN_DIR/facebook-commerce.php 2>/dev/null | head -1 | sed 's/.*Version: *//' | tr -d ' '")
echo "   插件版本: $PLUGIN_VERSION"
echo ""

# 2. 检查 WordPress 和 WooCommerce 版本兼容性
echo "2. 检查 WordPress 和 WooCommerce 版本..."
WP_VERSION=$(ssh $SSH_HOST "grep 'wp_version' www/$DOMAIN/public_html/wp-includes/version.php 2>/dev/null | head -1 | grep -oP \"'[^']+'\" | tr -d \"'\"")
echo "   WordPress 版本: $WP_VERSION"
echo ""

# 3. 检查文件权限
echo "3. 检查文件权限..."
ssh $SSH_HOST "ls -ld $PLUGIN_DIR/assets/build/admin/"
echo ""

# 4. 检查是否有损坏的文件
echo "4. 检查空文件..."
EMPTY_FILES=$(ssh $SSH_HOST "find $PLUGIN_DIR/assets/build/admin/ -name '*.js' -size 0 -type f")
if [ -n "$EMPTY_FILES" ]; then
    echo "   发现空文件:"
    echo "$EMPTY_FILES" | while read file; do
        echo "     - $file"
    done
    echo ""
    echo "   建议：这些空文件可能导致问题，但通常不会导致语法错误"
else
    echo "   未发现空文件"
fi
echo ""

# 5. 检查 .htaccess 是否有问题
echo "5. 检查 .htaccess 配置..."
HTACCESS_CHECK=$(ssh $SSH_HOST "grep -i 'facebook\|plugins.*build' www/$DOMAIN/public_html/.htaccess 2>/dev/null")
if [ -n "$HTACCESS_CHECK" ]; then
    echo "   发现相关规则:"
    echo "$HTACCESS_CHECK"
else
    echo "   未发现相关规则（正常）"
fi
echo ""

# 6. 提供修复建议
echo "=========================================="
echo "修复建议"
echo "=========================================="
echo ""
echo "根据错误 'Uncaught SyntaxError: Unexpected token <'，可能的原因："
echo ""
echo "1. 【最可能】浏览器缓存问题"
echo "   解决方案："
echo "   - 清除浏览器缓存（Ctrl+Shift+Delete）"
echo "   - 硬刷新页面（Ctrl+Shift+R 或 Cmd+Shift+R）"
echo "   - 使用无痕模式打开页面"
echo ""
echo "2. 某个 JS 文件返回了 HTML（404 页面）"
echo "   解决方案："
echo "   - 在浏览器中打开开发者工具（F12）"
echo "   - 切换到 Network 标签页"
echo "   - 刷新页面"
echo "   - 找到状态码为 404 或返回 HTML 的 JS 文件"
echo "   - 检查该文件的 URL 路径是否正确"
echo ""
echo "3. 插件资源文件损坏"
echo "   解决方案："
echo "   - 重新安装插件"
echo "   - 或者从 WordPress 后台更新插件"
echo ""
echo "4. 服务器缓存问题"
echo "   解决方案："
echo "   - 清除 WordPress 缓存（如果使用了缓存插件）"
echo "   - 清除服务器缓存"
echo ""
echo "5. 检查具体错误文件"
echo "   在浏览器控制台中："
echo "   - 点击错误信息"
echo "   - 查看 Sources 标签页，找到第49行的代码"
echo "   - 检查是否有内联脚本或外部资源加载失败"
echo ""
echo "=========================================="
echo "快速修复命令"
echo "=========================================="
echo ""
echo "如果需要重新安装插件，可以执行："
echo ""
echo "1. 备份当前插件："
echo "   ssh $SSH_HOST 'cp -r $PLUGIN_DIR $PLUGIN_DIR.backup'"
echo ""
echo "2. 从 WordPress 后台重新安装插件"
echo ""
echo "3. 或者清除 WordPress 缓存："
echo "   ssh $SSH_HOST 'rm -rf www/$DOMAIN/public_html/wp-content/cache/*'"
echo ""

