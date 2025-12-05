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
npm run preview      # Preview production build

# Type checking
npx tsc --noEmit     # Check types without emitting

# Supabase Edge Functions (requires login first)
npx supabase login --token <SUPABASE_ACCESS_TOKEN>
npx supabase functions deploy <function-name> --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf
```

## Architecture

### Frontend (React + Vite + Tailwind)
- **Entry**: `src/main.tsx` → `src/App.tsx`
- **Auth**: `src/lib/auth.tsx` - React Context-based authentication using Supabase Auth
- **Routing**: React Router with lazy-loaded pages (`ProductsPage`, `UsersPage`, `LoginPage`)
- **State**: React Query for server state, React Context for auth
- **UI**: Tailwind CSS v4, Lucide icons

### Data Layer (`src/lib/`)
- `supabase.ts` - Supabase client, image upload to Storage, category sync
- `products.ts` - Product CRUD, Realtime subscriptions, query with filters
- `types.ts` - Core types: `SiteKey`, `ProductInfo`, `WooProduct`, etc.
- `ai.ts` - AI service (Gemini) for jersey recognition and content generation
- `sync-api.ts` / `sync-service.ts` - WooCommerce sync operations

### Backend (Supabase Edge Functions in `supabase/functions/`)
- **woo-sync**: Main sync service - publish products, sync to sites, batch operations, register webhooks
- **woo-webhook**: Receives WooCommerce webhooks, updates local DB on product changes
- **ai-service**: Gemini AI for jersey attribute recognition and multilingual content generation
- **User management**: `create-user`, `delete-user`, `update-user`, `reset-password`, `init-admin`

### Database Schema (Supabase PostgreSQL)
- `products` table: SKU as primary key, JSONB fields for per-site data:
  - `woo_ids`: `{ com: 123, uk: 124, de: 125, fr: 126 }`
  - `prices`, `regular_prices`, `stock_quantities`, `statuses` - all per-site JSONB
  - `content`: Multilingual `{ com: {name, description}, de: {...}, fr: {...} }`
  - `sync_status`: `{ com: 'synced', uk: 'error', ... }`
- `woo_categories`: Cached WooCommerce categories per site
- `user_profiles`: User roles (admin/editor/viewer)

### Multi-Site Architecture
Sites share the same SKU but have independent: prices, stock, status, content (language-specific), WooCommerce IDs.
- `.com` and `.uk` share English content
- `.de` uses German content
- `.fr` uses French content

## Key Patterns

### WooCommerce API
Credentials via env vars: `WOO_COM_KEY`, `WOO_COM_SECRET`, `WOO_UK_KEY`, etc.
Edge Functions use Basic Auth to call WooCommerce REST API v3.

### Product Sync Flow
1. Frontend calls `woo-sync` Edge Function with action (`sync-product`, `publish-product`, etc.)
2. Edge Function fetches/updates WooCommerce via REST API
3. Updates Supabase `products` table
4. Frontend receives Realtime updates via subscription

### AI Content Generation
1. Upload jersey images
2. AI recognizes attributes (team, season, type, version)
3. AI generates multilingual content based on confirmed attributes
4. Content stored per-site in `products.content` JSONB

## Environment Variables

Frontend (`.env`):
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Edge Functions (Supabase Dashboard):
```
WOO_COM_KEY, WOO_COM_SECRET
WOO_UK_KEY, WOO_UK_SECRET
WOO_DE_KEY, WOO_DE_SECRET
WOO_FR_KEY, WOO_FR_SECRET
GEMINI_API_KEY
```

## Supabase Operations

Use MCP tools for database queries and migrations. Use CLI only for Edge Function deployment.

```
# MCP tools (preferred)
mcp__supabase__execute_sql - Run queries
mcp__supabase__apply_migration - DDL changes
mcp__supabase__list_tables - View schema
mcp__supabase__get_logs - Debug Edge Functions

# CLI (for Edge Functions)
npx supabase functions deploy woo-sync --no-verify-jwt --project-ref iwzohjbvuhwvfidyevpf
```

## SiteGround SSH (WordPress servers)

```bash
# SSH hosts configured in ~/.ssh/config
ssh siteground      # jerseysfever.de
ssh siteground-com  # jerseysfever.com
ssh siteground-fr   # jerseysfever.fr
ssh siteground-uk   # jerseysfever.uk

# WordPress root: www/jerseysfever.{tld}/public_html/
```
