# WooCommerce Webhook 配置指南

本系统使用 WooCommerce Webhooks 实现商品数据实时同步。当 WooCommerce 中的商品被创建、更新或删除时，会自动同步到本地 Supabase 数据库。

## Webhook 端点

```
https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/woo-webhook
```

## 配置步骤

### 1. 登录 WordPress 后台

访问各站点的 WordPress 管理后台：
- .com: https://jerseysfever.com/wp-admin
- .uk: https://jerseysfever.co.uk/wp-admin
- .de: https://jerseysfever.de/wp-admin
- .fr: https://jerseysfever.fr/wp-admin

### 2. 进入 Webhooks 设置

导航到：**WooCommerce → 设置 → 高级 → Webhooks**

### 3. 创建 Webhooks

需要为每个站点创建 3 个 Webhook：

#### Webhook 1: 商品创建
- **名称**: Product Created Sync
- **状态**: 活跃
- **主题**: 商品已创建 (Product created)
- **发送 URL**: `https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/woo-webhook`
- **密钥**: (留空或设置一个密钥用于验证)
- **API 版本**: WP REST API Integration v3

#### Webhook 2: 商品更新
- **名称**: Product Updated Sync
- **状态**: 活跃
- **主题**: 商品已更新 (Product updated)
- **发送 URL**: `https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/woo-webhook`
- **密钥**: (与上面相同)
- **API 版本**: WP REST API Integration v3

#### Webhook 3: 商品删除
- **名称**: Product Deleted Sync
- **状态**: 活跃
- **主题**: 商品已删除 (Product deleted)
- **发送 URL**: `https://iwzohjbvuhwvfidyevpf.supabase.co/functions/v1/woo-webhook`
- **密钥**: (与上面相同)
- **API 版本**: WP REST API Integration v3

### 4. 保存并测试

1. 点击「保存 Webhook」
2. 在商品列表中随便编辑一个商品并保存
3. 查看本地商品管理页面，应该能看到实时更新

## 数据流

```
WooCommerce 商品变更
        ↓
  触发 Webhook
        ↓
Supabase Edge Function (woo-webhook)
        ↓
  更新 products 表
        ↓
Supabase Realtime 推送
        ↓
  前端自动刷新
```

## 注意事项

1. **每个站点都需要配置**：4 个站点 × 3 个事件 = 12 个 Webhooks
2. **Webhook 签名验证**：当前未启用，如需要可在 Edge Function 中添加
3. **延迟**：通常在 1-2 秒内完成同步
4. **失败重试**：WooCommerce 会自动重试失败的 Webhook（最多 5 次）

## 调试

查看 Edge Function 日志：
1. 打开 Supabase Dashboard
2. 导航到 Edge Functions → woo-webhook → Logs
3. 查看请求日志和错误信息

## 常见问题

### Q: Webhook 没有触发？
- 确认 Webhook 状态为「活跃」
- 检查发送 URL 是否正确
- 查看 WooCommerce → 状态 → 日志 中是否有错误

### Q: 数据没有同步？
- 查看 Supabase Edge Function 日志
- 确认 products 表 RLS 策略正确
- 检查 Realtime 是否已启用

### Q: 前端没有实时更新？
- 确认浏览器控制台没有 WebSocket 错误
- 检查 Supabase Realtime 是否正常连接
- 刷新页面重新建立连接
