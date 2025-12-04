/**
 * Supabase Edge Function: ai-service
 * AI 服务 - 使用 Gemini 进行图片识别和内容生成
 * 
 * 支持的 actions:
 * - recognize-attributes: 识别球衣属性
 * - generate-content: 生成商品内容（英/德/法）
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== 类型定义 ====================

type SiteKey = 'com' | 'uk' | 'de' | 'fr'
type LanguageKey = 'en' | 'de' | 'fr'
type GeminiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro'

interface RecognizeAttributesRequest {
  action: 'recognize-attributes'
  imageBase64: string
  model?: GeminiModel
  teamOptions?: string[]  // 可用的球队列表
}

interface GenerateContentRequest {
  action: 'generate-content'
  imageBase64: string
  language: LanguageKey  // 改为语言而不是站点
  attributes: {
    team: string
    season: string
    type: string
    version: string
    gender: string
    sleeve: string
    events: string[]
  }
  generatedTitle: string
  model?: GeminiModel
}

type RequestBody = RecognizeAttributesRequest | GenerateContentRequest

// ==================== 配置 ====================

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// 属性选项
const ATTRIBUTE_OPTIONS = {
  gender: ["Men's", "Women's", "Kids", "Unisex"],
  season: ['2025/26', '2024/25', '2023/24', '2022/23', 'World Cup 2026', 'Retro'],
  type: ['Home', 'Away', 'Third', 'Fourth', 'Goalkeeper', 'Training', 'Pre-Match', 'Fan Tee', 'Anniversary'],
  version: ['Player Version', 'Standard', 'Special Edition', 'Retro'],
  sleeve: ['Short Sleeve', 'Long Sleeve', 'Kit'],
  event: ['Regular', 'Champions League', 'Euro Cup 2024', 'Copa America 2024', 'World Cup 2022', 'World Cup 2026', 'Africa Cup 2026', 'Gold Cup'],
}

// ==================== Gemini API 调用 ====================

async function callGeminiAPI(
  model: GeminiModel,
  prompt: string,
  imageBase64: string,
  responseSchema: any
): Promise<any> {
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Failed to parse Gemini response: ${text}`)
  }
}

// ==================== 识别属性 ====================

async function recognizeAttributes(
  imageBase64: string,
  model: GeminiModel = 'gemini-2.5-flash',
  teamOptions: string[] = []
): Promise<any> {
  // 如果提供球队列表，在 prompt 中提示（不用 enum，避免列表太大）
  const teamHint = teamOptions.length > 0
    ? `\n\nIMPORTANT: For the "team" field, try to match one of these known teams (use exact spelling): ${teamOptions.slice(0, 100).join(', ')}${teamOptions.length > 100 ? '...' : ''}`
    : ''

  const prompt = `Analyze this football jersey image and identify its attributes.${teamHint}`

  const schema = {
    type: 'OBJECT',
    properties: {
      team: { type: 'STRING', description: 'Team or national team name' },
      season: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.season },
      type: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.type },
      version: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.version },
      gender: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.gender },
      sleeve: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.sleeve },
      events: {
        type: 'ARRAY',
        items: { type: 'STRING', enum: ATTRIBUTE_OPTIONS.event },
      },
    },
    required: ['team', 'season', 'type', 'version', 'gender', 'sleeve', 'events'],
  }

  return callGeminiAPI(model, prompt, imageBase64, schema)
}

// ==================== 生成内容 ====================

// 获取语言特定的字段名映射
function getFieldLabels(language: LanguageKey) {
  const labels: Record<LanguageKey, Record<string, string>> = {
    en: {
      season: 'Season',
      league: 'League',
      type: 'Type',
      color: 'Color',
      composition: 'Composition',
      version: 'Version',
      gender: 'Gender',
      imported: 'Imported',
      moistureWicking: 'Moisture-wicking fabric',
      embroideredCrest: 'Embroidered team crest',
      embroideredLogo: 'Embroidered brand logo',
      regularFit: 'Regular fit',
      // Type values
      home: 'Home',
      away: 'Away',
      third: 'Third',
      // Gender values
      men: 'Men',
      women: 'Women',
      kids: 'Kids',
    },
    de: {
      season: 'Saison',
      league: 'Liga',
      type: 'Typ',
      color: 'Farbe',
      composition: 'Material',
      version: 'Version',
      gender: 'Geschlecht',
      imported: 'Importiert',
      moistureWicking: 'Feuchtigkeitsableitendes Gewebe',
      embroideredCrest: 'Gesticktes Teamwappen',
      embroideredLogo: 'Gesticktes Markenlogo',
      regularFit: 'Normal geschnitten',
      // Type values
      home: 'Heim',
      away: 'Auswärts',
      third: 'Third',
      // Gender values
      men: 'Herren',
      women: 'Damen',
      kids: 'Kinder',
    },
    fr: {
      season: 'Saison',
      league: 'Championnat',
      type: 'Type',
      color: 'Couleur',
      composition: 'Composition',
      version: 'Version',
      gender: 'Genre',
      imported: 'Importé',
      moistureWicking: 'Tissu anti-transpiration',
      embroideredCrest: 'Écusson d\'équipe brodé',
      embroideredLogo: 'Logo de marque brodé',
      regularFit: 'Coupe standard',
      // Type values
      home: 'Domicile',
      away: 'Extérieur',
      third: 'Third',
      // Gender values
      men: 'Hommes',
      women: 'Femmes',
      kids: 'Enfants',
    },
  }
  return labels[language]
}

// 标准化 Version 值
function normalizeVersion(version: string): string {
  const v = version.toLowerCase()
  if (v.includes('player')) return 'Player'
  if (v.includes('authentic')) return 'Authentic'
  if (v.includes('special')) return 'Special Edition'
  if (v.includes('anniversary')) return 'Anniversary Edition'
  return 'Replica' // Fan Version, Fan, Standard, etc. → Replica
}

async function generateContent(
  imageBase64: string,
  language: LanguageKey,
  attributes: any,
  generatedTitle: string,
  model: GeminiModel = 'gemini-2.5-flash'
): Promise<{ name: string; description: string; short_description: string }> {
  const labels = getFieldLabels(language)
  const normalizedVersion = normalizeVersion(attributes.version)

  // 构建属性信息
  const attributeInfo = `
Team: ${attributes.team}
Season: ${attributes.season}
Type: ${attributes.type}
Version: ${normalizedVersion}
Gender: ${attributes.gender}
Sleeve: ${attributes.sleeve}
Events: ${attributes.events?.join(', ') || 'Regular'}`

  // 语言特定的 prompt
  const languagePrompts: Record<LanguageKey, string> = {
    en: `You are a professional football jersey product information assistant. Generate product content for this jersey in English.

## Product Attributes (confirmed):
${attributeInfo}

## Rules:

### name (Product Name)
- Use the provided title exactly: "${generatedTitle}"

### description (Product Description)
- Generate 2-3 sentences highlighting:
  - Historical significance or year of the jersey
  - Fabric technology and comfort
  - Suitable occasions (match day, daily wear)
- Format: <div class="product-description"><p>Content here</p></div>

### short_description (Product Details)
- HTML <ul> list with 8-10 items
- Required fields: ${labels.season}, ${labels.league}, ${labels.type}, ${labels.composition}, ${labels.version}, ${labels.gender}
- Optional: ${labels.color}, ${labels.imported}, technology features (AEROREADY®, Dri-FIT, etc.)
- Version must be: ${normalizedVersion}
- DO NOT include brand names (Nike, Adidas, etc.)
- Format: <ul><li>${labels.season}: ${attributes.season}</li>...</ul>

Example short_description:
<ul>
<li>${labels.season}: ${attributes.season}</li>
<li>${labels.league}: Premier League</li>
<li>${labels.type}: ${labels.home}</li>
<li>${labels.composition}: Polyester</li>
<li>${labels.version}: ${normalizedVersion}</li>
<li>${labels.gender}: ${labels.men}</li>
<li>${labels.imported}</li>
<li>${labels.moistureWicking}</li>
<li>${labels.embroideredCrest}</li>
</ul>`,

    de: `Sie sind ein professioneller Fußballtrikot-Produktassistent. Generieren Sie Produktinhalte für dieses Trikot auf Deutsch.

## Produktattribute (bestätigt):
${attributeInfo}

## Regeln:

### name (Produktname)
- Englischer Titel zum Übersetzen: "${generatedTitle}"
- Übersetzen Sie ins Deutsche (z.B., "Real Madrid Heimtrikot 2024/25", "Retro Bayern Munich Auswärtstrikot 2008/09")

### description (Produktbeschreibung)
- 2-3 Sätze auf Deutsch über:
  - Historische Bedeutung oder Jahr des Trikots
  - Stofftechnologie und Komfort
  - Geeignete Anlässe (Spieltag, Alltag)
- Format: <div class="product-description"><p>Inhalt hier</p></div>

### short_description (Produktdetails)
- HTML <ul> Liste mit 8-10 Elementen
- Erforderlich: ${labels.season}, ${labels.league}, ${labels.type}, ${labels.composition}, ${labels.version}, ${labels.gender}
- Optional: ${labels.color}, ${labels.imported}, Technologiemerkmale (AEROREADY®-Technologie, Dri-FIT-Technologie)
- Version muss sein: ${normalizedVersion}
- KEINE Markennamen (Nike, Adidas, etc.)
- Format: <ul><li>${labels.season}: ${attributes.season}</li>...</ul>

Beispiel short_description:
<ul>
<li>${labels.season}: ${attributes.season}</li>
<li>${labels.league}: England-Premier League</li>
<li>${labels.type}: ${labels.home}</li>
<li>${labels.composition}: Polyester</li>
<li>${labels.version}: ${normalizedVersion}</li>
<li>${labels.gender}: ${labels.men}</li>
<li>${labels.imported}</li>
<li>${labels.moistureWicking}</li>
<li>${labels.embroideredCrest}</li>
</ul>`,

    fr: `Vous êtes un assistant professionnel pour les produits de maillots de football. Générez le contenu produit pour ce maillot en français.

## Attributs du produit (confirmés):
${attributeInfo}

## Règles:

### name (Nom du produit)
- Titre anglais à traduire: "${generatedTitle}"
- Traduisez en français (ex: "Maillot Domicile Real Madrid 2024/25", "Maillot Rétro Bayern Munich Extérieur 2008/09")

### description (Description du produit)
- 2-3 phrases en français sur:
  - Importance historique ou année du maillot
  - Technologie du tissu et confort
  - Occasions appropriées (jour de match, quotidien)
- Format: <div class="product-description"><p>Contenu ici</p></div>

### short_description (Détails du produit)
- Liste HTML <ul> avec 8-10 éléments
- Requis: ${labels.season}, ${labels.league}, ${labels.type}, ${labels.composition}, ${labels.version}, ${labels.gender}
- Optionnel: ${labels.color}, ${labels.imported}, caractéristiques technologiques (Technologie AEROREADY®, Technologie Dri-FIT)
- Version doit être: ${normalizedVersion}
- PAS de noms de marques (Nike, Adidas, etc.)
- Format: <ul><li>${labels.season}: ${attributes.season}</li>...</ul>

Exemple short_description:
<ul>
<li>${labels.season}: ${attributes.season}</li>
<li>${labels.league}: Angleterre-Premier League</li>
<li>${labels.type}: ${labels.home}</li>
<li>${labels.composition}: Polyester</li>
<li>${labels.version}: ${normalizedVersion}</li>
<li>${labels.gender}: ${labels.men}</li>
<li>${labels.imported}</li>
<li>${labels.moistureWicking}</li>
<li>${labels.embroideredCrest}</li>
</ul>`,
  }

  const prompt = languagePrompts[language]

  const schema = {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING', description: 'Product name in the target language' },
      description: { type: 'STRING', description: 'HTML formatted product description' },
      short_description: { type: 'STRING', description: 'HTML formatted short description with <ul><li> list' },
    },
    required: ['name', 'description', 'short_description'],
  }

  const result = await callGeminiAPI(model, prompt, imageBase64, schema)

  // 英文站点直接使用前端生成的标题
  const finalName = language === 'en' ? generatedTitle : result.name

  return {
    name: finalName,
    description: result.description,
    short_description: result.short_description,
  }
}

// ==================== 主入口 ====================

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()

    switch (body.action) {
      case 'recognize-attributes': {
        const result = await recognizeAttributes(
          body.imageBase64,
          body.model || 'gemini-2.5-flash',
          body.teamOptions || []
        )
        return new Response(JSON.stringify({ success: true, attributes: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'generate-content': {
        const result = await generateContent(
          body.imageBase64,
          body.language,
          body.attributes,
          body.generatedTitle,
          body.model || 'gemini-2.5-flash'
        )
        return new Response(JSON.stringify({ success: true, content: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

