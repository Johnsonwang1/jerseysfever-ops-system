/**
 * Trending 推荐页面
 * 
 * 整合足球赛事、Google Trends 和 AI 推荐的综合看板
 */

import { useState } from 'react';
import { 
  Calendar, 
  TrendingUp, 
  Sparkles, 
  RefreshCw, 
  ChevronRight,
  Trophy,
  Flame,
  Target,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle,
  Zap,
  Bot,
  ChevronDown,
  ChevronUp,
  Search,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  useTrendingDashboard, 
  useSyncMatches, 
  useGenerateRecommendations,
  type FootballMatch,
  type AIRecommendation,
} from '@/hooks/useTrending';
import { 
  formatMatchDate, 
  groupMatchesByDate, 
  generateAgentRecommendation,
  vectorSearchProducts,
  type StructuredRecommendation,
  type TeamRecommendationV2,
  type ProductDetail,
} from '@/lib/trending';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';

// 国家配置
const COUNTRIES = [
  { code: 'DE', name: '德国', flag: '🇩🇪' },
  { code: 'UK', name: '英国', flag: '🇬🇧' },
  { code: 'FR', name: '法国', flag: '🇫🇷' },
  { code: 'US', name: '美国', flag: '🇺🇸' },
];

// 联赛配置
const COMPETITIONS: Record<string, { name: string; color: string }> = {
  'PL': { name: 'Premier League', color: 'bg-purple-500' },
  'BL1': { name: 'Bundesliga', color: 'bg-red-500' },
  'FL1': { name: 'Ligue 1', color: 'bg-blue-500' },
  'SA': { name: 'Serie A', color: 'bg-green-600' },
  'PD': { name: 'La Liga', color: 'bg-orange-500' },
  'CL': { name: 'Champions League', color: 'bg-blue-600' },
  'EL': { name: 'Europa League', color: 'bg-orange-400' },
  'CLI': { name: 'Africa Cup', color: 'bg-yellow-500' },
};

// 重要性标签
const IMPORTANCE_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'derby': { label: '德比', color: 'bg-red-500 text-white', icon: <Flame className="w-3 h-3" /> },
  'final': { label: '决赛', color: 'bg-yellow-500 text-black', icon: <Trophy className="w-3 h-3" /> },
  'semi_final': { label: '半决赛', color: 'bg-amber-500 text-white', icon: <Trophy className="w-3 h-3" /> },
  'quarter_final': { label: '四分之一决赛', color: 'bg-amber-400 text-black', icon: <Trophy className="w-3 h-3" /> },
};

// ============================================
// 组件
// ============================================

function CountryTabs({ 
  selected, 
  onChange 
}: { 
  selected: string; 
  onChange: (code: string) => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {COUNTRIES.map(country => (
        <button
          key={country.code}
          onClick={() => onChange(country.code)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
            selected === country.code
              ? "bg-white shadow text-gray-900"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          <span className="text-lg">{country.flag}</span>
          <span className="hidden sm:inline">{country.name}</span>
        </button>
      ))}
    </div>
  );
}

function MatchCard({ match }: { match: FootballMatch }) {
  const competition = COMPETITIONS[match.competition_code];
  const importance = match.match_importance ? IMPORTANCE_BADGES[match.match_importance] : null;
  const { date, time, relative } = formatMatchDate(match.match_date);

  return (
    <div className={cn(
      "bg-white rounded-lg border p-4 hover:shadow-md transition-shadow",
      match.importance_score >= 80 && "ring-2 ring-amber-400"
    )}>
      {/* 顶部：联赛和时间 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", competition?.color || "bg-gray-400")} />
          <span className="text-xs text-gray-500">{competition?.name || match.competition_name}</span>
        </div>
        <div className="flex items-center gap-2">
          {importance && (
            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", importance.color)}>
              {importance.icon}
              {importance.label}
            </span>
          )}
          <span className="text-xs text-gray-400">{relative}</span>
        </div>
      </div>

      {/* 中间：球队 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {match.home_team_crest && (
              <img src={match.home_team_crest} alt="" className="w-6 h-6 object-contain" />
            )}
            <span className="font-medium text-sm">{match.home_team_short || match.home_team}</span>
          </div>
        </div>
        <div className="px-3 text-gray-400 text-sm">vs</div>
        <div className="flex-1 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="font-medium text-sm">{match.away_team_short || match.away_team}</span>
            {match.away_team_crest && (
              <img src={match.away_team_crest} alt="" className="w-6 h-6 object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* 底部：日期时间和分数 */}
        <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{date} · {time}</span>
        </div>
        <div className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          <span>重要性: {match.importance_score}</span>
        </div>
      </div>
    </div>
  );
}

function TeamRecommendationCard({ 
  team,
  onViewProducts,
}: { 
  team: {
    team: string;
    score: number;
    reasons: string[];
    upcoming_matches: Array<{ opponent: string; date: string; competition: string }>;
    matched_skus: string[];
    ad_suggestion: string;
    trends_data?: { interest_score: number; direction: string };
  };
  onViewProducts: (team: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
      {/* 顶部：球队名和分数 */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">{team.team}</h4>
        <div className={cn(
          "px-2 py-1 rounded-full text-xs font-bold",
          team.score >= 80 ? "bg-green-100 text-green-700" :
          team.score >= 60 ? "bg-yellow-100 text-yellow-700" :
          "bg-gray-100 text-gray-600"
        )}>
          {team.score}
        </div>
      </div>

      {/* 推荐理由 */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-1">
          {team.reasons.slice(0, 3).map((reason, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
              <Zap className="w-3 h-3" />
              {reason}
            </span>
          ))}
        </div>
      </div>

      {/* 趋势数据 */}
      {team.trends_data && (
        <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
          <TrendingUp className={cn(
            "w-3 h-3",
            team.trends_data.direction === 'rising' ? "text-green-500" :
            team.trends_data.direction === 'declining' ? "text-red-500" :
            "text-gray-400"
          )} />
          <span>Trends: {team.trends_data.interest_score}</span>
          <span className={cn(
            team.trends_data.direction === 'rising' ? "text-green-600" :
            team.trends_data.direction === 'declining' ? "text-red-600" :
            "text-gray-500"
          )}>
            ({team.trends_data.direction})
          </span>
        </div>
      )}

      {/* 即将到来的比赛 */}
      {team.upcoming_matches.length > 0 && (
        <div className="mb-3 text-xs">
          <span className="text-gray-500">下一场: </span>
          <span className="text-gray-700">
            vs {team.upcoming_matches[0].opponent} ({team.upcoming_matches[0].date})
          </span>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-3 border-t">
        <span className="text-xs text-gray-400">
          {team.matched_skus.length} 个商品
        </span>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => onViewProducts(team.team)}
          className="text-xs"
        >
          查看商品
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function AIInsightCard({ recommendation }: { recommendation: AIRecommendation | null }) {
  if (!recommendation) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900">AI 洞察</h3>
        </div>
        <p className="text-gray-500 text-sm">
          暂无 AI 推荐，点击"生成 AI 洞察"来分析当前数据。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg border border-purple-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI 洞察</h3>
            <span className="text-xs text-gray-500">
              生成时间: {new Date(recommendation.created_at).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>
        <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
          置信度 {Math.round(recommendation.confidence_score * 100)}%
        </span>
      </div>

      {/* AI 摘要 */}
      <p className="text-gray-700 text-sm mb-4 leading-relaxed">
        {recommendation.ai_summary || '暂无摘要。'}
      </p>

      {/* 重点关注 */}
      {recommendation.ai_highlights && recommendation.ai_highlights.length > 0 && (
        <div className="space-y-2">
          {recommendation.ai_highlights.slice(0, 3).map((highlight, i) => (
            <div 
              key={i} 
              className={cn(
                "flex items-start gap-2 p-3 rounded-lg text-sm",
                highlight.type === 'derby' ? "bg-red-50 text-red-700" :
                highlight.type === 'rising' ? "bg-green-50 text-green-700" :
                highlight.type === 'final' ? "bg-yellow-50 text-yellow-700" :
                highlight.type === 'hot' ? "bg-orange-50 text-orange-700" :
                "bg-blue-50 text-blue-700"
              )}
            >
              {highlight.type === 'derby' && <Flame className="w-4 h-4 mt-0.5" />}
              {highlight.type === 'rising' && <TrendingUp className="w-4 h-4 mt-0.5" />}
              {highlight.type === 'final' && <Trophy className="w-4 h-4 mt-0.5" />}
              {highlight.type === 'hot' && <Zap className="w-4 h-4 mt-0.5" />}
              {highlight.type === 'opportunity' && <Target className="w-4 h-4 mt-0.5" />}
              <div>
                <span className="font-medium">{highlight.title}</span>
                <p className="text-xs opacity-80 mt-0.5">{highlight.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 商品卡片组件
 */
function ProductCard({ 
  product, 
  site = 'com' 
}: { 
  product: ProductDetail; 
  site?: string;
}) {
  const stock = product.stock?.[site] || 0;
  const price = product.price?.[site] || 0;
  const imageUrl = product.images?.[0] || 'https://placehold.co/200x200?text=No+Image';

  return (
    <div className="bg-white rounded-lg border overflow-hidden hover:shadow-md transition-shadow">
      {/* 商品图片 */}
      <div className="aspect-square bg-gray-100 relative">
        <img 
          src={imageUrl} 
          alt={product.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=No+Image';
          }}
        />
        {/* 匹配度标签 */}
        {product.similarity > 0 && (
          <span className={cn(
            "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold",
            product.similarity > 0.7 ? "bg-green-500 text-white" :
            product.similarity > 0.5 ? "bg-yellow-500 text-black" :
            "bg-gray-500 text-white"
          )}>
            {Math.round(product.similarity * 100)}%
          </span>
        )}
      </div>
      
      {/* 商品信息 */}
      <div className="p-3">
        <h4 className="font-medium text-sm text-gray-900 line-clamp-2 mb-2" title={product.name}>
          {product.name}
        </h4>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">{product.sku}</span>
          <div className="flex items-center gap-2">
            {price > 0 && (
              <span className="font-semibold text-blue-600">€{price.toFixed(2)}</span>
            )}
            <span className={cn(
              "px-1.5 py-0.5 rounded",
              stock > 10 ? "bg-green-100 text-green-700" :
              stock > 0 ? "bg-yellow-100 text-yellow-700" :
              "bg-red-100 text-red-700"
            )}>
              {stock > 0 ? `库存 ${stock}` : '缺货'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 球队推荐卡片（带商品）
 */
function TeamRecommendationCardV2({ 
  team,
  site = 'com',
  onViewProducts,
}: { 
  team: TeamRecommendationV2;
  site?: string;
  onViewProducts: (team: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* 球队信息头部 */}
      <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
              {team.rank}
            </span>
            <div>
              <h4 className="font-semibold text-gray-900">{team.team_cn}</h4>
              <span className="text-xs text-gray-500">{team.team}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 趋势指示 */}
            <span className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              team.trend === 'up' ? "bg-green-100 text-green-700" :
              team.trend === 'down' ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-600"
            )}>
              {team.trend === 'up' && <TrendingUp className="w-3 h-3" />}
              {team.trend === 'down' && <ChevronDown className="w-3 h-3" />}
              {team.sales_7d > 0 && `${team.sales_7d} 件/周`}
            </span>
          </div>
        </div>
        
        {/* 推荐理由 */}
        <p className="text-sm text-gray-600">{team.reason}</p>
        
        {/* 即将到来的比赛 */}
        {team.upcoming_match && (
          <div className="mt-2 flex items-center gap-1 text-xs text-orange-600">
            <Calendar className="w-3 h-3" />
            <span>{team.upcoming_match}</span>
          </div>
        )}
      </div>
      
      {/* 商品列表 */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">
            匹配商品 ({team.products.length})
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            {expanded ? '收起' : '展开全部'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        
        {team.products.length > 0 ? (
          <div className={cn(
            "grid grid-cols-3 gap-2",
            !expanded && "max-h-48 overflow-hidden"
          )}>
            {team.products.slice(0, expanded ? undefined : 3).map((product) => (
              <ProductCard key={product.sku} product={product} site={site} />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p>暂无匹配商品</p>
          </div>
        )}
        
        {/* 查看更多按钮 */}
        <Button 
          variant="outline"
          size="sm"
          onClick={() => onViewProducts(team.team)}
          className="w-full mt-3 text-xs"
        >
          在产品页搜索更多
          <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/**
 * AI Agent 推荐卡片（结构化输出版）
 */
function AgentRecommendationCard({ 
  result, 
  isLoading,
  onGenerate,
  site = 'com',
  onViewProducts,
}: { 
  result: StructuredRecommendation | null;
  isLoading: boolean;
  onGenerate: () => void;
  site?: string;
  onViewProducts: (team: string) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg animate-pulse">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI Agent 分析中...</h3>
            <span className="text-xs text-gray-500">正在收集数据并生成推荐</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Agent 正在调用工具获取信息...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI Agent 推荐</h3>
            <span className="text-xs text-gray-500">向量搜索 + 智能推理 + 商品匹配</span>
          </div>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          使用 AI Agent 进行深度分析，结合向量搜索精准匹配产品，输出结构化的商品推荐。
        </p>
        <Button onClick={onGenerate} className="bg-blue-600 hover:bg-blue-700">
          <Bot className="w-4 h-4 mr-2" />
          启动 AI Agent
        </Button>
      </div>
    );
  }

  const totalProducts = result.recommendations.reduce((sum, r) => sum + r.products.length, 0);

  return (
    <div className="space-y-4">
      {/* 顶部摘要卡片 */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg border border-blue-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bot className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">AI Agent 推荐</h3>
              <span className="text-xs text-gray-500">
                生成时间: {new Date(result.generated_at).toLocaleString('zh-CN')} · {(result.execution_time_ms / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
              {result.recommendations.length} 个球队
            </span>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
              {totalProducts} 个商品
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onGenerate}
              className="h-7 px-2"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* AI 摘要 */}
        <div className="bg-white/70 rounded-lg p-4 mb-4">
          <p className="text-gray-700 text-sm leading-relaxed">
            {result.summary || '暂无摘要'}
          </p>
        </div>

        {/* 原始响应（如果解析失败） */}
        {result.raw_response && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-yellow-700 text-xs mb-2">
              <AlertCircle className="w-4 h-4" />
              <span>AI 响应解析失败，显示原始内容</span>
            </div>
            <div className="text-gray-600 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
              {result.raw_response}
            </div>
          </div>
        )}

        {/* 展开/收起详情 */}
        {result.tool_calls && result.tool_calls.length > 0 && (
          <>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDetails ? '收起详情' : `查看推理过程 (${result.tool_calls.length} 次工具调用)`}
            </button>

            {showDetails && (
              <div className="mt-4 bg-white/50 rounded-lg p-3">
                <h4 className="text-xs font-medium text-gray-600 mb-2">工具调用记录</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {result.tool_calls.slice(0, 10).map((call, i) => (
                    <div key={i} className="text-xs border-l-2 border-blue-200 pl-2">
                      <span className="font-mono text-blue-600">{call.tool}</span>
                      {call.result && typeof call.result === 'object' && (
                        <span className="text-gray-400 ml-2">
                          {Array.isArray(call.result) 
                            ? `(${call.result.length} 条结果)` 
                            : '(1 条结果)'}
                        </span>
                      )}
                    </div>
                  ))}
                  {result.tool_calls.length > 10 && (
                    <div className="text-xs text-gray-400">
                      ... 还有 {result.tool_calls.length - 10} 次调用
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 球队推荐卡片列表 */}
      {result.recommendations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            推荐球队 ({result.recommendations.length})
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {result.recommendations.map((team) => (
              <TeamRecommendationCardV2 
                key={team.rank} 
                team={team} 
                site={site}
                onViewProducts={onViewProducts}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 向量搜索产品组件
 */
function VectorSearchSection() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await vectorSearchProducts(query, 10);
      if (response.success && response.results) {
        setResults(response.results);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
    setIsSearching(false);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-blue-500" />
        向量搜索
      </h3>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="输入球队名搜索..."
          className="flex-1 px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <Button 
          size="sm" 
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {results.map((product, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{product.name}</div>
                <div className="text-gray-500">{product.sku}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium",
                  product.similarity > 0.7 ? "bg-green-100 text-green-700" :
                  product.similarity > 0.5 ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {(product.similarity * 100).toFixed(0)}%
                </span>
                <Package className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500">
                  {Object.values(product.stock_quantities || {}).reduce((a: number, b: any) => a + (b || 0), 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCalendar({ matches }: { matches: FootballMatch[] }) {
  const groupedMatches = groupMatchesByDate(matches);
  const sortedDates = Array.from(groupedMatches.keys()).sort();

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>未找到即将进行的比赛。</p>
        <p className="text-sm mt-1">请先同步比赛数据。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedDates.slice(0, 7).map(date => {
        const dayMatches = groupedMatches.get(date) || [];
        const dateObj = new Date(date);
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const isTomorrow = new Date(Date.now() + 86400000).toDateString() === dateObj.toDateString();

        return (
          <div key={date}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn(
                "text-sm font-medium",
                isToday ? "text-blue-600" : isTomorrow ? "text-green-600" : "text-gray-600"
              )}>
                {isToday ? '今天' : isTomorrow ? '明天' : dateObj.toLocaleDateString('zh-CN', { 
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
              <span className="text-xs text-gray-400">
                {dayMatches.length} 场比赛
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dayMatches.map(match => (
                <MatchCard key={match.match_id} match={match} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// 主页面
// ============================================

export function TrendingPage() {
  const [selectedCountry, setSelectedCountry] = useState('DE');
  const [activeTab, setActiveTab] = useState<'agent' | 'recommendations' | 'calendar'>('agent');
  const [agentResult, setAgentResult] = useState<StructuredRecommendation | null>(null);
  
  const navigate = useNavigate();
  const { 
    matches, 
    importantMatches, 
    recommendation, 
    isLoading, 
    error,
    refetch 
  } = useTrendingDashboard(selectedCountry);

  const syncMatchesMutation = useSyncMatches();
  const generateRecommendationsMutation = useGenerateRecommendations();
  
  // Agent 推荐 mutation
  const agentMutation = useMutation({
    mutationFn: (country: string) => generateAgentRecommendation(country),
    onSuccess: (data) => {
      if (data.success && data.result) {
        setAgentResult(data.result);
      }
    },
  });

  const handleViewProducts = (team: string) => {
    // 跳转到产品页并搜索球队
    navigate(`/products?search=${encodeURIComponent(team)}`);
  };

  const handleSync = async () => {
    await syncMatchesMutation.mutateAsync({});
    refetch();
  };

  const handleGenerateAI = async () => {
    await generateRecommendationsMutation.mutateAsync(selectedCountry);
    refetch();
  };

  const handleGenerateAgent = () => {
    setAgentResult(null);
    agentMutation.mutate(selectedCountry);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-7 h-7 text-blue-600" />
                趋势洞察
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                基于足球赛事和搜索趋势的 AI 智能投放建议
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncMatchesMutation.isPending}
              >
                {syncMatchesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                同步数据
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateAI}
                disabled={generateRecommendationsMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {generateRecommendationsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                生成 AI 洞察
              </Button>
            </div>
          </div>

          {/* 国家选择 */}
          <div className="mt-6">
            <CountryTabs selected={selectedCountry} onChange={setSelectedCountry} />
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-500">
            <AlertCircle className="w-12 h-12 mb-3" />
            <p>Failed to load data. Please try again.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：AI 洞察 + 推荐球队 */}
            <div className="lg:col-span-2 space-y-6">
              {/* AI 洞察卡片 */}
              <AIInsightCard recommendation={recommendation ?? null} />

              {/* Tab 切换 */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                <button
                  onClick={() => setActiveTab('agent')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === 'agent'
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <Bot className="w-4 h-4" />
                  AI Agent
                </button>
                <button
                  onClick={() => setActiveTab('recommendations')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === 'recommendations'
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <Target className="w-4 h-4" />
                  传统推荐
                </button>
                <button
                  onClick={() => setActiveTab('calendar')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                    activeTab === 'calendar'
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  <Calendar className="w-4 h-4" />
                  赛事日历
                </button>
              </div>

              {/* 内容区域 */}
              {activeTab === 'agent' ? (
                <div>
                  <AgentRecommendationCard 
                    result={agentResult}
                    isLoading={agentMutation.isPending}
                    onGenerate={handleGenerateAgent}
                    site={selectedCountry.toLowerCase() === 'us' ? 'com' : selectedCountry.toLowerCase()}
                    onViewProducts={handleViewProducts}
                  />
                </div>
              ) : activeTab === 'recommendations' ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    推荐投放球队
                  </h3>
                  {recommendation?.teams && recommendation.teams.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recommendation.teams.map((team, i) => (
                        <TeamRecommendationCard 
                          key={i} 
                          team={team} 
                          onViewProducts={handleViewProducts}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>暂无推荐。</p>
                      <p className="text-sm mt-1">生成 AI 洞察以查看球队推荐。</p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    即将进行的比赛
                  </h3>
                  <MatchCalendar matches={matches} />
                </div>
              )}
            </div>

            {/* 右侧：重要比赛 */}
            <div className="space-y-6">
              {/* 重要比赛 */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-red-500" />
                  重点比赛
                </h3>
                {importantMatches.length > 0 ? (
                  <div className="space-y-3">
                    {importantMatches.slice(0, 5).map(match => (
                      <div 
                        key={match.match_id}
                        className="p-3 bg-gradient-to-r from-red-50 to-orange-50 rounded-lg border border-red-100"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{match.competition_name}</span>
                          {match.match_importance && IMPORTANCE_BADGES[match.match_importance] && (
                            <span className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              IMPORTANCE_BADGES[match.match_importance].color
                            )}>
                              {IMPORTANCE_BADGES[match.match_importance].icon}
                              {IMPORTANCE_BADGES[match.match_importance].label}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-sm text-gray-900">
                          {match.home_team_short || match.home_team} vs {match.away_team_short || match.away_team}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatMatchDate(match.match_date).relative} · {formatMatchDate(match.match_date).time}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">
                    未来 14 天内没有重点比赛。
                  </p>
                )}
              </div>

              {/* 向量搜索 */}
              <VectorSearchSection />

              {/* 快速操作 */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-gray-900 mb-4">快捷操作</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => navigate('/products')}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    查看全部商品
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => navigate('/analytics')}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    数据分析
                  </Button>
                </div>
              </div>

              {/* 系统状态 */}
              <div className="bg-green-50 rounded-lg border border-green-100 p-4">
                <h4 className="font-medium text-green-900 mb-2 text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Agent 系统
                </h4>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>✓ 向量搜索已启用 (pgvector)</li>
                  <li>✓ 球队知识库已加载</li>
                  <li>✓ Gemini Tool Calling</li>
                  <li>✓ 产品 Embedding 生成中</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default TrendingPage;

