# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

JerseysFever Ops System is a React-based product management system for jersey e-commerce. It synchronizes products across 4 WooCommerce sites (jerseysfever.com, .uk, .de, .fr) using Supabase as the central database and Edge Functions for backend operations.

## Commands

```bash
# Development
npm run dev          # Start dev server (Vite)
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npx tsc --noEmit     # Type check only

# Supabase Edge Functions
npx supabase functions deploy <function-name> --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf
```

## Architecture

### Frontend (React + Vite + Tailwind)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **Auth**: `src/lib/auth.tsx` - React Context using Supabase Auth
- **Routing**: React Router with lazy-loaded pages (`ProductsPage`, `UsersPage`, `LoginPage`)
- **UI**: Tailwind CSS v4, Lucide icons

### State Management (TanStack Query / React Query)

**Configuration** (`src/lib/queryClient.ts`):
- `staleTime`: 5 min (data freshness)
- `gcTime`: 30 min (cache duration)
- `refetchOnWindowFocus`: false (using Realtime instead)
- `retry`: 1 for queries, 0 for mutations

**Query Keys** (`queryKeys` object):
```typescript
queryKeys.products.list(filters)  // Product list with filters
queryKeys.products.detail(sku)    // Single product
queryKeys.products.stats()        // Product statistics
queryKeys.categories.bySite(site) // Categories per site
queryKeys.aiTasks.pending()       // AI tasks pending
```

**Key Hooks** (`src/hooks/useProducts.ts`):
- `useProducts(params)` - Product list with client-side filtering for special filters
- `useProduct(sku)` - Single product query
- `useUpdateProduct()` - Mutation with optimistic updates
- `useDeleteProduct()` - Mutation with cache removal
- `useProductsRealtime()` - Supabase Realtime integration for auto-refresh
- `useBatchPullVariations()` - Batch operations with retry logic

**Realtime + React Query Pattern**:
```typescript
// Subscribe to Supabase Realtime, then update React Query cache
subscribeToProducts(({ eventType, new: newProduct }) => {
  queryClient.setQueryData(queryKeys.products.detail(sku), newProduct);
  queryClient.refetchQueries({ queryKey: queryKeys.products.list({}) });
});
```

### Data Layer (`src/lib/`)
- `supabase.ts` - Supabase client, image upload to Storage, category sync
- `products.ts` - Product CRUD, Realtime subscriptions, query with filters
- `types.ts` - Core types: `SiteKey`, `ProductInfo`, `WooProduct`
- `ai.ts` - Gemini AI for jersey recognition and content generation
- `sync-api.ts` / `sync-service.ts` - WooCommerce sync operations

### Backend (Supabase Edge Functions in `supabase/functions/`)
- **woo-sync**: Main sync service - publish products, sync to sites, batch operations
- **woo-webhook**: Receives WooCommerce webhooks, updates local DB
- **ai-service**: Gemini AI for jersey attribute recognition and multilingual content
- **User management**: `create-user`, `delete-user`, `update-user`, `reset-password`

### Database Schema (Supabase PostgreSQL)
- `products` table: SKU as primary key, JSONB fields for per-site data:
  - `woo_ids`: `{ com: 123, uk: 124, de: 125, fr: 126 }`
  - `prices`, `regular_prices`, `stock_quantities`, `statuses` - all per-site JSONB
  - `content`: Multilingual `{ com: {name, description}, de: {...}, fr: {...} }`
  - `sync_status`: `{ com: 'synced', uk: 'error', ... }`
- `woo_categories`: Cached WooCommerce categories per site
- `user_profiles`: User roles (admin/editor/viewer)
- `ai_image_tasks`: AI task queue with status tracking

### Multi-Site Architecture
Sites share the same SKU but have independent: prices, stock, status, content (language-specific), WooCommerce IDs.
- `.com` and `.uk` share English content
- `.de` uses German content
- `.fr` uses French content

## Key Patterns

### Product Sync Flow
1. Frontend calls `woo-sync` Edge Function with action (`sync-product`, `publish-product`)
2. Edge Function fetches/updates WooCommerce via REST API (Basic Auth)
3. Updates Supabase `products` table
4. Supabase Realtime notifies frontend → React Query cache auto-updates

### AI Content Generation
1. Upload jersey images
2. AI recognizes attributes (team, season, type, version)
3. AI generates multilingual content based on confirmed attributes
4. Content stored per-site in `products.content` JSONB

### Batch Operations with Retry
```typescript
// Pattern used in useBatchPullVariations, useBatchRebuildVariations
const BATCH_SIZE = 20;
for (let i = 0; i < skus.length; i += BATCH_SIZE) {
  const batch = skus.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(sku => pullWithRetry(sku, site)));
}
```

## Supabase Operations

Use MCP tools for database queries and migrations. Use CLI only for Edge Function deployment.

| Operation | Tool |
|-----------|------|
| SQL queries | `mcp__supabase__execute_sql` |
| DDL changes | `mcp__supabase__apply_migration` |
| View schema | `mcp__supabase__list_tables` |
| Debug logs | `mcp__supabase__get_logs` |
| Edge Functions | CLI with `--no-verify-jwt` |

**Project ID**: `iwzohjbvuhwvfidyevpf`

## SiteGround SSH (WordPress Servers)

```bash
ssh siteground      # jerseysfever.de
ssh siteground-com  # jerseysfever.com
ssh siteground-fr   # jerseysfever.fr
ssh siteground-uk   # jerseysfever.uk

# WordPress root: www/jerseysfever.{tld}/public_html/
```

### 修改站内文件规则

**重要**: 修改 WordPress 站点文件时，必须遵循以下流程：

1. **先下载到本地**: 使用 `ssh` 下载文件到本地临时目录
2. **本地修改**: 在本地进行编辑和修改
3. **验证语法**: 如果是 PHP 文件，先验证语法 `php -l <file>`
4. **再上传**: 确认无误后通过 `ssh` 上传回服务器

```bash
# 示例：修改 functions.php
ssh siteground-com "cat www/jerseysfever.com/public_html/wp-content/themes/rey-child/functions.php" > /tmp/functions.php
# 本地修改 /tmp/functions.php
cat /tmp/functions.php | ssh siteground-com "cat > www/jerseysfever.com/public_html/wp-content/themes/rey-child/functions.php"
```

**禁止**: 直接在服务器上使用 `sed` 等命令修改文件，容易破坏代码结构。

## GCP Projects

### Cloud Functions Project (snapnest-453114)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="gcp-key/snapnest-453114-c1b3bb4db875.json"
gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS"
gcloud config set project snapnest-453114
```

Available functions (asia-southeast1): `snapnest-generative-flux`, `snapnest-generative-gemini-image`, `snapnest-generative-gemini25-flash`, `snapnest-generative-imagen`, `snapnest-generative-storage`, `snapnest-generative-veo`, `snapnest-professional-stitcher`

### BigQuery Data Project (jerseysfever-48104)

```bash
export GOOGLE_APPLICATION_CREDENTIALS="gcp-key/jerseysfever-48104-ee946428262a.json"
gcloud auth activate-service-account --key-file="$GOOGLE_APPLICATION_CREDENTIALS"
gcloud config set project jerseysfever-48104
```

**Datasets:**
- `facebook` - Facebook Ads data (via Airbyte)
  - `ads_insights_country` - Ads performance by country
  - `ads_insights_action_product_id` - Ads performance by product
- `woocommerce_jerseysfever_v2` - WooCommerce data
- `hisleep_shopify` - Shopify data
- `currency_api` - Exchange rates

**Facebook Ads Key Fields:**
```sql
SELECT date_start, account_id, campaign_name, country,
       spend, impressions, clicks, cpc, cpm, ctr, reach
FROM `jerseysfever-48104.facebook.ads_insights_country`
```

**Ad Account IDs:** `1103277014970589`, `850857584136697`, `841672715090675`, `828014633150121`

## Git Configuration

- Username: `Johnsonwang1`
- Email: `Johnsonwang1@users.noreply.github.com`
- Always verify git account before committing: `git config user.name && git config user.email`

## Local Development

Check port before starting: `lsof -i :5173` - use `PORT=5174 npm run dev` if occupied.
