// 同步 Facebook Ads 数据脚本 - 调用 Edge Function
// 使用: npx tsx scripts/sync-fb-ads.ts
// 同时同步广告数据和产品级别广告数据（增量）

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevpf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0MzY4NTMsImV4cCI6MjA0NzAxMjg1M30.GgQfJTjc9UMLbQTniCMn4zcBQVD7_lWiqp2hGHjvvOE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function syncFbAds() {
  // 增量同步：近 3 天
  const today = new Date()
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(today.getDate() - 2)

  const dateFrom = threeDaysAgo.toISOString().split('T')[0]
  const dateTo = today.toISOString().split('T')[0]

  console.log(`\n📊 同步 Facebook Ads 数据（增量）`)
  console.log(`日期范围: ${dateFrom} ~ ${dateTo}`)
  console.log('-----------------------------------\n')

  try {
    // 1. 同步广告级别数据
    console.log('🔄 [1/2] 同步广告数据...')
    const { data: adsData, error: adsError } = await supabase.functions.invoke('fb-ads-sync', {
      body: {
        action: 'sync',
        date_from: dateFrom,
        date_to: dateTo,
      },
    })

    if (adsError) {
      console.error('❌ 广告数据同步失败:', adsError.message)
    } else if (adsData?.error) {
      console.error('❌ 广告数据同步失败:', adsData.error)
    } else {
      console.log(`✅ 广告数据同步完成! 记录数: ${adsData?.records_synced || 0}`)
    }

    // 2. 同步产品级别广告数据
    console.log('\n🔄 [2/2] 同步产品广告数据...')
    const { data: productData, error: productError } = await supabase.functions.invoke('fb-ads-sync', {
      body: {
        action: 'sync-products',
        date_from: dateFrom,
        date_to: dateTo,
      },
    })

    if (productError) {
      console.error('❌ 产品广告数据同步失败:', productError.message)
    } else if (productData?.error) {
      console.error('❌ 产品广告数据同步失败:', productData.error)
    } else {
      console.log(`✅ 产品广告数据同步完成! 记录数: ${productData?.records_synced || 0}`)
    }

    console.log('\n✅ 全部同步完成!')

  } catch (err) {
    console.error('❌ 错误:', err)
  }
}

syncFbAds()
