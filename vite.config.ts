import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 支持 VITE_, NEXT_PUBLIC_, SUPABASE_ 前缀的环境变量
  envPrefix: ['VITE_', 'NEXT_PUBLIC_', 'SUPABASE_'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 相关库单独打包
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // 将 Supabase 单独打包
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
