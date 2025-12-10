import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// 读取 .env
const envPath = path.join(process.cwd(), '.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const envLines = envContent.split('\n')

for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) {
    process.env[match[1].trim()] = match[2].trim()
  }
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function main() {
  console.log('Querying fb_ads_daily...')
  
  const { data, error, count } = await supabase
    .from('fb_ads_daily')
    .select('account_id, campaign_name', { count: 'exact' })
    .limit(1000)

  console.log('Count:', count)
  console.log('Data length:', data?.length)
  
  if (error) {
    console.error('Error:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log('No data found')
    return
  }

  // 按 account_id 分组，收集 campaign_name
  const accountCampaigns = new Map<string, Set<string>>()
  for (const row of data) {
    if (!accountCampaigns.has(row.account_id)) {
      accountCampaigns.set(row.account_id, new Set())
    }
    if (row.campaign_name) {
      accountCampaigns.get(row.account_id)!.add(row.campaign_name)
    }
  }

  for (const [accountId, campaigns] of accountCampaigns) {
    console.log(`\n账户 ${accountId}:`)
    for (const name of Array.from(campaigns).slice(0, 10)) {
      console.log(`  - ${name}`)
    }
    if (campaigns.size > 10) {
      console.log(`  ... 还有 ${campaigns.size - 10} 个`)
    }
  }
}

main().catch(console.error)
