import type { SiteConfig } from './types';

// 尺码选项
export const SIZE_OPTIONS = {
  adult: ['S', 'M', 'L', 'XL', '2XL'],
  kids: ['#10（6 Years）', '#12（8 Years）', '#14（10 Years）', '#16（12 Years）', '#18（14 Years）'],
};

// 属性选项
export const ATTRIBUTE_OPTIONS = {
  gender: ["Men's", "Women's", "Kids", "Unisex"],
  season: ['2025/26', '2024/25', '2023/24', '2022/23', 'World Cup 2026', 'Retro'],
  type: ['Home', 'Away', 'Third', 'Fourth', 'Goalkeeper', 'Training', 'Pre-Match', 'Fan Tee', 'Anniversary', 'Zipper'],
  version: ['Player Version', 'Standard', 'Special Edition', 'Retro'],
  sleeve: ['Short Sleeve', 'Long Sleeve', 'Kit'],
  event: ['Regular', 'Champions League', 'Euro Cup 2024', 'Copa America 2024', 'World Cup 2022', 'World Cup 2026', 'Africa Cup 2026', 'Gold Cup'],
  team: [
    // 英超
    'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Chelsea', 'Crystal Palace',
    'Everton', 'Fulham', 'Ipswich Town', 'Leicester City', 'Liverpool', 'Manchester City',
    'Manchester United', 'Newcastle United', 'Nottingham Forest', 'Southampton', 'Tottenham Hotspur',
    'West Ham United', 'Wolverhampton',
    // 西甲
    'Athletic Bilbao', 'Atletico Madrid', 'Barcelona', 'Celta Vigo', 'Espanyol', 'Getafe',
    'Girona', 'Las Palmas', 'Leganes', 'Mallorca', 'Osasuna', 'Rayo Vallecano',
    'Real Betis', 'Real Madrid', 'Real Sociedad', 'Sevilla', 'Valencia', 'Valladolid', 'Villarreal',
    // 德甲
    'Augsburg', 'Bayer Leverkusen', 'Bayern Munich', 'Borussia Dortmund', 'Borussia Monchengladbach',
    'Eintracht Frankfurt', 'Freiburg', 'Heidenheim', 'Hoffenheim', 'Holstein Kiel', 'Mainz 05',
    'RB Leipzig', 'St. Pauli', 'Stuttgart', 'Union Berlin', 'Werder Bremen', 'Wolfsburg',
    // 意甲
    'AC Milan', 'Atalanta', 'Bologna', 'Cagliari', 'Como', 'Empoli', 'Fiorentina', 'Genoa',
    'Hellas Verona', 'Inter Milan', 'Juventus', 'Lazio', 'Lecce', 'Monza', 'Napoli', 'Parma',
    'Roma', 'Torino', 'Udinese', 'Venezia',
    // 法甲
    'Angers', 'Auxerre', 'Brest', 'Le Havre', 'Lens', 'Lille', 'Lyon', 'Marseille', 'Monaco',
    'Montpellier', 'Nantes', 'Nice', 'Paris Saint-Germain', 'Reims', 'Rennes', 'Saint-Etienne',
    'Strasbourg', 'Toulouse',
    // 其他欧洲豪门
    'Ajax', 'Benfica', 'Celtic', 'Fenerbahce', 'Galatasaray', 'Porto', 'PSV', 'Rangers', 'Sporting CP',
    // 国家队
    'Argentina', 'Belgium', 'Brazil', 'England', 'France', 'Germany', 'Italy', 'Mexico',
    'Netherlands', 'Portugal', 'Spain', 'USA',
  ],
};

// 站点配置
export const SITES: SiteConfig[] = [
  { key: 'com', name: 'jerseysfever.com', url: 'https://jerseysfever.com', flag: '🇺🇸', language: 'en' },
  { key: 'uk', name: 'jerseysfever.uk', url: 'https://jerseysfever.uk', flag: '🇬🇧', language: 'en' },
  { key: 'de', name: 'jerseysfever.de', url: 'https://jerseysfever.de', flag: '🇩🇪', language: 'de' },
  { key: 'fr', name: 'jerseysfever.fr', url: 'https://jerseysfever.fr', flag: '🇫🇷', language: 'fr' },
];

// 根据性别获取尺码
export function getSizesForGender(gender: string): string[] {
  return gender === 'Kids' ? SIZE_OPTIONS.kids : SIZE_OPTIONS.adult;
}

// 价格规则
export const PRICE_RULES = {
  normal: '29.99',      // 普通商品
  retro: '34.99',       // Retro 复古
  kit: '35.99',         // Kit 套装
  women: '29.99',       // 女款
  long: '34.99',        // 长袖
  training: '45.99',    // 训练服
};

// 根据商品属性计算价格
export function calculatePrice(info: {
  season: string;
  type: string;
  gender: string;
  sleeve: string;
}): string {
  const { season, type, gender, sleeve } = info;

  // Training 最高优先级
  if (type === 'Training' || type === 'Pre-Match') {
    return PRICE_RULES.training;
  }

  // Kit 套装
  if (sleeve === 'Kit') {
    return PRICE_RULES.kit;
  }

  // Long Sleeve 长袖
  if (sleeve === 'Long Sleeve') {
    return PRICE_RULES.long;
  }

  // Retro 复古
  if (season === 'Retro') {
    return PRICE_RULES.retro;
  }

  // Women 女款 (与普通价格相同，但保留规则)
  if (gender === "Women's") {
    return PRICE_RULES.women;
  }

  // 普通商品
  return PRICE_RULES.normal;
}

// 默认商品信息
export const DEFAULT_PRODUCT_INFO = {
  categories: ['Best Sellers'] as string[],
  season: '2024/25',
  year: '',           // Retro 年份
  type: 'Home',
  version: 'Standard',
  gender: "Men's",
  sleeve: 'Short Sleeve',
  events: ['Regular'],
  price: '29.99',
};

// 特殊分类（不是球队名称）
const SPECIAL_CATEGORIES = [
  'Best Sellers',
  'Retro',
  'Champions League',
  'Euro Cup 2024',
  'Copa America 2024',
  'World Cup 2022',
  'World Cup 2026',
  'Gold Cup',
  'Regular',
  'Uncategorized',
];

// 从分类中提取球队名称（第一个非特殊分类）
export function getTeamFromCategories(categories: string[]): string {
  for (const cat of categories) {
    if (!SPECIAL_CATEGORIES.includes(cat)) {
      return cat;
    }
  }
  return '';
}

// 判断是否为特殊赛季（世界杯、欧洲杯等）
function isSpecialSeason(season: string): boolean {
  return season.startsWith('World Cup') || 
         season.startsWith('Euro Cup') || 
         season.startsWith('Copa America') ||
         season.startsWith('Africa Cup');
}

// 生成商品标题
// 格式规则：
// - 普通: {Team} {Type} Jersey {Season}
// - 世界杯: {Team} {Type} Jersey {World Cup 2026}
// - Retro: Retro {Year} {Team} {Type} Jersey
// - Kids: Kids {Team} {Type} Jersey {Season}
// - Women: {Team} {Type} Jersey {Season} - Women
// - Player Version: {Team} {Type} Jersey Player Version {Season}
// - Long Sleeve: {Team} {Type} Long Sleeve Jersey {Season}
// - Kit: {Team} {Type} Jersey Kit {Season} (适用于所有商品类型)
// - Special Edition: {Team} Jersey {Season} (不包含 Type)
export function generateProductTitle(info: {
  categories: string[];
  type: string;
  season: string;
  year: string;
  version: string;
  gender: string;
  sleeve: string;
}): string {
  const { categories, type, season, year, version, gender, sleeve } = info;

  // 从分类中提取球队名称
  const team = getTeamFromCategories(categories);
  if (!team) return '';

  const parts: string[] = [];
  
  // 判断袖长类型
  const isLongSleeve = sleeve === 'Long Sleeve';
  const isKit = sleeve === 'Kit';
  // Jersey 前面的修饰词
  const jerseyType = isLongSleeve ? 'Long Sleeve Jersey' : (isKit ? 'Jersey Kit' : 'Jersey');
  
  // Special Edition 不包含 type
  const isSpecialEdition = version === 'Special Edition';

  // Retro 商品 (有具体年份)
  if (year || season === 'Retro') {
    parts.push('Retro');
    if (year) parts.push(year);
    parts.push(team);
    if (!isSpecialEdition) parts.push(type);
    parts.push(jerseyType);
    if (isSpecialEdition) {
      parts.push('Special Edition');
    }
  }
  // 特殊赛季（世界杯等）
  else if (isSpecialSeason(season)) {
    if (gender === 'Kids') {
      parts.push('Kids');
    }
    parts.push(team);
    if (!isSpecialEdition) parts.push(type);
    parts.push(jerseyType);
    parts.push(season);  // World Cup 2026
    if (gender === "Women's") {
      parts.push('- Women');
    }
    if (version === 'Player Version') {
      parts.push('- Player Version');
    } else if (isSpecialEdition) {
      parts.push('- Special Edition');
    }
  }
  // Kids 商品
  else if (gender === 'Kids') {
    parts.push('Kids');
    parts.push(team);
    if (!isSpecialEdition) parts.push(type);
    parts.push(jerseyType);
    if (isSpecialEdition) {
      parts.push('Special Edition');
    }
    parts.push(season);
  }
  // Women 商品
  else if (gender === "Women's") {
    parts.push(team);
    if (!isSpecialEdition) parts.push(type);
    parts.push(jerseyType);
    if (version === 'Player Version') {
      parts.push('Player Version');
    } else if (isSpecialEdition) {
      parts.push('Special Edition');
    }
    parts.push(season);
    parts.push('- Women');
  }
  // 普通商品 (Men's / Unisex)
  else {
    parts.push(team);
    if (!isSpecialEdition) parts.push(type);
    parts.push(jerseyType);
    if (version === 'Player Version') {
      parts.push('Player Version');
    } else if (isSpecialEdition) {
      parts.push('Special Edition');
    }
    parts.push(season);
  }

  return parts.filter(Boolean).join(' ');
}

// ==================== SKU 生成 ====================

/**
 * 生成统一格式的 SKU
 * 格式: {TeamCode}-{SeasonCode}-{TypeCode}-{Random}
 * 
 * @example
 * generateSKU('Real Madrid', '2024/25', 'Home') => 'RM-2425-HOM-A3X7K'
 * generateSKU('Manchester United', 'Retro', 'Away') => 'MU-RET-AWA-B2Y8J'
 * generateSKU('Argentina', 'World Cup 2026', 'Home') => 'A-WC26-HOM-C4Z9M'
 */
export function generateSKU(team: string, season: string, type: string): string {
  // 球队代码：取每个单词首字母，大写，最多3位
  const teamCode = team
    .replace(/[^a-zA-Z\s]/g, '')
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 3) || 'XXX';

  // 赛季代码
  let seasonCode = season;
  if (season.includes('/')) {
    // 2024/25 -> 2425
    const parts = season.split('/');
    seasonCode = parts[0].slice(-2) + parts[1];
  } else if (season === 'Retro') {
    seasonCode = 'RET';
  } else if (season === 'World Cup 2026') {
    seasonCode = 'WC26';
  } else if (season.startsWith('World Cup')) {
    // World Cup 2022 -> WC22
    seasonCode = 'WC' + season.slice(-2);
  }

  // 类型代码：取前3个字母
  const typeCode = type.substring(0, 3).toUpperCase();

  // 随机后缀：5位字母数字
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();

  return `${teamCode}-${seasonCode}-${typeCode}-${random}`;
}
