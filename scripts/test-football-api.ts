/**
 * Football-Data.org API 测试脚本
 * 
 * 使用方法:
 * 1. 注册获取 API Key: https://www.football-data.org/client/register
 * 2. 设置环境变量: export FOOTBALL_DATA_API_KEY=your_api_key
 * 3. 运行: npx tsx scripts/test-football-api.ts
 */

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY || '';
const BASE_URL = 'https://api.football-data.org/v4';

// 免费层支持的联赛代码
const FREE_COMPETITIONS = {
  PL: 'Premier League',      // 英超
  BL1: 'Bundesliga',         // 德甲
  FL1: 'Ligue 1',            // 法甲
  SA: 'Serie A',             // 意甲
  PD: 'La Liga',             // 西甲
  CL: 'Champions League',    // 欧冠
  EL: 'Europa League',       // 欧联
  CLI: 'Africa Cup of Nations', // 非洲杯
  WC: 'World Cup',           // 世界杯
  EC: 'European Championship' // 欧洲杯
};

interface Match {
  id: number;
  utcDate: string;
  status: string;
  competition: {
    id: number;
    name: string;
    code: string;
  };
  homeTeam: {
    id: number;
    name: string;
    shortName: string;
    crest: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName: string;
    crest: string;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
}

async function fetchMatches(competitionCode: string, dateFrom: string, dateTo: string): Promise<Match[]> {
  const url = `${BASE_URL}/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  
  console.log(`\n📡 Fetching ${FREE_COMPETITIONS[competitionCode as keyof typeof FREE_COMPETITIONS] || competitionCode}...`);
  console.log(`   URL: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'X-Auth-Token': FOOTBALL_DATA_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Error: ${response.status} - ${error}`);
    return [];
  }

  const data = await response.json();
  return data.matches || [];
}

async function testConnection() {
  console.log('🔗 Testing Football-Data.org API Connection...\n');

  if (!FOOTBALL_DATA_API_KEY) {
    console.error('❌ Error: FOOTBALL_DATA_API_KEY environment variable is not set');
    console.log('\n📝 Instructions:');
    console.log('   1. Register at: https://www.football-data.org/client/register');
    console.log('   2. Get your API key from the dashboard');
    console.log('   3. Set environment variable:');
    console.log('      export FOOTBALL_DATA_API_KEY=your_api_key');
    console.log('   4. Run this script again');
    return;
  }

  console.log('✅ API Key found');

  // 测试获取未来14天的比赛
  const today = new Date();
  const twoWeeksLater = new Date();
  twoWeeksLater.setDate(today.getDate() + 14);

  const dateFrom = today.toISOString().split('T')[0];
  const dateTo = twoWeeksLater.toISOString().split('T')[0];

  console.log(`\n📅 Date range: ${dateFrom} to ${dateTo}`);

  // 测试几个主要联赛
  const testCompetitions = ['PL', 'BL1', 'FL1', 'CL'];
  
  for (const code of testCompetitions) {
    try {
      const matches = await fetchMatches(code, dateFrom, dateTo);
      
      if (matches.length > 0) {
        console.log(`   ✅ Found ${matches.length} matches`);
        
        // 显示前3场比赛
        matches.slice(0, 3).forEach((match: Match) => {
          const date = new Date(match.utcDate).toLocaleDateString();
          console.log(`      - ${date}: ${match.homeTeam.shortName || match.homeTeam.name} vs ${match.awayTeam.shortName || match.awayTeam.name}`);
        });
        
        if (matches.length > 3) {
          console.log(`      ... and ${matches.length - 3} more`);
        }
      } else {
        console.log(`   ⚠️  No matches found in this date range`);
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error}`);
    }

    // 免费层有速率限制，稍微等待
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n✅ API connection test completed!');
  console.log('\n📋 Free tier supported competitions:');
  Object.entries(FREE_COMPETITIONS).forEach(([code, name]) => {
    console.log(`   ${code}: ${name}`);
  });
}

testConnection();

