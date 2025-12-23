import { useState, useRef } from 'react';
import { Settings, Sparkles, Plus, Pencil, Trash2, Save, X, Loader2, Check, GripVertical, ToggleLeft, ToggleRight, DollarSign, Flame, Truck } from 'lucide-react';
import { SUPPORTED_MODELS, SUPPORTED_ASPECT_RATIOS, type AIModelId, type AspectRatioId } from '../lib/ai-image';
import { type PromptTemplate } from '../lib/ai-prompts';
import { 
  useAISettings, 
  usePromptTemplates, 
  useUpdateAISettings, 
  useCreatePromptTemplate, 
  useUpdatePromptTemplate, 
  useDeletePromptTemplate,
  useTogglePromptTemplate,
  useReorderPromptTemplates
} from '../hooks/useSettings';
import {
  useCostRules,
  useHotTeams,
  useUpdateCostRule,
  useCreateCostRule,
  useDeleteCostRule,
  useAddHotTeam,
  useRemoveHotTeam,
  useExchangeRates,
  useUpdateExchangeRate,
  useShippingCosts,
  useUpdateShippingCost,
  useCreateShippingCost,
  useDeleteShippingCost,
} from '../hooks/useCostConfig';
import type { CostRule, ShippingCost } from '../lib/cost-config';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

export function SettingsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-muted rounded-xl">
          <Settings className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">设置</h1>
          <p className="text-sm text-muted-foreground">管理系统配置和 AI 功能</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <Tabs defaultValue="cost" className="space-y-6">
        <TabsList>
          <TabsTrigger value="cost" className="gap-2">
            <DollarSign className="w-4 h-4" />
            成本配置
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Sparkles className="w-4 h-4" />
            AI 配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cost">
          <CostConfigTab />
        </TabsContent>

        <TabsContent value="ai">
          <AISettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 成本配置 Tab 组件
function CostConfigTab() {
  const { data: rules = [], isLoading: rulesLoading } = useCostRules();
  const { data: hotTeams = [], isLoading: teamsLoading } = useHotTeams();
  const { data: exchangeRates = [], isLoading: ratesLoading } = useExchangeRates();
  const { data: shippingCosts = [], isLoading: shippingLoading } = useShippingCosts();
  const updateRuleMutation = useUpdateCostRule();
  const createRuleMutation = useCreateCostRule();
  const deleteRuleMutation = useDeleteCostRule();
  const addTeamMutation = useAddHotTeam();
  const removeTeamMutation = useRemoveHotTeam();
  const updateRateMutation = useUpdateExchangeRate();
  const updateShippingMutation = useUpdateShippingCost();
  const createShippingMutation = useCreateShippingCost();
  const deleteShippingMutation = useDeleteShippingCost();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCost, setEditingCost] = useState<string>('');
  const [newTeam, setNewTeam] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // 汇率编辑状态
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editingRateValues, setEditingRateValues] = useState<{ usd_cny: string; usd_eur: string; usd_gbp: string }>({ usd_cny: '', usd_eur: '', usd_gbp: '' });

  // 物流成本编辑状态
  const [editingShippingId, setEditingShippingId] = useState<string | null>(null);
  const [editingShipping, setEditingShipping] = useState<{ price_per_kg: string; registration_fee: string }>({ price_per_kg: '', registration_fee: '' });
  const [showAddShipping, setShowAddShipping] = useState(false);
  const [newShipping, setNewShipping] = useState<Partial<ShippingCost>>({
    name: '欧美专线小包-P特价',
    country_code: '',
    country_name: '',
    weight_min: 0.1,
    weight_max: 5,
    price_per_kg: 70,
    registration_fee: 30,
  });

  const loading = rulesLoading || teamsLoading || ratesLoading || shippingLoading;
  const saving = updateRuleMutation.isPending || createRuleMutation.isPending || 
                 deleteRuleMutation.isPending || addTeamMutation.isPending || removeTeamMutation.isPending ||
                 updateRateMutation.isPending || updateShippingMutation.isPending || createShippingMutation.isPending ||
                 deleteShippingMutation.isPending;

  // 开始编辑成本
  const startEditing = (rule: CostRule) => {
    setEditingId(rule.id);
    setEditingCost(String(rule.cost));
  };

  // 保存成本
  const saveCost = async () => {
    if (!editingId) return;
    try {
      await updateRuleMutation.mutateAsync({
        id: editingId,
        updates: { cost: parseFloat(editingCost) },
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 切换规则启用状态
  const toggleRule = async (rule: CostRule) => {
    try {
      await updateRuleMutation.mutateAsync({
        id: rule.id,
        updates: { enabled: !rule.enabled },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    }
  };

  // 添加热门球队
  const handleAddTeam = async () => {
    if (!newTeam.trim()) return;
    try {
      await addTeamMutation.mutateAsync(newTeam.trim());
      setNewTeam('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败');
    }
  };

  // 删除热门球队
  const handleRemoveTeam = async (id: string) => {
    try {
      await removeTeamMutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 按类别分组规则
  const kidsRules = rules.filter(r => r.gender?.includes('Kids'));
  const trainingRules = rules.filter(r => r.type?.includes('Training') || r.type?.includes('Pre-Match') || r.type?.includes('Zipper'));
  const retroRules = rules.filter(r => r.season?.includes('Retro'));
  const playerRules = rules.filter(r => r.version?.includes('Player Version'));
  const specialRules = rules.filter(r => r.version?.includes('Special Edition') || r.type?.includes('Anniversary') || r.type?.includes('Fan Tee') || r.type?.includes('Goalkeeper'));
  const coldRules = rules.filter(r => r.is_hot_team === false && !r.gender?.includes('Kids') && !r.version?.includes('Player Version'));
  const hotRules = rules.filter(r => r.is_hot_team === true && !r.gender?.includes('Kids') && !r.version?.includes('Player Version'));
  const defaultRule = rules.find(r => r.name === '默认成本');

  const renderRuleRow = (rule: CostRule) => (
    <div
      key={rule.id}
      className={`flex items-center justify-between p-3 rounded-lg border ${
        rule.enabled ? 'bg-background' : 'bg-muted opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`font-medium ${rule.enabled ? '' : 'text-muted-foreground'}`}>
          {rule.name}
        </span>
        {!rule.enabled && <Badge variant="secondary">禁用</Badge>}
      </div>
      <div className="flex items-center gap-2">
        {editingId === rule.id ? (
          <>
            <Input
              type="number"
              value={editingCost}
              onChange={(e) => setEditingCost(e.target.value)}
              className="w-20 h-8 text-right"
            />
            <span className="text-sm text-muted-foreground">元</span>
            <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
              <X className="w-4 h-4" />
            </Button>
            <Button size="icon" onClick={saveCost} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            </Button>
          </>
        ) : (
          <>
            <span className="font-mono text-lg font-semibold text-orange-600">
              ¥{Number(rule.cost).toFixed(0)}
            </span>
            <Button size="icon" variant="ghost" onClick={() => startEditing(rule)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => toggleRule(rule)}
              className={rule.enabled ? 'text-green-600' : 'text-muted-foreground'}
            >
              {rule.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>关闭</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 成本规则 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 成人热门球队 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="w-4 h-4 text-orange-500" />
              成人热门球队
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {hotRules.map(renderRuleRow)}
          </CardContent>
        </Card>

        {/* 成人冷门球队 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">成人冷门球队</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coldRules.map(renderRuleRow)}
          </CardContent>
        </Card>

        {/* 儿童款 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">👶 儿童款</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {kidsRules.map(renderRuleRow)}
          </CardContent>
        </Card>

        {/* 球员版 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">⭐ 球员版</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {playerRules.filter(r => !r.gender?.includes('Kids')).map(renderRuleRow)}
          </CardContent>
        </Card>

        {/* 特殊类型 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🎯 特殊类型</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {trainingRules.filter(r => !r.gender?.includes('Kids')).map(renderRuleRow)}
            {retroRules.map(renderRuleRow)}
            {specialRules.map(renderRuleRow)}
            {defaultRule && renderRuleRow(defaultRule)}
          </CardContent>
        </Card>

        {/* 热门球队管理 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="w-4 h-4 text-orange-500" />
              热门球队列表
            </CardTitle>
            <CardDescription>
              在此列表中的球队使用热门球队成本
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                value={newTeam}
                onChange={(e) => setNewTeam(e.target.value)}
                placeholder="输入球队名称"
                onKeyDown={(e) => e.key === 'Enter' && handleAddTeam()}
              />
              <Button onClick={handleAddTeam} disabled={saving || !newTeam.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {hotTeams.map((team) => (
                <Badge
                  key={team.id}
                  variant="secondary"
                  className="flex items-center gap-1 py-1 px-2"
                >
                  {team.team_name}
                  <button
                    onClick={() => handleRemoveTeam(team.id)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 成本汇总表 */}
      <Card>
        <CardHeader>
          <CardTitle>📊 成本汇总表</CardTitle>
          <CardDescription>所有价格单位：人民币 (RMB)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">类型</th>
                  <th className="text-right py-2 px-3 font-medium">成本</th>
                  <th className="text-left py-2 px-3 font-medium">条件</th>
                </tr>
              </thead>
              <tbody>
                {rules
                  .filter(r => r.enabled)
                  .sort((a, b) => b.priority - a.priority)
                  .map((rule) => (
                    <tr key={rule.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 px-3">{rule.name}</td>
                      <td className="py-2 px-3 text-right font-mono text-orange-600">
                        ¥{Number(rule.cost).toFixed(0)}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {[
                          rule.is_hot_team === true && '热门',
                          rule.is_hot_team === false && '冷门',
                          rule.gender?.join('/'),
                          rule.version?.join('/'),
                          rule.sleeve?.join('/'),
                          rule.type?.join('/'),
                          rule.season?.join('/'),
                        ].filter(Boolean).join(' · ') || '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 汇率表 */}
      <Card>
        <CardHeader>
          <CardTitle>💱 月度汇率表</CardTitle>
          <CardDescription>以 USD 为基准的月初汇率（商品管理用最新汇率，订单用对应月份汇率）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">月份</th>
                  <th className="text-right py-2 px-3 font-medium">USD → CNY</th>
                  <th className="text-right py-2 px-3 font-medium">USD → EUR</th>
                  <th className="text-right py-2 px-3 font-medium">USD → GBP</th>
                  <th className="text-center py-2 px-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {exchangeRates.map((rate) => {
                  const isCurrentMonth = rate.month === new Date().toISOString().slice(0, 7);
                  const isEditing = editingRateId === rate.id;
                  
                  return (
                    <tr key={rate.id} className={`border-b hover:bg-muted/50 ${isCurrentMonth ? 'bg-green-50' : ''}`}>
                      <td className="py-2 px-3">
                        <span className={isCurrentMonth ? 'font-semibold text-green-700' : ''}>
                          {rate.month}
                        </span>
                        {isCurrentMonth && <Badge variant="outline" className="ml-2 text-xs">当前</Badge>}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              step="0.0001"
                              value={editingRateValues.usd_cny}
                              onChange={(e) => setEditingRateValues(v => ({ ...v, usd_cny: e.target.value }))}
                              className="w-24 h-7 text-right text-sm"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              step="0.0001"
                              value={editingRateValues.usd_eur}
                              onChange={(e) => setEditingRateValues(v => ({ ...v, usd_eur: e.target.value }))}
                              className="w-24 h-7 text-right text-sm"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              step="0.0001"
                              value={editingRateValues.usd_gbp}
                              onChange={(e) => setEditingRateValues(v => ({ ...v, usd_gbp: e.target.value }))}
                              className="w-24 h-7 text-right text-sm"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditingRateId(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                className="h-7 w-7"
                                disabled={saving}
                                onClick={async () => {
                                  try {
                                    await updateRateMutation.mutateAsync({
                                      id: rate.id,
                                      updates: {
                                        usd_cny: parseFloat(editingRateValues.usd_cny),
                                        usd_eur: parseFloat(editingRateValues.usd_eur),
                                        usd_gbp: parseFloat(editingRateValues.usd_gbp),
                                      },
                                    });
                                    setEditingRateId(null);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : '保存失败');
                                  }
                                }}
                              >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-right font-mono text-blue-600">
                            {Number(rate.usd_cny).toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-purple-600">
                            {Number(rate.usd_eur).toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-green-600">
                            {Number(rate.usd_gbp).toFixed(4)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingRateId(rate.id);
                                setEditingRateValues({
                                  usd_cny: String(rate.usd_cny),
                                  usd_eur: String(rate.usd_eur),
                                  usd_gbp: String(rate.usd_gbp),
                                });
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 物流成本配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-500" />
            🚚 物流成本配置
          </CardTitle>
          <CardDescription>按收货国家设置物流成本（元/人民币），用于分析销售利润</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 添加新物流成本按钮 */}
          <div className="mb-4">
            {!showAddShipping ? (
              <Button onClick={() => setShowAddShipping(true)} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                添加国家
              </Button>
            ) : (
              <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">国家代码</label>
                    <Input
                      value={newShipping.country_code || ''}
                      onChange={(e) => setNewShipping(v => ({ ...v, country_code: e.target.value.toUpperCase() }))}
                      placeholder="如 DE, FR"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">国家名称</label>
                    <Input
                      value={newShipping.country_name || ''}
                      onChange={(e) => setNewShipping(v => ({ ...v, country_name: e.target.value }))}
                      placeholder="如 德国"
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">单价 (元/kg)</label>
                    <Input
                      type="number"
                      value={newShipping.price_per_kg || ''}
                      onChange={(e) => setNewShipping(v => ({ ...v, price_per_kg: parseFloat(e.target.value) || 0 }))}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">挂号费 (元/件)</label>
                    <Input
                      type="number"
                      value={newShipping.registration_fee || ''}
                      onChange={(e) => setNewShipping(v => ({ ...v, registration_fee: parseFloat(e.target.value) || 0 }))}
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await createShippingMutation.mutateAsync({
                          name: newShipping.name || '欧美专线小包-P特价',
                          country_code: newShipping.country_code || '',
                          country_name: newShipping.country_name || '',
                          weight_min: newShipping.weight_min || 0.1,
                          weight_max: newShipping.weight_max || 5,
                          price_per_kg: newShipping.price_per_kg || 70,
                          registration_fee: newShipping.registration_fee || 30,
                          enabled: true,
                        });
                        setShowAddShipping(false);
                        setNewShipping({
                          name: '欧美专线小包-P特价',
                          country_code: '',
                          country_name: '',
                          weight_min: 0.1,
                          weight_max: 5,
                          price_per_kg: 70,
                          registration_fee: 30,
                        });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '添加失败');
                      }
                    }}
                    disabled={saving || !newShipping.country_code || !newShipping.country_name}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddShipping(false)}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* 物流成本表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">国家</th>
                  <th className="text-right py-2 px-3 font-medium">单价 (元/kg)</th>
                  <th className="text-right py-2 px-3 font-medium">挂号费 (元/件)</th>
                  <th className="text-right py-2 px-3 font-medium">单件成本*</th>
                  <th className="text-center py-2 px-3 font-medium">状态</th>
                  <th className="text-center py-2 px-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {shippingCosts.map((sc) => {
                  const isEditing = editingShippingId === sc.id;
                  // 按 0.3kg 计算单件成本
                  const unitCost = (sc.price_per_kg * 0.3) + sc.registration_fee;
                  
                  return (
                    <tr key={sc.id} className={`border-b hover:bg-muted/50 ${!sc.enabled ? 'opacity-50' : ''}`}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{sc.country_code}</span>
                          <span>{sc.country_name}</span>
                        </div>
                      </td>
                      {isEditing ? (
                        <>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              step="0.01"
                              value={editingShipping.price_per_kg}
                              onChange={(e) => setEditingShipping(v => ({ ...v, price_per_kg: e.target.value }))}
                              className="w-20 h-7 text-right text-sm"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <Input
                              type="number"
                              step="0.01"
                              value={editingShipping.registration_fee}
                              onChange={(e) => setEditingShipping(v => ({ ...v, registration_fee: e.target.value }))}
                              className="w-20 h-7 text-right text-sm"
                            />
                          </td>
                          <td className="py-2 px-3 text-right text-muted-foreground">-</td>
                          <td className="py-2 px-3 text-center">-</td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => setEditingShippingId(null)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                className="h-7 w-7"
                                disabled={saving}
                                onClick={async () => {
                                  try {
                                    await updateShippingMutation.mutateAsync({
                                      id: sc.id,
                                      updates: {
                                        price_per_kg: parseFloat(editingShipping.price_per_kg),
                                        registration_fee: parseFloat(editingShipping.registration_fee),
                                      },
                                    });
                                    setEditingShippingId(null);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : '保存失败');
                                  }
                                }}
                              >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-3 text-right font-mono text-blue-600">
                            ¥{Number(sc.price_per_kg).toFixed(0)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-purple-600">
                            ¥{Number(sc.registration_fee).toFixed(0)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-orange-600">
                            ¥{unitCost.toFixed(1)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={async () => {
                                try {
                                  await updateShippingMutation.mutateAsync({
                                    id: sc.id,
                                    updates: { enabled: !sc.enabled },
                                  });
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : '切换失败');
                                }
                              }}
                            >
                              {sc.enabled ? (
                                <ToggleRight className="w-5 h-5 text-green-600" />
                              ) : (
                                <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                              )}
                            </Button>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingShippingId(sc.id);
                                  setEditingShipping({
                                    price_per_kg: String(sc.price_per_kg),
                                    registration_fee: String(sc.registration_fee),
                                  });
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500 hover:text-red-600"
                                onClick={async () => {
                                  if (confirm(`确认删除 ${sc.country_name} 的物流成本配置？`)) {
                                    try {
                                      await deleteShippingMutation.mutateAsync(sc.id);
                                    } catch (err) {
                                      setError(err instanceof Error ? err.message : '删除失败');
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * 单件成本 = 单价 × 0.3kg（球衣默认重量）+ 挂号费
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// AI 配置 Tab 组件
function AISettingsTab() {
  // React Query hooks
  const { data: settings, isLoading: settingsLoading } = useAISettings();
  const { data: templates = [], isLoading: templatesLoading } = usePromptTemplates();
  const updateSettingsMutation = useUpdateAISettings();
  const createTemplateMutation = useCreatePromptTemplate();
  const updateTemplateMutation = useUpdatePromptTemplate();
  const deleteTemplateMutation = useDeletePromptTemplate();
  const toggleTemplateMutation = useTogglePromptTemplate();
  const reorderMutation = useReorderPromptTemplates();

  const loading = settingsLoading || templatesLoading;
  const saving = updateSettingsMutation.isPending || createTemplateMutation.isPending || 
                 updateTemplateMutation.isPending || deleteTemplateMutation.isPending ||
                 toggleTemplateMutation.isPending || reorderMutation.isPending;
  const [error, setError] = useState<string | null>(null);

  // 编辑模板状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPrompt, setEditingPrompt] = useState('');

  // 新建模板状态
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  // 拖拽排序状态
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [localTemplates, setLocalTemplates] = useState<PromptTemplate[]>([]);
  const dragOverRef = useRef<string | null>(null);

  // 同步模板数据到本地状态
  if (templates.length > 0 && localTemplates.length === 0) {
    setLocalTemplates(templates);
  }
  if (templates.length > 0 && localTemplates.length > 0 && !saving) {
    const templatesChanged = templates.some((t, i) => 
      localTemplates[i]?.id !== t.id || localTemplates[i]?.sort_order !== t.sort_order
    ) || templates.length !== localTemplates.length;
    if (templatesChanged && !draggedId) {
      setLocalTemplates(templates);
    }
  }

  // 更新模型设置
  const handleModelChange = async (model: AIModelId) => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync({ defaultModel: model });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 更新宽高比设置
  const handleAspectRatioChange = async (ratio: AspectRatioId) => {
    if (!settings) return;
    try {
      await updateSettingsMutation.mutateAsync({ defaultAspectRatio: ratio });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 开始编辑模板
  const startEditing = (template: PromptTemplate) => {
    setEditingId(template.id);
    setEditingName(template.name);
    setEditingPrompt(template.prompt);
  };

  // 保存编辑
  const saveEditing = async () => {
    if (!editingId) return;
    try {
      await updateTemplateMutation.mutateAsync({
        id: editingId,
        data: { name: editingName, prompt: editingPrompt },
      });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 删除模板
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;
    try {
      await deleteTemplateMutation.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  // 创建新模板
  const handleCreate = async () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      await createTemplateMutation.mutateAsync({ name: newName, prompt: newPrompt });
      setIsCreating(false);
      setNewName('');
      setNewPrompt('');
      setLocalTemplates([]); // 重置本地状态以触发同步
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    }
  };

  // 切换启用状态
  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      // 乐观更新
      setLocalTemplates(prev => 
        prev.map(t => t.id === id ? { ...t, enabled: !currentEnabled } : t)
      );
      await toggleTemplateMutation.mutateAsync({ id, enabled: !currentEnabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
      setLocalTemplates(templates); // 回滚
    }
  };

  // 拖拽开始
  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  // 拖拽经过
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== id && dragOverRef.current !== id) {
      dragOverRef.current = id;
      // 实时更新位置
      setLocalTemplates(prev => {
        const draggedIndex = prev.findIndex(t => t.id === draggedId);
        const targetIndex = prev.findIndex(t => t.id === id);
        if (draggedIndex === -1 || targetIndex === -1) return prev;
        
        const newList = [...prev];
        const [draggedItem] = newList.splice(draggedIndex, 1);
        newList.splice(targetIndex, 0, draggedItem);
        return newList;
      });
    }
  };

  // 拖拽结束
  const handleDragEnd = async () => {
    if (!draggedId) return;
    
    const orderedIds = localTemplates.map(t => t.id);
    setDraggedId(null);
    dragOverRef.current = null;

    try {
      await reorderMutation.mutateAsync(orderedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : '排序失败');
      setLocalTemplates(templates); // 回滚
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            {error}
            <Button variant="ghost" size="sm" onClick={() => setError(null)}>
              关闭
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 默认模型设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            默认 AI 模型
          </CardTitle>
          <CardDescription>
            选择默认使用的 AI 图像生成模型，可在使用时临时切换
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUPPORTED_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id)}
                disabled={saving}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  settings?.defaultModel === model.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-border hover:border-muted-foreground/50 bg-background'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{model.name}</span>
                  {settings?.defaultModel === model.id && (
                    <Check className="w-5 h-5 text-purple-500" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{model.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 默认宽高比设置 */}
      <Card>
        <CardHeader>
          <CardTitle>默认宽高比</CardTitle>
          <CardDescription>
            选择默认的图片输出宽高比，可在使用时临时切换
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_ASPECT_RATIOS.map((ratio) => (
              <Button
                key={ratio.id}
                onClick={() => handleAspectRatioChange(ratio.id)}
                disabled={saving}
                variant={settings?.defaultAspectRatio === ratio.id ? 'default' : 'outline'}
                size="sm"
              >
                {ratio.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Prompt 模板管理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Prompt 模板</CardTitle>
              <CardDescription className="mt-1">
                管理 AI 图片处理的 Prompt 模板，拖拽调整顺序
              </CardDescription>
            </div>
            <Button
              onClick={() => setIsCreating(true)}
              disabled={isCreating}
            >
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 新建模板表单 */}
          {isCreating && (
            <div className="p-4 bg-muted rounded-xl border">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">模板名称</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：产品细节-袖口"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prompt 内容</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder="输入 AI 图片处理的提示词..."
                    rows={4}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsCreating(false);
                      setNewName('');
                      setNewPrompt('');
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim() || !newPrompt.trim()}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                    保存
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 模板列表 */}
          <div className="space-y-3">
            {localTemplates.map((template) => (
              <div
                key={template.id}
                draggable={editingId !== template.id}
                onDragStart={() => handleDragStart(template.id)}
                onDragOver={(e) => handleDragOver(e, template.id)}
                onDragEnd={handleDragEnd}
                className={`p-4 rounded-xl border transition-all cursor-move ${
                  draggedId === template.id
                    ? 'opacity-50 border-purple-400 bg-purple-50'
                    : template.enabled
                      ? 'bg-background border-border hover:border-muted-foreground/50'
                      : 'bg-muted border-border opacity-60'
                }`}
              >
                {editingId === template.id ? (
                  // 编辑模式
                  <div className="space-y-3">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                    <textarea
                      value={editingPrompt}
                      onChange={(e) => setEditingPrompt(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring resize-none text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        onClick={saveEditing}
                        disabled={saving}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                ) : (
                  // 显示模式
                  <div className="flex gap-3">
                    {/* 拖拽手柄 */}
                    <div className="flex-shrink-0 pt-0.5">
                      <GripVertical className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    
                    {/* 内容区域 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${template.enabled ? '' : 'text-muted-foreground'}`}>
                            {template.name}
                          </span>
                          {!template.enabled && (
                            <Badge variant="secondary">已禁用</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* 启用/禁用开关 */}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggle(template.id, template.enabled)}
                            disabled={saving}
                            className={template.enabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground'}
                          >
                            {template.enabled ? (
                              <ToggleRight className="w-5 h-5" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(template)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template.id)}
                            className="hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      <p className={`text-sm line-clamp-2 ${template.enabled ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                        {template.prompt}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {localTemplates.length === 0 && !isCreating && (
              <div className="text-center py-8 text-muted-foreground">
                暂无模板，点击「新建模板」添加
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
