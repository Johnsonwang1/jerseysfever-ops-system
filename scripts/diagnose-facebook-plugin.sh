#!/bin/bash

# WordPress Facebook 插件诊断脚本
# 检查 Facebook 插件的 JavaScript 文件是否存在和可访问

echo "=========================================="
echo "WordPress Facebook 插件诊断工具"
echo "=========================================="
echo ""

# 定义网站配置
declare -A SITES
SITES[de]="siteground"
SITES[com]="siteground-com"
SITES[fr]="siteground-fr"
SITES[uk]="siteground-uk"

# 检查函数
check_plugin() {
    local site=$1
    local ssh_host=$2
    
    echo "----------------------------------------"
    echo "检查网站: jerseysfever.$site"
    echo "SSH Host: $ssh_host"
    echo "----------------------------------------"
    
    # 检查插件目录
    echo "1. 检查插件目录..."
    ssh $ssh_host "ls -la www/jerseysfever.$site/public_html/wp-content/plugins/ | grep -i facebook" || echo "  未找到 Facebook 相关插件"
    
    echo ""
    echo "2. 查找 Facebook 插件的 JS 文件..."
    ssh $ssh_host "find www/jerseysfever.$site/public_html/wp-content/plugins/ -name '*.js' -path '*facebook*' -type f | head -10" || echo "  未找到 JS 文件"
    
    echo ""
    echo "3. 检查插件主文件..."
    ssh $ssh_host "find www/jerseysfever.$site/public_html/wp-content/plugins/ -name '*.php' -path '*facebook*' -type f | head -5" || echo "  未找到 PHP 文件"
    
    echo ""
    echo "4. 检查 .htaccess 文件（可能导致路径重写问题）..."
    ssh $ssh_host "test -f www/jerseysfever.$site/public_html/.htaccess && echo '  存在 .htaccess 文件' || echo '  不存在 .htaccess 文件'"
    
    echo ""
    echo "5. 检查插件目录权限..."
    ssh $ssh_host "ls -ld www/jerseysfever.$site/public_html/wp-content/plugins/" || echo "  无法访问插件目录"
    
    echo ""
}

# 主程序
echo "请选择要检查的网站："
echo "1) jerseysfever.de (德国站)"
echo "2) jerseysfever.com"
echo "3) jerseysfever.fr (法国站)"
echo "4) jerseysfever.uk (英国站)"
echo "5) 检查所有网站"
echo ""
read -p "请输入选项 (1-5): " choice

case $choice in
    1)
        check_plugin "de" "${SITES[de]}"
        ;;
    2)
        check_plugin "com" "${SITES[com]}"
        ;;
    3)
        check_plugin "fr" "${SITES[fr]}"
        ;;
    4)
        check_plugin "uk" "${SITES[uk]}"
        ;;
    5)
        for site in "${!SITES[@]}"; do
            check_plugin "$site" "${SITES[$site]}"
        done
        ;;
    *)
        echo "无效选项"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "诊断完成"
echo "=========================================="
echo ""
echo "常见问题解决方案："
echo "1. 如果 JS 文件不存在：插件可能未正确安装，需要重新安装"
echo "2. 如果文件存在但无法访问：检查文件权限和 .htaccess 配置"
echo "3. 如果路径错误：检查插件的 enqueue 脚本配置"
echo "4. 如果返回 HTML 而不是 JS：检查服务器重写规则"



