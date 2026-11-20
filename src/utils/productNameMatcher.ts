import { toEnglishDigits } from './jalali.ts';

export interface NameDuplicateMatch<T = { id: string; name: string }> {
  isDuplicate: boolean;
  matchedItem: T | null;
  score: number;
  reason?: string;
}

interface ParsedNameFeatures {
  normalized: string;
  coreTokens: string[];
  coreTokenSet: Set<string>;
  capacityMap: Map<string, Set<string>>;
  tierTokens: Set<string>;
  modelCodes: Set<string>;
}

const PERSIAN_ENGLISH_STOP_WORDS = new Set([
  'مدل',
  'طرح',
  'رنگ',
  'با',
  'به',
  'در',
  'از',
  'و',
  'یا',
  'برای',
  'مناسب',
  'همراه',
  'دارای',
  'بدون',
  'ساخت',
  'اورجینال',
  'اصلی',
  'اصل',
  'شرکتی',
  'گارانتی',
  'ضمانت',
  'پلمپ',
  'جدید',
  'ویژه',
  'فوق',
  'العاده',
  'کالا',
  'محصول',
  'مشکی',
  'سفید',
  'نقره',
  'نقرهای',
  'طوسی',
  'خاکستری',
  'آبی',
  'قرمز',
  'سبز',
  'زرد',
  'طلایی',
  'صورتی',
  'بنفش',
  'نارنجی',
  'قهوه',
  'سرمه',
  'بسته',
  'عدد',
  'سری',
  'نسخه',
  'اینچ',
  'inch',
  'model',
  'color',
  'with',
  'and',
  'for',
  'the',
  'original',
  'black',
  'white',
  'silver',
  'gray',
  'grey',
  'blue',
  'red',
  'gold',
]);

const KNOWN_TIER_TOKENS = new Set([
  'i3',
  'i5',
  'i7',
  'i9',
  'r3',
  'r5',
  'r7',
  'r9',
  'm1',
  'm2',
  'm3',
  'm4',
  'ddr3',
  'ddr4',
  'ddr5',
  'pcie3',
  'pcie4',
  'pcie5',
  'gen10',
  'gen11',
  'gen12',
  'gen13',
  'gen14',
  'usb2',
  'usb3',
]);

/**
 * Normalizes Persian/Arabic characters, digits, ZWNJ, and common compound words
 * so visually different spellings of the same product align cleanly.
 */
export function normalizeProductName(raw: string): string {
  if (!raw) return '';

  let text = toEnglishDigits(raw)
    .toLowerCase()
    .replace(/[\u200c\u200b\u00a0]/g, ' ')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/[أإ]/g, 'ا');

  // Normalize Persian capacity units stuck or spaced after numbers
  text = text
    .replace(/(\d+)\s*(?:ترابایت|ترا|tb)\b/gi, '$1tb')
    .replace(/(\d+)\s*(?:گیگابایت|گیگ|gb)\b/gi, '$1gb')
    .replace(/(\d+)\s*(?:مگابایت|مگ|mb)\b/gi, '$1mb')
    .replace(/(\d+)\s*(?:وات|watt|w)\b/gi, '$1w')
    .replace(/(\d+)\s*(?:هرتز|hz)\b/gi, '$1hz')
    .replace(/(\d+)\s*(?:میلی\s*آمپر|mah)\b/gi, '$1mah');

  // Unify frequent Persian/English product type compounds
  text = text
    .replace(/لپ\s+تاپ/g, 'لپتاپ')
    .replace(/نوت\s+بوک/g, 'نوتبوک')
    .replace(/بی\s+سیم/g, 'بیسیم')
    .replace(/اس\s+اس\s+دی/g, 'ssd')
    .replace(/هارد\s+دیسک/g, 'هارد')
    .replace(/کی\s+برد/g, 'کیبورد')
    .replace(/صفحه\s+کلید/g, 'کیبورد')
    .replace(/\bموس\b/g, 'ماوس')
    .replace(/\bmouse\b/g, 'ماوس')
    .replace(/\bkeyboard\b/g, 'کیبورد')
    .replace(/\blaptop\b/g, 'لپتاپ')
    .replace(/\bwireless\b/g, 'بیسیم')
    .replace(/\bgaming\b/g, 'گیمینگ')
    .replace(/\bmonitor\b/g, 'مانیتور');

  // Keep decimal dots between digits (e.g. 15.6), strip other punctuation to spaces
  text = text
    .replace(/(?<!\d)\.(?!\d)/g, ' ')
    .replace(/[,،؛;:/\\|()\[\]{}"'`~!@#$%^&*+=<>?؟«»\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function extractNameFeatures(raw: string): ParsedNameFeatures {
  const normalized = normalizeProductName(raw);
  const rawTokens = normalized ? normalized.split(' ') : [];

  const coreTokens: string[] = [];
  const coreTokenSet = new Set<string>();
  const capacityMap = new Map<string, Set<string>>();
  const tierTokens = new Set<string>();
  const modelCodes = new Set<string>();

  for (const token of rawTokens) {
    if (!token) continue;
    if (PERSIAN_ENGLISH_STOP_WORDS.has(token)) continue;

    // Ignore lone single-char filler tokens unless numeric/alphanumeric model
    if (token.length === 1 && !/\d/.test(token)) continue;

    coreTokens.push(token);
    coreTokenSet.add(token);

    // Capacity / electrical / refresh spec (e.g. 256gb, 8gb, 1tb, 650w, 144hz)
    const capMatch = token.match(/^(\d+(?:\.\d+)?)(tb|gb|mb|w|hz|mah)$/);
    if (capMatch) {
      const unit = capMatch[2];
      const existingSet = capacityMap.get(unit) || new Set<string>();
      existingSet.add(token);
      capacityMap.set(unit, existingSet);
    }

    // Hardware generation / CPU / RAM tier
    if (KNOWN_TIER_TOKENS.has(token)) {
      tierTokens.add(token);
    }

    // Alphanumeric model codes (e.g., t2, n4500, 15ijl7, g102, k552, rtx3050)
    if (/[a-z]/.test(token) && /\d/.test(token) && !capMatch) {
      modelCodes.add(token);
    }
  }

  return {
    normalized,
    coreTokens,
    coreTokenSet,
    capacityMap,
    tierTokens,
    modelCodes,
  };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const val of a) {
    if (!b.has(val)) return false;
  }
  return true;
}

/**
 * Prevents false positives between two versions/capacities of the same product line
 * (e.g. "IdeaPad 1 8GB 256GB" vs "IdeaPad 1 8GB 512GB" or "Mouse T2" vs "Mouse T3").
 */
function hasCriticalSpecConflict(a: ParsedNameFeatures, b: ParsedNameFeatures): boolean {
  // 1. Storage/RAM/Power/Refresh unit mismatch (when both mention the same unit type)
  for (const [unit, aVals] of a.capacityMap.entries()) {
    const bVals = b.capacityMap.get(unit);
    if (bVals && bVals.size > 0 && !setsEqual(aVals, bVals)) {
      return true;
    }
  }

  // 2. CPU/RAM/Port tier mismatch
  if (a.tierTokens.size > 0 && b.tierTokens.size > 0 && !setsEqual(a.tierTokens, b.tierTokens)) {
    return true;
  }

  // 3. Disjoint alphanumeric model codes (e.g., T2 vs T3, G102 vs G203, 15IJL7 vs 15IAU7)
  if (a.modelCodes.size > 0 && b.modelCodes.size > 0) {
    let hasSharedModel = false;
    for (const code of a.modelCodes) {
      if (b.modelCodes.has(code)) {
        hasSharedModel = true;
        break;
      }
    }
    if (!hasSharedModel) {
      return true;
    }
  }

  return false;
}

function buildBigrams(str: string): Map<string, number> {
  const map = new Map<string, number>();
  const compact = str.replace(/\s+/g, '');
  if (compact.length < 2) return map;
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.slice(i, i + 2);
    map.set(bg, (map.get(bg) || 0) + 1);
  }
  return map;
}

function charBigramDice(aStr: string, bStr: string): number {
  const aBigrams = buildBigrams(aStr);
  const bBigrams = buildBigrams(bStr);
  if (aBigrams.size === 0 || bBigrams.size === 0) return 0;

  let intersection = 0;
  let totalA = 0;
  let totalB = 0;

  for (const count of aBigrams.values()) totalA += count;
  for (const count of bBigrams.values()) totalB += count;

  for (const [bg, countA] of aBigrams.entries()) {
    const countB = bBigrams.get(bg);
    if (countB) {
      intersection += Math.min(countA, countB);
    }
  }

  return (2 * intersection) / (totalA + totalB);
}

/**
 * Computes similarity confidence (0..1) and whether two product names represent
 * the same product, respecting technical hardware specs.
 */
export function compareProductNames(
  nameA: string,
  nameB: string
): { isMatch: boolean; score: number } {
  const featA = extractNameFeatures(nameA);
  const featB = extractNameFeatures(nameB);

  if (!featA.normalized || !featB.normalized) {
    return { isMatch: false, score: 0 };
  }

  if (featA.normalized === featB.normalized) {
    return { isMatch: true, score: 1 };
  }

  if (hasCriticalSpecConflict(featA, featB)) {
    return { isMatch: false, score: 0 };
  }

  if (featA.coreTokenSet.size === 0 || featB.coreTokenSet.size === 0) {
    return { isMatch: false, score: 0 };
  }

  let sharedTokens = 0;
  for (const tok of featA.coreTokenSet) {
    if (featB.coreTokenSet.has(tok)) sharedTokens++;
  }

  const unionCount = featA.coreTokenSet.size + featB.coreTokenSet.size - sharedTokens;
  const minCount = Math.min(featA.coreTokenSet.size, featB.coreTokenSet.size);

  const jaccard = unionCount > 0 ? sharedTokens / unionCount : 0;
  const containment = minCount > 0 ? sharedTokens / minCount : 0;
  const dice = charBigramDice(featA.coreTokens.join(' '), featB.coreTokens.join(' '));

  // Model code overlap bonus when both share exact model codes
  let sharedModelCount = 0;
  for (const code of featA.modelCodes) {
    if (featB.modelCodes.has(code)) sharedModelCount++;
  }
  const hasStrongModelMatch =
    featA.modelCodes.size > 0 &&
    featB.modelCodes.size > 0 &&
    sharedModelCount === Math.min(featA.modelCodes.size, featB.modelCodes.size);

  const minRequiredSharedTokens = minCount <= 2 ? minCount : 2;
  if (sharedTokens < minRequiredSharedTokens) {
    return { isMatch: false, score: Number((jaccard * 0.5 + dice * 0.5).toFixed(2)) };
  }

  const compositeScore = Number(
    (jaccard * 0.42 + containment * 0.33 + dice * 0.25).toFixed(2)
  );

  const isMatch =
    setsEqual(featA.coreTokenSet, featB.coreTokenSet) ||
    jaccard >= 0.62 ||
    (containment >= 0.8 && dice >= 0.7) ||
    (hasStrongModelMatch && containment >= 0.65 && dice >= 0.6);

  return { isMatch, score: Math.min(1, Math.max(compositeScore, isMatch ? 0.75 : 0)) };
}

/**
 * Finds the best duplicate match for `candidateName` among `candidates` strictly by name.
 */
export function findBestNameDuplicate<T extends { id: string; name: string }>(
  candidateName: string,
  candidates: T[]
): NameDuplicateMatch<T> {
  let bestMatch: T | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const { isMatch, score } = compareProductNames(candidateName, candidate.name);
    if (isMatch && score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return {
    isDuplicate: bestMatch !== null,
    matchedItem: bestMatch,
    score: bestScore,
  };
}
