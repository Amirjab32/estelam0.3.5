/**
 * Cloudflare Pages Advanced Mode Worker (_worker.js)
 * 
 * Vite automatically copies everything in public/ directly into dist/.
 * When deploying dist/ to Cloudflare Pages (via drag & drop folder or zip, or wrangler pages deploy),
 * this _worker.js intercepts all /api/* requests and executes them as high-speed Edge Workers!
 * For any other route, it seamlessly serves the static Vite frontend (env.ASSETS).
 */

function toEnglishDigits(str) {
  if (!str) return '';
  return String(str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function extractDkpId(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let decoded = rawInput.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep original string
  }
  const cleaned = toEnglishDigits(decoded);
  if (/^\d{3,10}$/.test(cleaned)) return cleaned;
  const m1 = cleaned.match(/dkp[-_\/]?(\d{3,10})/i);
  if (m1) return m1[1];
  const m2 = cleaned.match(/product_?id=(\d{3,10})/i);
  if (m2) return m2[1];
  const m3 = cleaned.match(/\/product(?:s)?\/(\d{3,10})/i);
  if (m3) return m3[1];
  return null;
}

function guessCategory(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('لپ‌تاپ') || t.includes('لپ تاپ') || t.includes('laptop')) return 'لپ‌تاپ و اولترابوک';
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) return 'مانیتور و نمایشگر';
  if (t.includes('ssd') || t.includes('اس اس دی') || t.includes('رم') || t.includes('گرافیک')) return 'قطعات و ارتقا سیستم';
  if (t.includes('ماوس') || t.includes('موس') || t.includes('کیبورد') || t.includes('هدست')) return 'لوازم جانبی و گیمینگ';
  return 'لوازم جانبی و قطعات';
}

function isDigikalaVariantInStockEdge(v) {
  if (!v || !v.price) return false;
  if (v.status && v.status !== 'marketable') return false;
  if (v.has_stock === false) return false;
  const stock = v.price.marketable_stock;
  if (stock !== undefined && stock !== null && Number(stock) <= 0) return false;
  return true;
}

function parseDigikalaVariantCandidateEdge(v) {
  const p = v && v.price;
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
    sellerTitle: String((v && v.seller && v.seller.title) || '').trim(),
  };
}

function selectDigikalaBestVariantPriceEdge(prod, elapsed) {
  const titleClean = String((prod && prod.title_fa) || 'کالای دیجی‌کالا').trim();
  const cat = (prod && prod.category && prod.category.title_fa) || guessCategory(titleClean);
  const img =
    (prod && prod.images && prod.images.main && prod.images.main.url && prod.images.main.url[0]) ||
    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

  const defaultVar = prod && prod.default_variant;
  const rawVariants = Array.isArray(prod && prod.variants) ? prod.variants : [];

  const mergedVariants = [];
  const seenIds = new Set();
  for (const v of [defaultVar, ...rawVariants]) {
    if (!v || typeof v !== 'object') continue;
    const vid = v.id;
    if (vid !== undefined && vid !== null) {
      if (seenIds.has(vid)) continue;
      seenIds.add(vid);
    }
    mergedVariants.push(v);
  }

  const targetColorId = defaultVar && defaultVar.color ? defaultVar.color.id : null;
  const targetSizeId = defaultVar && defaultVar.size ? defaultVar.size.id : null;

  const candidates = [];
  for (const v of mergedVariants) {
    if (!isDigikalaVariantInStockEdge(v)) continue;
    if (targetColorId !== null && targetColorId !== undefined) {
      const vColorId = v && v.color ? v.color.id : undefined;
      if (vColorId !== targetColorId) continue;
    }
    if (targetSizeId !== null && targetSizeId !== undefined) {
      const vSizeId = v && v.size ? v.size.id : undefined;
      if (vSizeId !== targetSizeId) continue;
    }
    const parsed = parseDigikalaVariantCandidateEdge(v);
    if (parsed) candidates.push(parsed);
  }

  candidates.sort((a, b) => {
    if (a.genuinePriceToman !== b.genuinePriceToman) {
      return a.genuinePriceToman - b.genuinePriceToman;
    }
    if (a.isDiscounted !== b.isDiscounted) {
      return a.isDiscounted ? 1 : -1;
    }
    if (defaultVar && defaultVar.id !== undefined && defaultVar.id !== null) {
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
      source: `استعلام لبه کلادفلر (${elapsed}ms) - کالای ناموجود`,
      stockStatus: 'out_of_stock',
      selectorUsed: 'api.digikala.com (status: out_of_stock)',
      queryTimeMs: elapsed,
    };
  }

  const defaultSeller = String((defaultVar && defaultVar.seller && defaultVar.seller.title) || '').trim();
  const usedCheaperSeller =
    Boolean(best.sellerTitle) && Boolean(defaultSeller) && best.sellerTitle !== defaultSeller;

  const sellerTag = best.sellerTitle ? ` - ${best.sellerTitle}` : '';
  const sourceLabel = best.isDiscounted
    ? `استعلام ابری کلادفلر (${elapsed}ms) قیمت اصلی بدون تخفیف${sellerTag}`
    : usedCheaperSeller
      ? `استعلام ابری کلادفلر (${elapsed}ms) کمترین قیمت غیرتخفیفی${sellerTag}`
      : `استعلام ابری کلادفلر (${elapsed}ms) قیمت مستقیم کالا${sellerTag}`;

  return {
    name: titleClean,
    category: cat,
    priceToman: best.genuinePriceToman,
    imageUrl: img,
    warranty: '',
    source: sourceLabel,
    stockStatus: 'in_stock',
    selectorUsed: usedCheaperSeller
      ? 'api.digikala.com (Cloudflare Edge - variants min genuine same-color)'
      : 'api.digikala.com (Cloudflare Pages Edge Worker)',
    hasDiscount: best.isDiscounted,
    discountedPriceToman: best.isDiscounted ? best.sellingToman : undefined,
    discountPercent: best.discountNum > 0 ? `${best.discountNum}٪` : undefined,
    queryTimeMs: elapsed,
  };
}

const DEFAULT_PRODUCTS = [
  {
    id: 'prod_lenovo_ideapad_1',
    name: 'لپ‌تاپ لنوو مدل IdeaPad 1 15IJL7 با پردازنده Celeron N4500، رم DDR4 8GB، حافظه SSD 256GB، نمایشگر 15.6 اینچ Full HD',
    category: 'لپ‌تاپ و اولترابوک',
    sourceUrl: 'https://www.digikala.com/product/dkp-18991772/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/509ef6a33068c0d055e624baf07569faa72ea082_1786538650.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 89000000,
    lastPriceToman: 89000000,
    marginPercent: 0,
    customerQuoteToman: 89000000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'پرفروش‌ترین لپ‌تاپ اقتصادی با قیمت اصلی بدون بیمه',
  },
  {
    id: 'prod_t2_gaming_mouse',
    name: 'ماوس بی سیم گیمینگ مدل T2',
    category: 'لوازم جانبی و گیمینگ',
    sourceUrl: 'https://www.digikala.com/product/dkp-20717228/',
    imageUrl: 'https://dkstatics-public.digikala.com/digikala-products/e575af4ee6bdc77e88284fa977c39480bbacf27d_1760876748.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 2350000,
    lastPriceToman: 2350000,
    marginPercent: 0,
    customerQuoteToman: 2350000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'ماوس با تخفیف شگفت‌انگیز که قیمت اصلی ۲,۳۵۰,۰۰۰ تومان ثبت شده است',
  },
  {
    id: 'prod_samsung_ssd_980pro',
    name: 'حافظه اس‌اس‌دی سامسونگ مدل 980 PRO PCIe 4.0 NVMe M.2 ظرفیت 1 ترابایت',
    category: 'قطعات و ارتقا سیستم',
    sourceUrl: 'https://www.digikala.com/product/dkp-4820194/',
    imageUrl: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 5450000,
    lastPriceToman: 5300000,
    marginPercent: 0,
    customerQuoteToman: 5450000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'قطعه اصلی برای ارتقای لپ‌تاپ‌های مغازه',
  },
  {
    id: 'prod_xiaomi_monitor_27',
    name: 'مانیتور گیمینگ ۲۷ اینچ شیائومی مدل Redmi G27 با نرخ نوسازی 165Hz IPS',
    category: 'مانیتور و نمایشگر',
    sourceUrl: 'https://www.digikala.com/product/dkp-9302148/',
    imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: 9800000,
    lastPriceToman: 9400000,
    marginPercent: 0,
    customerQuoteToman: 9800000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: 'مانیتور گیمینگ با ووضوح بالا',
  },
];

function mergeSetCookiesIntoJarEdge(jar, headers) {
  let rawHeaders = [];
  if (typeof headers.getSetCookie === 'function') {
    rawHeaders = headers.getSetCookie();
  } else {
    const single = headers.get('set-cookie');
    if (single) rawHeaders = [single];
  }

  const rawCookies = [];
  for (const headerLine of rawHeaders) {
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

function formatCookieJarEdge(jar) {
  if (!jar || jar.size === 0) return '';
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function sleepMsEdge(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeoutEdge(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let cachedWorkerCookies = null;
const WORKER_COOKIE_TTL_MS = 5 * 60 * 1000;

async function fetchDigikalaProductFromEdge(dkpId) {
  const endpoints = [
    `https://api.digikala.com/product/v1/products/${dkpId}/`,
    `https://api.digikala.com/v2/product/${dkpId}/`,
  ];

  const jar = new Map();
  if (cachedWorkerCookies && Date.now() - cachedWorkerCookies.updatedAt < WORKER_COOKIE_TTL_MS) {
    for (const [k, v] of cachedWorkerCookies.pairs) {
      jar.set(k, v);
    }
  }

  let lastStatus = 0;
  let lastError = '';

  for (let round = 0; round < 2; round++) {
    if (round > 0) {
      jar.clear();
      cachedWorkerCookies = null;
      await sleepMsEdge(300);
    }

    let genuineNotFoundCount = 0;

    for (const endpoint of endpoints) {
      let currentUrl = endpoint;
      for (let step = 0; step < 5; step++) {
        try {
          const headers = {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
            Referer: 'https://www.digikala.com/',
            'Cache-Control': 'no-cache',
          };
          const cookieStr = formatCookieJarEdge(jar);
          if (cookieStr) headers['Cookie'] = cookieStr;

          const res = await fetchWithTimeoutEdge(
            currentUrl,
            {
              method: 'GET',
              redirect: 'manual',
              headers,
            },
            4500
          );

          lastStatus = res.status;
          mergeSetCookiesIntoJarEdge(jar, res.headers);

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
          let json = null;
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
                cachedWorkerCookies = {
                  pairs: Array.from(jar.entries()),
                  updatedAt: Date.now(),
                };
              }
              return { json, endpointUsed: currentUrl };
            }
          }

          if (res.status === 404 && json && json.status === 404) {
            genuineNotFoundCount++;
            lastError = 'این محصول در دیجی‌کالا یافت نشد (۴۰۴)';
            break;
          }

          if (res.status === 200 && !json) {
            lastError = 'پاسخ غیرمنتظره امنیتی (HTML) از دیجی‌کالا';
            jar.clear();
            break;
          }

          if (res.status === 403 || res.status === 429) {
            lastError = `محدودیت موقت دیجی‌کالا (کد ${res.status})`;
            jar.clear();
            break;
          }

          lastError = `پاسخ ناموفق دیجی‌کالا (کد ${res.status})`;
          break;
        } catch (err) {
          lastError =
            err && err.name === 'AbortError'
              ? 'اتمام مهلت زمانی پاسخگویی دیجی‌کالا'
              : (err && err.message) || 'خطای شبکه';
          break;
        }
      }
    }

    if (genuineNotFoundCount >= endpoints.length) {
      break;
    }
  }

  return { json: null, lastStatus, lastError };
}

const KV_BUNDLE_KEY = 'shop_bundle_v1';
const KV_PIN_KEY = 'shop_pin_auth_v1';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-Shop-Pin, X-Sync-Secret',
    'Access-Control-Allow-Private-Network': 'true',
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSaltHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function resolveShopKv(env) {
  if (!env || typeof env !== 'object') {
    return { kv: null, bindingName: null };
  }
  const preferred = env.SHOP_KV;
  if (preferred && typeof preferred.get === 'function' && typeof preferred.put === 'function') {
    return { kv: preferred, bindingName: 'SHOP_KV' };
  }
  for (const [key, val] of Object.entries(env)) {
    if (val && typeof val === 'object' && typeof val.get === 'function' && typeof val.put === 'function') {
      return { kv: val, bindingName: key };
    }
  }
  return { kv: null, bindingName: null };
}

function getFallbackShopPin(env) {
  const configured = env && env.SHOP_PIN ? String(env.SHOP_PIN).trim() : '';
  return configured || '1405';
}

async function isPinAuthorized(request, env, bodyPin) {
  const provided = String(
    bodyPin || request.headers.get('X-Shop-Pin') || request.headers.get('x-shop-pin') || ''
  ).trim();
  if (!provided) return false;

  const { kv } = resolveShopKv(env);
  if (kv) {
    try {
      const authRecord = await kv.get(KV_PIN_KEY, { type: 'json' });
      if (authRecord && authRecord.salt && authRecord.hash) {
        const candidateHash = await sha256Hex(`${authRecord.salt}:${provided}`);
        return candidateHash === authRecord.hash;
      }
    } catch {
      // Fall through to env/initial PIN check
    }
  }

  const expected = getFallbackShopPin(env);
  return provided === expected;
}

function calculateCustomerQuoteEdge(priceToman, marginPercent) {
  const price = Number(priceToman);
  if (!Number.isFinite(price) || price <= 0) return 0;
  const rawMargin = Number(marginPercent);
  const safeMargin =
    marginPercent !== undefined &&
    marginPercent !== null &&
    Number.isFinite(rawMargin) &&
    rawMargin >= 0
      ? Math.min(500, rawMargin)
      : 8;
  return Math.round((price * (1 + safeMargin / 100)) / 1000) * 1000;
}

function extractSyncSecretToken(request) {
  const xSyncSecret =
    request.headers.get('X-Sync-Secret') || request.headers.get('x-sync-secret');
  if (xSyncSecret && xSyncSecret.trim()) {
    return xSyncSecret.trim();
  }
  const authHeader =
    request.headers.get('Authorization') || request.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}

async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const aBytes = enc.encode(String(a));
  const bBytes = enc.encode(String(b));
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', aBytes),
    crypto.subtle.digest('SHA-256', bBytes),
  ]);
  const aView = new Uint8Array(aDigest);
  const bView = new Uint8Array(bDigest);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < aView.length; i++) {
    diff |= aView[i] ^ bView[i];
  }
  return diff === 0;
}

function normalizeBundle(raw) {
  const products = Array.isArray(raw?.products) ? raw.products : [];
  const histories = raw?.histories && typeof raw.histories === 'object' ? raw.histories : {};
  const deletedIds = raw?.deletedIds && typeof raw.deletedIds === 'object' ? raw.deletedIds : {};
  return {
    version: 1,
    exportedAt: typeof raw?.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    source: 'cloudflare-kv',
    products,
    histories,
    deletedIds,
  };
}

function buildSanitizedStoreCatalog(rawBundle) {
  const bundle = normalizeBundle(rawBundle || {});
  const rawDeletedIds =
    bundle.deletedIds && typeof bundle.deletedIds === 'object' ? bundle.deletedIds : {};

  const parseTimeMs = (val) => {
    if (!val) return 0;
    const ms = new Date(val).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  const deletedIdSet = new Set();
  const activeIdSet = new Set();
  const sanitizedProducts = [];

  for (const p of bundle.products) {
    if (!p || typeof p !== 'object' || !p.id) continue;
    const id = String(p.id).trim();
    if (!id) continue;

    if (p.deleted === true || p.isDeleted === true || p.deletedAt) {
      deletedIdSet.add(id);
      continue;
    }

    const prodTime = parseTimeMs(p.updatedAt || p.lastRefreshedAt || p.createdAt);
    const delRecord = rawDeletedIds[id];
    if (delRecord) {
      const delTime = parseTimeMs(delRecord);
      if (delTime === 0 || delTime >= prodTime) {
        deletedIdSet.add(id);
        continue;
      }
    }

    const currentPriceToman = Math.max(0, Number(p.currentPriceToman) || 0);
    const rawMargin = p.marginPercent;
    const marginPercent =
      rawMargin !== undefined &&
      rawMargin !== null &&
      Number.isFinite(Number(rawMargin)) &&
      Number(rawMargin) >= 0
        ? Math.min(500, Number(rawMargin))
        : 8;
    const customerQuoteToman =
      currentPriceToman > 0
        ? Number(p.customerQuoteToman) > 0
          ? Number(p.customerQuoteToman)
          : calculateCustomerQuoteEdge(currentPriceToman, marginPercent)
        : 0;
    const stockStatus =
      p.stockStatus === 'out_of_stock' || p.stockStatus === 'call' ? p.stockStatus : 'in_stock';

    activeIdSet.add(id);
    sanitizedProducts.push({
      id,
      name: String(p.name || ''),
      category: String(p.category || ''),
      sourceUrl: String(p.sourceUrl || ''),
      imageUrl: String(p.imageUrl || ''),
      currentPriceToman,
      marginPercent,
      customerQuoteToman,
      stockStatus,
      warranty: String(p.warranty || ''),
      updatedAt: String(
        p.updatedAt || p.lastRefreshedAt || p.createdAt || bundle.exportedAt || ''
      ),
    });
  }

  for (const rawId of Object.keys(rawDeletedIds)) {
    const cleanId = String(rawId || '').trim();
    if (cleanId && !activeIdSet.has(cleanId)) {
      deletedIdSet.add(cleanId);
    }
  }

  return {
    success: true,
    lastSyncedAt: bundle.exportedAt || new Date().toISOString(),
    products: sanitizedProducts,
    deletedIds: Array.from(deletedIdSet),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // 0. API Health & Status check: GET /api/track-url
    if (url.pathname === '/api/track-url' && request.method === 'GET') {
      const { kv, bindingName } = resolveShopKv(env);
      return jsonResponse({
        success: true,
        status: 'online',
        message: 'ورکر ابری کلادفلر (_worker.js) با موفقیت فعال و آماده پاسخگویی است',
        environment: 'Cloudflare Pages Advanced Worker',
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
        timestamp: new Date().toISOString(),
      });
    }

    // 0.1 Cloudflare KV & Shop PIN status check
    if (url.pathname === '/api/kv/status' && request.method === 'GET') {
      const { kv, bindingName } = resolveShopKv(env);
      return jsonResponse({
        success: true,
        available: true,
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
        requiresPin: true,
        environment: 'Cloudflare Pages Edge',
        timestamp: new Date().toISOString(),
      });
    }

    // 0.2 Verify Shop PIN
    if (url.pathname === '/api/kv/verify-pin' && request.method === 'POST') {
      const { kv, bindingName } = resolveShopKv(env);
      const body = await request.json().catch(() => ({}));
      const ok = await isPinAuthorized(request, env, body?.pin);
      if (!ok) {
        return jsonResponse(
          {
            success: false,
            error: 'رمز فروشگاه نادرست است. لطفاً دوباره بررسی کنید.',
          },
          401
        );
      }
      return jsonResponse({
        success: true,
        kvConfigured: Boolean(kv),
        kvBindingName: bindingName,
      });
    }

    // 0.25 Change Shop PIN (stored as salted SHA-256 hash in KV)
    if (url.pathname === '/api/kv/change-pin' && request.method === 'POST') {
      const { kv } = resolveShopKv(env);
      const body = await request.json().catch(() => ({}));
      const currentPin = String(body?.currentPin || '').trim();
      const newPin = String(body?.newPin || '').trim();

      if (!kv) {
        return jsonResponse(
          {
            success: false,
            error:
              'برای ذخیره دائمی رمز جدید، ابتدا فضای Cloudflare KV را در بخش Settings -> Bindings پروژه متصل کنید.',
          },
          400
        );
      }

      const ok = await isPinAuthorized(request, env, currentPin);
      if (!ok) {
        return jsonResponse({ success: false, error: 'رمز فعلی فروشگاه نادرست است.' }, 401);
      }

      if (newPin.length < 4 || newPin.length > 64) {
        return jsonResponse(
          { success: false, error: 'رمز جدید باید حداقل ۴ و حداکثر ۶۴ کاراکتر باشد.' },
          400
        );
      }

      try {
        const salt = generateSaltHex();
        const hash = await sha256Hex(`${salt}:${newPin}`);
        await kv.put(
          KV_PIN_KEY,
          JSON.stringify({
            salt,
            hash,
            updatedAt: new Date().toISOString(),
          })
        );
        return jsonResponse({
          success: true,
          message: 'رمز فروشگاه با موفقیت تغییر یافت و در کلادفلر ذخیره شد.',
        });
      } catch (err) {
        return jsonResponse(
          { success: false, error: err?.message || 'خطا در ذخیره رمز جدید در کلادفلر KV' },
          500
        );
      }
    }

    // 0.3 Get Shop Bundle from Cloudflare KV
    if (url.pathname === '/api/kv/bundle' && request.method === 'GET') {
      if (!(await isPinAuthorized(request, env))) {
        return jsonResponse({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' }, 401);
      }
      const { kv, bindingName } = resolveShopKv(env);
      if (!kv) {
        return jsonResponse({
          success: true,
          kvConfigured: false,
          kvBindingName: null,
          setupRequired: true,
          bundle: null,
        });
      }
      try {
        const stored = await kv.get(KV_BUNDLE_KEY, { type: 'json' });
        return jsonResponse({
          success: true,
          kvConfigured: true,
          kvBindingName: bindingName,
          setupRequired: false,
          bundle: stored ? normalizeBundle(stored) : null,
        });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            kvConfigured: true,
            kvBindingName: bindingName,
            error: err?.message || 'خطا در خواندن از Cloudflare KV',
          },
          500
        );
      }
    }

    // 0.4 Save Shop Bundle to Cloudflare KV
    if (url.pathname === '/api/kv/bundle' && request.method === 'PUT') {
      if (!(await isPinAuthorized(request, env))) {
        return jsonResponse({ success: false, error: 'احراز هویت با رمز فروشگاه الزامی است' }, 401);
      }
      const { kv, bindingName } = resolveShopKv(env);
      if (!kv) {
        return jsonResponse({
          success: false,
          kvConfigured: false,
          kvBindingName: null,
          setupRequired: true,
          bundle: null,
          error: 'حافظه Cloudflare KV در تنظیمات Bindings پروژه (Production/Preview) متصل نشده است.',
        });
      }
      try {
        const body = await request.json().catch(() => ({}));
        const normalized = normalizeBundle(body);
        normalized.exportedAt = new Date().toISOString();
        normalized.source = 'cloudflare-kv';
        await kv.put(KV_BUNDLE_KEY, JSON.stringify(normalized));
        return jsonResponse({
          success: true,
          kvConfigured: true,
          kvBindingName: bindingName,
          bundle: normalized,
        });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            kvConfigured: true,
            kvBindingName: bindingName,
            error: err?.message || 'خطا در ذخیره‌سازی در Cloudflare KV',
          },
          500
        );
      }
    }

    // 0.5 Secure Store Catalog Export for Storefront (Site 2): GET /api/store-catalog
    if (url.pathname === '/api/store-catalog' && request.method === 'GET') {
      const expectedSecret =
        env && typeof env.STORE_SYNC_SECRET === 'string' ? env.STORE_SYNC_SECRET.trim() : '';
      if (!expectedSecret) {
        return jsonResponse(
          {
            success: false,
            error: 'STORE_SYNC_SECRET روی سرور تنظیم نشده است.',
          },
          503
        );
      }

      const providedToken = extractSyncSecretToken(request);
      if (!providedToken || !(await constantTimeEqual(providedToken, expectedSecret))) {
        return jsonResponse(
          {
            success: false,
            error: 'دسترسی غیرمجاز: توکن همگام‌سازی نامعتبر یا ارسال نشده است.',
          },
          401
        );
      }

      const { kv } = resolveShopKv(env);
      if (!kv) {
        return jsonResponse(
          {
            success: false,
            error: 'حافظه Cloudflare KV متصل نشده است.',
          },
          503
        );
      }

      try {
        const stored = await kv.get(KV_BUNDLE_KEY, { type: 'json' });
        const catalog = buildSanitizedStoreCatalog(stored);
        return jsonResponse(catalog, 200);
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            error: err?.message || 'خطا در خواندن کاتالوگ از Cloudflare KV',
          },
          500
        );
      }
    }

    // 1. API: POST /api/track-url
    if (url.pathname === '/api/track-url' && request.method === 'POST') {
      const t0 = Date.now();
      try {
        const { kv } = resolveShopKv(env);
        const body = await request.json().catch(() => ({}));
        if (body?.ping) {
          return jsonResponse({
            success: true,
            status: 'online',
            kvConfigured: Boolean(kv),
            message: 'ورکر کلادفلر فعال و آماده استعلام است',
          });
        }
        const inputUrl = body?.url || '';

        const dkpId = extractDkpId(inputUrl);
        if (!dkpId) {
          return jsonResponse(
            {
              success: false,
              error: 'شناسه یا آدرس معتبر دیجی‌کالا یافت نشد (مثال: dkp-20176433 یا لینک کالا)',
            },
            400
          );
        }

        const { json: finalJson, lastStatus, lastError } = await fetchDigikalaProductFromEdge(dkpId);

        if (!finalJson || !finalJson.data?.product) {
          const detail = lastError || (lastStatus > 0 ? `کد پاسخ: ${lastStatus}` : 'عدم دسترسی');
          return jsonResponse(
            {
              success: false,
              error: `کالای مورد نظر در دیجی‌کالا یافت نشد یا دسترسی موقت مسدود است (${detail})`,
              debug: { dkpId, lastStatus, lastError },
            },
            lastStatus === 404 ? 404 : 502
          );
        }

        const elapsed = Date.now() - t0;
        const data = selectDigikalaBestVariantPriceEdge(finalJson.data.product, elapsed);
        return jsonResponse({ success: true, data });
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            error: err.message || 'خطا در اجرای استعلام کلادفلر',
          },
          500
        );
      }
    }

    // 2. API: GET /api/products
    if (url.pathname === '/api/products' && request.method === 'GET') {
      return jsonResponse({
        success: true,
        products: DEFAULT_PRODUCTS,
      });
    }

    // 3. API: POST /api/products
    if (url.pathname === '/api/products' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const rawMargin = body.marginPercent;
        const margin =
          rawMargin !== undefined &&
          rawMargin !== null &&
          Number.isFinite(Number(rawMargin)) &&
          Number(rawMargin) >= 0
            ? Math.min(500, Number(rawMargin))
            : 8;
        const price = Number(body.currentPriceToman) || 0;
        const newProd = {
          id: body.id || `prod_${Date.now()}`,
          name: body.name || 'کالای جدید',
          category: body.category || 'لوازم جانبی و قطعات',
          sourceUrl: body.sourceUrl || '',
          imageUrl:
            body.imageUrl ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
          currentPriceToman: price,
          lastPriceToman: price,
          marginPercent: margin,
          customerQuoteToman:
            Number(body.customerQuoteToman) || calculateCustomerQuoteEdge(price, margin),
          stockStatus: body.stockStatus || 'in_stock',
          warranty: '',
          lastRefreshedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: body.notes || '',
          barcodes: Array.isArray(body.barcodes)
            ? body.barcodes.map((b) => String(b || '').trim()).filter(Boolean).slice(0, 20)
            : [],
        };

        return jsonResponse({
          success: true,
          product: newProd,
        });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // 3.5 API: DELETE /api/products/:id
    if (url.pathname.startsWith('/api/products/') && request.method === 'DELETE') {
      return jsonResponse({
        success: true,
        message: 'کالا با موفقیت حذف شد',
      });
    }

    // 4. API: GET /api/scheduler/status
    if (url.pathname.startsWith('/api/scheduler')) {
      const now = new Date();
      const nextHour = (Math.floor(now.getHours() / 3) + 1) * 3;
      return jsonResponse({
        success: true,
        intervalHours: 3,
        scheduleTimes: ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
        nextScheduledTime: `ساعت ${String(nextHour % 24).padStart(2, '0')}:00`,
        lastRunTime: 'پایش فعال',
        lastRunStatus: 'موفق',
        lastRunCount: 4,
        totalTrackedProducts: 4,
        isAutoSyncEnabled: true,
        environment: 'Cloudflare Pages Edge',
      });
    }

    // 5. Default: Serve static SPA assets from Vite build
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

