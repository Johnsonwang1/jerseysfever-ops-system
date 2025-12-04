# Jerseysfever OPS System

Jerseysfever 商品上架管理系统 - 基于 React + TypeScript + Supabase 构建。

## 功能特性

- 🚀 **商品上架** - 拖拽上传、AI 自动识别属性、批量发布到多站点
- 📦 **草稿管理** - 自动保存草稿，支持批量 AI 生成和发布
- 🔄 **多站点同步** - 统一管理 com/uk/de/fr 四个站点
- 🤖 **AI 内容生成** - 基于 Gemini 自动生成多语言商品描述
- 📊 **商品管理** - 商品列表、筛选、批量操作
- 🔗 **Webhook 同步** - 实时同步 WooCommerce 数据变更

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **UI**: Tailwind CSS + Lucide Icons
- **后端**: Supabase (PostgreSQL + Edge Functions)
- **AI**: Google Gemini API
- **部署**: Vercel / Netlify

## 快速开始

### 环境变量

创建 `.env` 文件：

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 安装依赖

```bash
npm install
```

### 开发

```bash
npm run dev
```

### 构建

```bash
npm run build
```

## 项目结构

```
jerseysfever-ops-system/
├── src/
│   ├── components/      # React 组件
│   ├── lib/            # 工具函数和服务
│   ├── pages/          # 页面组件
│   └── hooks/          # React Hooks
├── supabase/
│   ├── functions/      # Edge Functions
│   └── migrations/     # 数据库迁移
└── public/             # 静态资源
```

## Edge Functions

- `woo-sync` - WooCommerce 同步服务
- `woo-webhook` - Webhook 处理
- `ai-service` - Gemini AI 服务

## License

Private
