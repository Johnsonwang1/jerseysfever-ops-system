import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
