# SiteGround 连接与操作规则

## SSH 连接配置

### 1. SSH密钥管理
- **公钥位置**: `~/.ssh/id_ed25519.pub`
- **SiteGround上传**: 必须在SiteGround控制面板的SSH Keys Manager中上传公钥
- **密钥指纹**: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAz6tZlTpXw/uRRZeXUSr5CPbEZEz/mWdOIlE3WdLKxi mac ssh key`

### 2. SSH配置文件 (`~/.ssh/config`)

#### jerseysfever.de (德国站，原 jerseysfeverco.com)
```
Host siteground
    HostName c1106643.sgvps.net
    User u2-xir29d7krklo
    Port 18765
    IdentityFile ~/.ssh/id_ed25519
```

#### jerseysfever.com
```
Host siteground-com
    HostName c1106643.sgvps.net
    User u14-uzw9vveqwyis
    Port 18765
    IdentityFile ~/.ssh/id_ed25519
```

#### jerseysfever.fr (法国站)
```
Host siteground-fr
    HostName c1106643.sgvps.net
    User u6-qxh1engk0meb
    Port 18765
    IdentityFile ~/.ssh/id_ed25519
```

#### jerseysfever.uk
```
Host siteground-uk
    HostName c1106643.sgvps.net
    User u7-5hqfgephbn8m
    Port 18765
    IdentityFile ~/.ssh/id_ed25519
```

### 3. 连接验证命令

#### 德国站验证 (jerseysfever.de)
```bash
ssh siteground "echo 'jerseysfever.de连接成功'"
```

#### 法国站验证
```bash
ssh siteground-fr "echo '法国站连接成功'"
```

#### jerseysfever.uk验证
```bash
ssh siteground-uk "echo 'jerseysfever.uk连接成功'"
```

#### jerseysfever.com验证
```bash
ssh siteground-com "echo 'jerseysfever.com连接成功'"
```

## 网站结构与路径

### jerseysfever.de (德国站，原 jerseysfeverco.com)
```
www/jerseysfever.de/
├── public_html/           # 网站根目录
│   ├── wp-config.php     # WordPress配置文件
│   ├── wp-content/       # WordPress内容目录
│   │   ├── plugins/      # 插件目录
│   │   ├── themes/       # 主题目录 (Rey + Rey Child)
│   │   ├── uploads/      # 媒体文件目录
│   │   └── mu-plugins/   # Must-use插件目录
│   └── wp-admin/         # WordPress后台
└── logs/                  # 网站日志目录
```

### jerseysfever.fr (法国站)
```
www/jerseysfever.fr/
├── public_html/           # 网站根目录
│   ├── wp-config.php     # WordPress配置文件
│   ├── wp-content/       # WordPress内容目录
│   │   ├── plugins/      # 插件目录
│   │   ├── themes/       # 主题目录 (Rey + Rey Child)
│   │   ├── uploads/      # 媒体文件目录
│   │   └── mu-plugins/   # Must-use插件目录
│   └── wp-admin/         # WordPress后台
└── logs/                  # 网站日志目录
```

### jerseysfever.uk (英国站)
```
www/jerseysfever.uk/
├── public_html/           # 网站根目录
│   ├── wp-config.php     # WordPress配置文件
│   ├── wp-content/       # WordPress内容目录
│   │   ├── plugins/      # 插件目录
│   │   ├── themes/       # 主题目录 (Rey + Rey Child)
│   │   ├── uploads/      # 媒体文件目录
│   │   └── mu-plugins/   # Must-use插件目录
│   └── wp-admin/         # WordPress后台
└── logs/                  # 网站日志目录
```

### jerseysfever.com
```
www/jerseysfever.com/
├── public_html/           # 网站根目录
│   ├── wp-config.php     # WordPress配置文件
│   ├── wp-content/       # WordPress内容目录
│   │   ├── plugins/      # 插件目录
│   │   ├── themes/       # 主题目录
│   │   ├── uploads/      # 媒体文件目录
│   │   └── mu-plugins/   # Must-use插件目录
│   └── wp-admin/         # WordPress后台
└── logs/                  # 网站日志目录
```

### 重要日志文件
- **访问日志**: `logs/jerseysfever.de-YYYY-MM-DD.gz` (原 jerseysfeverco.com)
- **PHP错误日志**: `public_html/php_errorlog`
- **WooCommerce错误**: `public_html/wp-content/uploads/wc-logs/fatal-errors-*.log`
- **WordPress调试日志**: `public_html/wp-content/debug.log`

## WordPress管理命令

### 1. WP-CLI基础命令

#### 德国站 (jerseysfever.de，原 jerseysfeverco.com)
```bash
# 基本信息
ssh siteground "cd www/jerseysfever.de/public_html && wp --info --allow-root"

# 检查网站状态
ssh siteground "cd www/jerseysfever.de/public_html && wp site status --allow-root"

# 查看插件列表
ssh siteground "cd www/jerseysfever.de/public_html && wp plugin list --allow-root"

# 查看主题状态
ssh siteground "cd www/jerseysfever.de/public_html && wp theme list --allow-root"
```

#### jerseysfever.com
```bash
# 基本信息
ssh siteground-com "cd www/jerseysfever.com/public_html && wp --info --allow-root"

# 检查网站状态
ssh siteground-com "cd www/jerseysfever.com/public_html && wp site status --allow-root"

# 查看插件列表
ssh siteground-com "cd www/jerseysfever.com/public_html && wp plugin list --allow-root"

# 查看主题状态
ssh siteground-com "cd www/jerseysfever.com/public_html && wp theme list --allow-root"
```

#### 法国站 (jerseysfever.fr)
```bash
# 基本信息
ssh siteground-fr "cd www/jerseysfever.fr/public_html && wp --info --allow-root"

# 检查网站状态
ssh siteground-fr "cd www/jerseysfever.fr/public_html && wp site status --allow-root"

# 查看插件列表
ssh siteground-fr "cd www/jerseysfever.fr/public_html && wp plugin list --allow-root"

# 查看主题状态
ssh siteground-fr "cd www/jerseysfever.fr/public_html && wp theme list --allow-root"
```

### 2. 数据库操作
```bash
# 数据库查询
ssh siteground "cd www/jerseysfever.de/public_html && wp db query 'SQL语句' --allow-root"

# 数据库优化
ssh siteground "cd www/jerseysfever.de/public_html && wp db optimize --allow-root"

# 数据库备份
ssh siteground "cd www/jerseysfever.de/public_html && wp db export backup-$(date +%Y%m%d).sql --allow-root"
```

### 3. 缓存管理
```bash
# 清理所有缓存
ssh siteground "cd www/jerseysfever.de/public_html && wp cache flush --allow-root"

# 重新生成缩略图
ssh siteground "cd www/jerseysfever.de/public_html && wp media regenerate --allow-root"
```

## 性能监控脚本

### 1. 网站健康检查脚本 (`site_health_check.sh`)
```bash
#!/bin/bash
echo "=== 网站健康检查报告 $(date) ==="

echo "📊 内存使用情况:"
ssh siteground "cd www/jerseysfever.de/public_html && wp cli info --fields=memory_usage,memory_peak_usage,memory_limit --format=yaml --allow-root"

echo "🔍 最新错误日志:"
ssh siteground "cd www/jerseysfever.de/public_html/wp-content/uploads/wc-logs/ && tail -n 10 fatal-errors-$(date +%Y-%m-%d)-*.log 2>/dev/null || echo '✅ 今日暂无致命错误'"

echo "⏰ Cron任务状态:"
ssh siteground "cd www/jerseysfever.de/public_html && wp cron event list --fields=hook,next_run_gmt,next_run_relative,recurrence --allow-root"

echo "🗄️ 数据库状态:"
ssh siteground "cd www/jerseysfever.de/public_html && wp db size --human --allow-root"

echo "✅ 网站可访问性:"
ssh siteground "curl -I https://jerseysfever.de"
```

### 2. 日志清理脚本 (`log_cleanup.sh`)
```bash
#!/bin/bash
echo "=== 日志清理开始 $(date) ==="

echo "🧹 清理ActionScheduler旧数据..."
ssh siteground "cd www/jerseysfever.de/public_html && wp action-scheduler clean --status=complete --age=14.days --allow-root"
ssh siteground "cd www/jerseysfever.de/public_html && wp action-scheduler clean --status=canceled --age=14.days --allow-root"
ssh siteground "cd www/jerseysfever.de/public_html && wp action-scheduler clean --status=failed --age=14.days --allow-root"

echo "🗂️ 清理过期transients..."
ssh siteground "cd www/jerseysfever.de/public_html && wp transient delete --expired --allow-root"

echo "📦 清理WooCommerce旧日志..."
ssh siteground "find www/jerseysfever.de/public_html/wp-content/uploads/wc-logs/ -type f -mtime +30 -name '*.log' -delete"

echo "🐛 清理PHP错误日志..."
ssh siteground "find www/jerseysfever.de/public_html/ -type f -name 'php_errorlog' -size +1M -mtime +7 -delete"

echo "✅ 日志清理完成！"
```

## 常见问题排查

### 1. 502 Bad Gateway错误
```bash
# 检查服务器进程
ssh siteground "ps aux | grep -E 'nginx|apache|php'"

# 检查错误日志
ssh siteground "tail -50 www/jerseysfever.de/public_html/php_errorlog"

# 检查WordPress维护模式
ssh siteground "ls -la www/jerseysfever.de/public_html/.maintenance"
```

### 2. 内存错误
```bash
# 检查当前内存设置
ssh siteground "cd www/jerseysfever.de/public_html && wp cli info --fields=memory_limit --allow-root"

# 检查debug.log大小
ssh siteground "ls -lh www/jerseysfever.de/public_html/wp-content/debug.log"
```

### 3. 数据库锁定
```bash
# 检查数据库进程
ssh siteground "cd www/jerseysfever.de/public_html && wp db query 'SHOW PROCESSLIST;' --allow-root"

# 优化数据库表
ssh siteground "cd www/jerseysfever.de/public_html && wp db optimize --allow-root"
```

## CDN与缓存配置

### SiteGround CDN状态检查
```bash
# 检查CDN响应头
ssh siteground "curl -I https://jerseysfever.de/wp-content/uploads/2025/05/10003-600x600.jpg | grep -i 'cdn\|cache\|server'"

# 预期输出应包含:
# x-cdn-c: static
# x-cache-enabled: True
```

### SuperCacher状态
- **已启用**: `x-cache-enabled: True` 在响应头中
- **CDN状态**: 面板可能显示"PENDING"，但实际已在工作

## 安全注意事项

### 1. 文件权限
```bash
# 检查敏感文件权限
ssh siteground "ls -la www/jerseysfever.de/public_html/wp-config.php"

# 修复权限问题
ssh siteground "chmod 644 www/jerseysfever.de/public_html/wp-config.php"
```

### 2. 备份策略
```bash
# 创建WordPress文件备份
ssh siteground "cp -r www/jerseysfever.de/public_html www/jerseysfever.de/backup-$(date +%Y%m%d)"

# 创建数据库备份
ssh siteground "cd www/jerseysfever.de/public_html && wp db export ../backup-db-$(date +%Y%m%d).sql --allow-root"
```

## 性能优化配置

### wp-config.php优化设置
```php
/* 高性能优化设置 */
if (!defined('WP_DEBUG')) define('WP_DEBUG', false);
if (!defined('WP_DEBUG_LOG')) define('WP_DEBUG_LOG', false);
if (!defined('WP_DEBUG_DISPLAY')) define('WP_DEBUG_DISPLAY', false);
if (!defined('SCRIPT_DEBUG')) define('SCRIPT_DEBUG', false);

/* 内存优化 */
define('WP_MEMORY_LIMIT', '2048M');
define('WP_MAX_MEMORY_LIMIT', '4096M');

/* 缓存设置 */
define('WP_CACHE', true);
define('CONCATENATE_SCRIPTS', false);
define('COMPRESS_SCRIPTS', false);
define('COMPRESS_CSS', false);

/* ActionScheduler优化 */
define('ACTION_SCHEDULER_RETENTION_PERIOD', 604800); // 7天自动清理

/* 图片质量优化 */
define('JPG_QUALITY', 95);
define('WEBP_QUALITY', 95);
```

## 常用维护命令

### 1. 每月维护任务
```bash
# 运行网站健康检查
~/site_health_check.sh

# 清理日志文件
~/log_cleanup.sh

# 更新所有插件
ssh siteground "cd www/jerseysfever.de/public_html && wp plugin update --all --allow-root"

# 优化数据库
ssh siteground "cd www/jerseysfever.de/public_html && wp db optimize --allow-root"
```

### 2. 每日检查命令
```bash
# 检查错误日志
ssh siteground "tail -20 www/jerseysfever.de/public_html/php_errorlog"

# 检查网站可访问性
ssh siteground "curl -I https://jerseysfever.de"

# 检查磁盘使用
ssh siteground "du -sh www/jerseysfever.de/public_html/"
```

---

## 重要提醒

1. **始终备份**: 在进行任何修改前创建备份
2. **测试环境**: 重要更改先在测试环境中验证
3. **监控日志**: 定期检查错误和访问日志
4. **安全更新**: 及时更新插件和主题
5. **性能监控**: 使用提供的脚本来监控性能

通过遵循这些规则，LLM可以高效地管理SiteGround上的WordPress网站。
