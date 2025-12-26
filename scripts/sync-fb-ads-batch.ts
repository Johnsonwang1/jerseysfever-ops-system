// 批量同步 Facebook Ads 历史数据
// 使用: npx tsx scripts/sync-fb-ads-batch.ts
// 分月同步，避免超时

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://iwzohjbvuhwvfidyevpf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3em9oamJ2dWh3dmZpZHlldnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzE0MzY4NTMsImV4cCI6MjA0NzAxMjg1M30.GgQfJTjc9UMLbQTniCMn4zcBQVD7_lWiqp2hGHjvvOE'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 生成月份范围
function getMonthRanges(startDate: string, endDate: string): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  let current = new Date(start.getFullYear(), start.getMonth(), 1)

  while (current <= end) {
    const monthStart = new Date(current)
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)

    // 调整第一个月和最后一个月的边界
    const from = monthStart < start ? startDate : monthStart.toISOString().split('T')[0]
    const to = monthEnd > end ? endDate : monthEnd.toISOString().split('T')[0]

    ranges.push({ from, to })

    // 下一个月
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  }

  return ranges
}

async function syncMonth(dateFrom: string, dateTo: string): Promise<{ success: boolean; records?: number; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('fb-ads-sync', {
      body: {
        action: 'sync',
        date_from: dateFrom,
        date_to: dateTo,
      },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data?.error) {
      return { success: false, error: data.error }
    }

    return { success: true, records: data?.records_synced || 0 }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function main() {
  const START_DATE = '2024-01-01'
  const END_DATE = new Date().toISOString().split('T')[0]

  console.log(`\n📊 批量同步 Facebook Ads 历史数据`)
  console.log(`日期范围: ${START_DATE} ~ ${END_DATE}`)
  console.log('=========================================\n')

  const monthRanges = getMonthRanges(START_DATE, END_DATE)
  console.log(`共 ${monthRanges.length} 个月需要同步\n`)

  let totalRecords = 0
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < monthRanges.length; i++) {
    const { from, to } = monthRanges[i]
    console.log(`[${i + 1}/${monthRanges.length}] 同步 ${from} ~ ${to}...`)

    const result = await syncMonth(from, to)

    if (result.success) {
      console.log(`   ✅ 成功，${result.records} 条记录`)
      totalRecords += result.records || 0
      successCount++
    } else {
      console.log(`   ❌ 失败: ${result.error}`)
      failCount++
    }

    // 每次同步后等待 2 秒，避免请求过快
    if (i < monthRanges.length - 1) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  console.log('\n=========================================')
  console.log(`📈 同步完成!`)
  console.log(`   成功: ${successCount} 个月`)
  console.log(`   失败: ${failCount} 个月`)
  console.log(`   总记录数: ${totalRecords}`)
}

main()

