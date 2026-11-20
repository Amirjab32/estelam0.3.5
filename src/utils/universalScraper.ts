/**
 * Universal High-Speed Scraper for Digikala
 * 
 * Works 100% across ALL environments:
 * 1. Cloudflare Workers / Cloudflare Pages Functions (V8 Edge Runtimes)
 * 2. Local developer environment (Windows, Mac, Linux via npm run dev)
 * 3. Node.js Express server (server.ts / VPS / Docker)
 * 4. Browser / Client-side fallback
 * 
 * ZERO external OS dependencies (no curl, no Playwright, no child_process).
 * Pure standard Web API fetch with manual cookie-redirect tracking to bypass DigiCDN.
 */

import { toEnglishDigits } from './jalali.ts';

export interface ScrapedProductData {
  name: string;
  category?: string;
  priceToman: number;
  imageUrl: string;
  warranty: string;
  source: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'call';
  selectorUsed: string;
  hasDiscount?: boolean;
  discountedPriceToman?: number;
  discountPercent?: string;
  queryTimeMs?: number;
}

/**
 * Extract DKP ID from any input (full URL, shorthand, bare digits, or Persian/Arabic digits)
 */
export function extractDkpId(rawInput: string): string | null {
  if (!rawInput || typeof rawInput !== 'string') return null;

  let decoded = rawInput.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep original string if malformed percent-encoding
  }

  const cleaned = toEnglishDigits(decoded);

  // Pure numeric input like "18991772"
  if (/^\d{3,10}$/.test(cleaned)) {
    return cleaned;
  }

  // Match dkp-18991772 or dkp_18991772 or dkp/18991772 (case-insensitive)
  const m1 = cleaned.match(/dkp[-_\/]?(\d{3,10})/i);
  if (m1) return m1[1];

  // Match product_id=18991772 or productId=18991772
  const m2 = cleaned.match(/product_?id=(\d{3,10})/i);
  if (m2) return m2[1];

  // Match /product/18991772 or /products/18991772
  const m3 = cleaned.match(/\/product(?:s)?\/(\d{3,10})/i);
  if (m3) return m3[1];

  return null;
}

/**
 * Checks whether an input string represents a Digikala URL or DKP identifier.
 */
export function isDigikalaUrlOrId(rawInput: string): boolean {
  if (!rawInput || typeof rawInput !== 'string') return false;
  const normalized = toEnglishDigits(rawInput.trim()).toLowerCase();
  if (!normalized) return false;
  return normalized.includes('digikala.com') || extractDkpId(normalized) !== null;
}

/**
 * Guess category from product title if not provided by API
 */
export function guessCategoryFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (
    t.includes('لپ‌تاپ') ||
    t.includes('لپ تاپ') ||
    t.includes('laptop') ||
    t.includes('نوت‌بوک') ||
    t.includes('نوت بوک') ||
    t.includes('مک‌بوک') ||
    t.includes('مک بوک') ||
    t.includes('ideapad') ||
    t.includes('thinkpad') ||
    t.includes('vivobook') ||
    t.includes('zenbook') ||
    t.includes('legion') ||
    t.includes('tuf')
  ) {
    return 'لپ‌تاپ و اولترابوک';
  }
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) {
    return 'مانیتور و نمایشگر';
  }
  if (
    t.includes('ssd') ||
    t.includes('اس اس دی') ||
    t.includes('اس‌اس‌دی') ||
    t.includes('رم') ||
    t.includes('حافظه') ||
    t.includes('گرافیک') ||
    t.includes('مادربرد') ||
    t.includes('پردازنده') ||
    t.includes('پاور') ||
    t.includes('کیس') ||
    t.includes('هارد')
  ) {
    return 'قطعات و ارتقا سیستم';
  }
  if (
    t.includes('ماوس') ||
    t.includes('موس') ||
    t.includes('mouse') ||
    t.includes('کیبورد') ||
    t.includes('صفحه کلید') ||
    t.includes('keyboard') ||
    t.includes('هدست') ||
    t.includes('هدفون') ||
    t.includes('headset') ||
    t.includes('پد') ||
    t.includes('دسته بازی') ||
    t.includes('فلش')
  ) {
    return 'لوازم جانبی و گیمینگ';
  }
  return 'لوازم جانبی و قطعات';
}

function isDigikalaVariantInStock(v: any): boolean {
  if (!v || !v.price) return false;
  if (v.status && v.status !== 'marketable') return false;
  if (v.has_stock === false) return false;
  const stock = v.price.marketable_stock;
  if (stock !== undefined && stock !== null && Number(stock) <= 0) return false;
  return true;
}

function parseDigikalaVariantCandidate(v: any) {
  const p = v?.price;
  if (!p) return null;
  const rrpToman = p.rrp_price ? Math.round(Number(p.rrp_price) / 10) : 0;
  const sellingToman = p.selling_price ? Math.round(Number(p.selling_price) / 10) : 0;
  const genuinePriceToman = rrpToman > 0 ? rrpToman : sellingToman;
  if (!Number.isFinite(genuinePriceToman) || genuinePriceToman <= 0) return null;

  const discountNum = p.discount_percent ? Number(p.discount_percent) : 0;
  const isDiscounted =
    Boolean(p.is_incredible) ||
    Boolean(p.is_promotion) ||
    discountNum > 0 ||
    (rrpToman > 0 && sellingToman > 0 && sellingToman < rrpToman);

  return {
    variant: v,
    genuinePriceToman,
    sellingToman,
    isDiscounted,
    discountNum,
    sellerTitle: String(v?.seller?.title || '').trim(),
  };
}

export function selectDigikalaBestVariantPrice(
  prod: any,
  elapsed: number,
  envLabel = 'استعلام فوری'
): ScrapedProductData {
  const titleClean = String(prod?.title_fa || 'کالای دیجی‌کالا').trim();
  const cat = prod?.category?.title_fa || guessCategoryFromTitle(titleClean);
  const img =
    prod?.images?.main?.url?.[0] ||
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

  const defaultVar = prod?.default_variant;
  const rawVariants = Array.isArray(prod?.variants) ? prod.variants : [];

  const mergedVariants: any[] = [];
  const seenIds = new Set<string | number>();
  for (const v of [defaultVar, ...rawVariants]) {
    if (!v || typeof v !== 'object') continue;
    const vid = v.id;
    if (vid !== undefined && vid !== null) {
      if (seenIds.has(vid)) continue;
      seenIds.add(vid);
    }
    mergedVariants.push(v);
  }

  const targetColorId = defaultVar?.color?.id ?? null;
  const targetSizeId = defaultVar?.size?.id ?? null;

  const candidates: NonNullable<ReturnType<typeof parseDigikalaVariantCandidate>>[] = [];
  for (const v of mergedVariants) {
    if (!isDigikalaVariantInStock(v)) continue;
    if (targetColorId !== null && targetColorId !== undefined && v?.color?.id !== targetColorId) {
      continue;
    }
    if (targetSizeId !== null && targetSizeId !== undefined && v?.size?.id !== targetSizeId) {
      continue;
    }
    const parsed = parseDigikalaVariantCandidate(v);
    if (parsed) candidates.push(parsed);
  }

  candidates.sort((a, b) => {
    if (a.genuinePriceToman !== b.genuinePriceToman) {
      return a.genuinePriceToman - b.genuinePriceToman;
    }
    if (a.isDiscounted !== b.isDiscounted) {
      return a.isDiscounted ? 1 : -1;
    }
    if (defaultVar?.id !== undefined && defaultVar?.id !== null) {
      if (a.variant.id === defaultVar.id) return -1;
      if (b.variant.id === defaultVar.id) return 1;
    }
    return a.sellingToman - b.sellingToman;
  });

  const best = candidates[0];
  if (!best) {
    return {
      name: titleClean,
      category: cat,
      priceToman: 0,
      imageUrl: img,
      warranty: '',
      source: `${envLabel} (${elapsed}ms) - کالای ناموجود در دیجی‌کالا`,
      stockStatus: 'out_of_stock',
      selectorUsed: 'api.digikala.com (status: out_of_stock)',
      queryTimeMs: elapsed,
    };
  }

  const defaultSeller = String(defaultVar?.seller?.title || '').trim();
  const usedCheaperSeller =
    Boolean(best.sellerTitle) && Boolean(defaultSeller) && best.sellerTitle !== defaultSeller;

  const sellerTag = best.sellerTitle ? ` - ${best.sellerTitle}` : '';
  const sourceLabel = best.isDiscounted
    ? `${envLabel} (${elapsed}ms) قیمت اصلی بدون تخفیف${sellerTag}`
    : usedCheaperSeller
      ? `${envLabel} (${elapsed}ms) کمترین قیمت غیرتخفیفی${sellerTag}`
      : `${envLabel} (${elapsed}ms) قیمت مستقیم کالا${sellerTag}`;

  return {
    name: titleClean,
    category: cat,
    priceToman: best.genuinePriceToman,
    imageUrl: img,
    warranty: '',
    source: sourceLabel,
    stockStatus: 'in_stock',
    selectorUsed: usedCheaperSeller
      ? 'api.digikala.com (variants min genuine same-color rrp_price)'
      : 'api.digikala.com (default_variant.price.rrp_price)',
    hasDiscount: best.isDiscounted,
    discountedPriceToman: best.isDiscounted ? best.sellingToman : undefined,
    discountPercent: best.discountNum > 0 ? `${best.discountNum}٪` : undefined,
    queryTimeMs: elapsed,
  };
}

/**
 * Safely parses Set-Cookie headers (handling Expires dates that contain commas)
 * and merges cookie name=value pairs into a persistent Map jar.
 */
export function mergeSetCookiesIntoJar(jar: Map<string, string>, headers: Headers): void {
  let rawHeaders: string[] = [];
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') {
    rawHeaders = anyHeaders.getSetCookie();
  } else {
    const single = headers.get('set-cookie');
    if (single) rawHeaders = [single];
  }

  const rawCookies: string[] = [];
  for (const headerLine of rawHeaders) {
    // Strip Expires attributes (e.g. "Wed, 21 Oct 2026 ...") without eating past the comma into the next cookie
    const withoutExpires = String(headerLine || '').replace(/\bexpires=(?:[a-z]{3},\s*)?[^;,]+/gi, '');
    for (const part of withoutExpires.split(/,(?=\s*[^;,=]+=)/)) {
      if (part.trim()) rawCookies.push(part);
    }
  }

  for (const raw of rawCookies) {
    const firstSegment = String(raw || '').split(';')[0].trim();
    const eqIndex = firstSegment.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = firstSegment.slice(0, eqIndex).trim();
    const value = firstSegment.slice(eqIndex + 1).trim();
    if (!name) continue;
    if (!value || value === 'deleted') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

export function formatCookieJar(jar: Map<string, string>): string {
  if (jar.size === 0) return '';
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface DetailedDigikalaScrapeResult {
  data: ScrapedProductData | null;
  error?: string;
  lastStatus?: number;
  attempts: number;
}

// Short-lived edge/process cookie cache to eliminate cold DigiCDN 307 challenges
let cachedDigikalaCookies: { pairs: Array<[string, string]>; updatedAt: number } | null = null;
const COOKIE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Pure standard Web API fetch with Cookie Jar, multi-endpoint fallback (v1 & v2),
 * per-request AbortController timeout, and automatic retry with backoff.
 */
export async function scrapeDigikalaDetailed(
  urlOrId: string,
  options?: { maxRounds?: number; perRequestTimeoutMs?: number }
): Promise<DetailedDigikalaScrapeResult> {
  const dkpId = extractDkpId(urlOrId);
  if (!dkpId) {
    return {
      data: null,
      error: 'شناسه معتبر دیجی‌کالا در لینک یافت نشد.',
      attempts: 0,
    };
  }

  const t0 = Date.now();
  const maxRounds = options?.maxRounds ?? 2;
  const perRequestTimeoutMs = options?.perRequestTimeoutMs ?? 4500;
  const endpoints = [
    `https://api.digikala.com/product/v1/products/${dkpId}/`,
    `https://api.digikala.com/v2/product/${dkpId}/`,
  ];

  const jar = new Map<string, string>();
  if (
    cachedDigikalaCookies &&
    Date.now() - cachedDigikalaCookies.updatedAt < COOKIE_CACHE_TTL_MS
  ) {
    for (const [k, v] of cachedDigikalaCookies.pairs) {
      jar.set(k, v);
    }
  }

  let lastStatus = 0;
  let lastError = '';
  let attempts = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (round > 0) {
      // Clear stale cookies on retry round and wait briefly before retrying
      jar.clear();
      cachedDigikalaCookies = null;
      await sleepMs(300 * round);
    }

    let genuineNotFoundCount = 0;

    for (const endpoint of endpoints) {
      let currentUrl = endpoint;

      for (let hop = 0; hop < 5; hop++) {
        attempts++;
        try {
          const headers: Record<string, string> = {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
            Referer: 'https://www.digikala.com/',
            'Cache-Control': 'no-cache',
          };
          const cookieStr = formatCookieJar(jar);
          if (cookieStr) {
            headers['Cookie'] = cookieStr;
          }

          const res = await fetchWithTimeout(
            currentUrl,
            {
              method: 'GET',
              redirect: 'manual',
              headers,
            },
            perRequestTimeoutMs
          );

          lastStatus = res.status;
          mergeSetCookiesIntoJar(jar, res.headers);

          if ([301, 302, 307, 308].includes(res.status)) {
            const location = res.headers.get('location');
            if (location) {
              currentUrl = location.startsWith('http')
                ? location
                : new URL(location, currentUrl).toString();
              continue;
            }
            lastError = `ریدایرکت بدون مقصد (کد ${res.status})`;
            break;
          }

          const rawBody = await res.text();
          let json: any = null;
          if (rawBody && rawBody.trim().startsWith('{')) {
            try {
              json = JSON.parse(rawBody);
            } catch {
              json = null;
            }
          }

          if (res.status === 200 && json && (json.status === 200 || json.data?.product)) {
            if (json.data?.product) {
              if (jar.size > 0) {
                cachedDigikalaCookies = {
                  pairs: Array.from(jar.entries()),
                  updatedAt: Date.now(),
                };
              }
              const elapsed = Date.now() - t0;
              return {
                data: selectDigikalaBestVariantPrice(
                  json.data.product,
                  elapsed,
                  'استعلام فوری'
                ),
                lastStatus: 200,
                attempts,
              };
            }
          }

          if (res.status === 404 && json && json.status === 404) {
            genuineNotFoundCount++;
            lastError = 'این محصول در دیجی‌کالا یافت نشد (کد ۴۰۴).';
            break;
          }

          if (res.status === 200 && !json) {
            // Likely a DigiCDN/WAF HTML challenge page returned with HTTP 200
            lastError = 'پاسخ غیرمنتظره امنیتی (HTML) از دیجی‌کالا دریافت شد.';
            jar.clear();
            break;
          }

          if (res.status === 403 || res.status === 429) {
            lastError = `محدودیت موقت دیجی‌کالا (کد ${res.status})`;
            jar.clear();
            break;
          }

          lastError = `پاسخ ناموفق از سرور دیجی‌کالا (کد ${res.status})`;
          break;
        } catch (err: any) {
          const isAbort = err?.name === 'AbortError';
          lastError = isAbort
            ? 'اتمام مهلت زمانی پاسخگویی دیجی‌کالا (Timeout)'
            : err?.message || 'خطای شبکه در ارتباط با دیجی‌کالا';
          break;
        }
      }
    }

    // If both endpoints explicitly returned JSON 404, no need to retry again
    if (genuineNotFoundCount >= endpoints.length) {
      break;
    }
  }

  return {
    data: null,
    error: lastError || 'دریافت اطلاعات کالا از دیجی‌کالا ناموفق بود.',
    lastStatus,
    attempts,
  };
}

export async function scrapeDigikalaPureFetch(dkpId: string): Promise<ScrapedProductData | null> {
  const res = await scrapeDigikalaDetailed(dkpId);
  return res.data;
}

/**
 * Main query entry point
 */
export async function scrapeProductUniversal(urlOrId: string): Promise<ScrapedProductData | null> {
  const dkpId = extractDkpId(urlOrId);
  if (!dkpId) return null;
  const res = await scrapeDigikalaDetailed(dkpId);
  return res.data;
}
