// 同步 Facebook Ads 数据脚本 - 调用 Edge Function
// 使用: npx tsx scripts/sync-fb-ads.ts

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevpf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0MzY4NTMsImV4cCI6MjA0NzAxMjg1M30.GgQfJTjc9UMLbQTniCMn4zcBQVD7_lWiqp2hGHjvvOE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function syncFbAds() {
  // 计算近30天的日期范围
  const today = new Date()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(today.getDate() - 29)

  const dateFrom = thirtyDaysAgo.toISOString().split('T')[0]
  const dateTo = today.toISOString().split('T')[0]

  console.log(`\n📊 同步 Facebook Ads 数据`)
  console.log(`日期范围: ${dateFrom} ~ ${dateTo}`)
  console.log('-----------------------------------\n')

  try {
    console.log('🔄 调用 Edge Function...')

    const { data, error } = await supabase.functions.invoke('fb-ads-sync', {
      body: {
        action: 'sync',
        date_from: dateFrom,
        date_to: dateTo,
      },
    })

    if (error) {
      console.error('❌ 同步失败:', error.message)
      console.log('详细错误:', JSON.stringify(error, null, 2))
      return
    }

    if (data?.error) {
      console.error('❌ 同步失败:', data.error)
      return
    }

    console.log('✅ 同步完成!')
    console.log(`📦 同步记录数: ${data?.records_synced || 0}`)

  } catch (err) {
    console.error('❌ 错误:', err)
  }
}

syncFbAds()
