/**
 * Cloudflare Pages Function for /api/track-url
 * Runs directly on Cloudflare Edge (Workers V8 runtime) with 0 latency.
 */

// Helper to convert Persian/Arabic digits
function toEnglishDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

function extractDkpId(rawInput: string): string | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let decoded = rawInput.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep raw string
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

function mergeSetCookiesIntoJar(jar: Map<string, string>, headers: Headers): void {
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

function formatCookieJar(jar: Map<string, string>): string {
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

let cachedEdgeCookies: { pairs: Array<[string, string]>; updatedAt: number } | null = null;
const EDGE_COOKIE_TTL_MS = 5 * 60 * 1000;

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('لپ‌تاپ') || t.includes('لپ تاپ') || t.includes('laptop')) return 'لپ‌تاپ و اولترابوک';
  if (t.includes('مانیتور') || t.includes('نمایشگر') || t.includes('monitor')) return 'مانیتور و نمایشگر';
  if (t.includes('ssd') || t.includes('اس اس دی') || t.includes('رم') || t.includes('گرافیک')) return 'قطعات و ارتقا سیستم';
  if (t.includes('ماوس') || t.includes('موس') || t.includes('کیبورد') || t.includes('هدست')) return 'لوازم جانبی و گیمینگ';
  return 'لوازم جانبی و قطعات';
}

function isDigikalaVariantInStockFn(v: any): boolean {
  if (!v || !v.price) return false;
  if (v.status && v.status !== 'marketable') return false;
  if (v.has_stock === false) return false;
  const stock = v.price.marketable_stock;
  if (stock !== undefined && stock !== null && Number(stock) <= 0) return false;
  return true;
}

function parseDigikalaVariantCandidateFn(v: any) {
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

function selectDigikalaBestVariantPriceFn(prod: any, elapsed: number) {
  const titleClean = String(prod?.title_fa || 'کالای دیجی‌کالا').trim();
  const cat = prod?.category?.title_fa || guessCategory(titleClean);
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

  const candidates: NonNullable<ReturnType<typeof parseDigikalaVariantCandidateFn>>[] = [];
  for (const v of mergedVariants) {
    if (!isDigikalaVariantInStockFn(v)) continue;
    if (targetColorId !== null && targetColorId !== undefined && v?.color?.id !== targetColorId) {
      continue;
    }
    if (targetSizeId !== null && targetSizeId !== undefined && v?.size?.id !== targetSizeId) {
      continue;
    }
    const parsed = parseDigikalaVariantCandidateFn(v);
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
      source: `استعلام لبه کلادفلر (${elapsed}ms) - کالای ناموجود`,
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
      ? 'api.digikala.com (Cloudflare Function - variants min genuine same-color)'
      : 'api.digikala.com (Cloudflare Pages Edge Function)',
    hasDiscount: best.isDiscounted,
    discountedPriceToman: best.isDiscounted ? best.sellingToman : undefined,
    discountPercent: best.discountNum > 0 ? `${best.discountNum}٪` : undefined,
    queryTimeMs: elapsed,
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context: any) {
  const t0 = Date.now();
  try {
    const body: any = await context.request.json().catch(() => ({}));
    if (body?.ping) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'online',
          message: 'تابع استعلام کلادفلر آماده پاسخگویی است',
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const url = body?.url || '';
    const dkpId = extractDkpId(url);
    if (!dkpId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'شناسه یا آدرس معتبر دیجی‌کالا یافت نشد',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const endpoints = [
      `https://api.digikala.com/product/v1/products/${dkpId}/`,
      `https://api.digikala.com/v2/product/${dkpId}/`,
    ];

    const jar = new Map<string, string>();
    if (cachedEdgeCookies && Date.now() - cachedEdgeCookies.updatedAt < EDGE_COOKIE_TTL_MS) {
      for (const [k, v] of cachedEdgeCookies.pairs) {
        jar.set(k, v);
      }
    }

    let finalJson: any = null;
    let lastStatus = 0;
    let lastError = '';

    for (let round = 0; round < 2 && !finalJson; round++) {
      if (round > 0) {
        jar.clear();
        cachedEdgeCookies = null;
        await sleepMs(300);
      }

      let genuineNotFoundCount = 0;

      for (const endpoint of endpoints) {
        if (finalJson) break;
        let currentUrl = endpoint;

        for (let hop = 0; hop < 5; hop++) {
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
            if (cookieStr) headers['Cookie'] = cookieStr;

            const res = await fetchWithTimeout(
              currentUrl,
              {
                method: 'GET',
                redirect: 'manual',
                headers,
              },
              4500
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
                  cachedEdgeCookies = {
                    pairs: Array.from(jar.entries()),
                    updatedAt: Date.now(),
                  };
                }
                finalJson = json;
                break;
              }
            }

            if (res.status === 404 && json && json.status === 404) {
              genuineNotFoundCount++;
              lastError = 'این محصول در دیجی‌کالا یافت نشد (کد ۴۰۴).';
              break;
            }

            if (res.status === 200 && !json) {
              lastError = 'پاسخ غیرمنتظره امنیتی (HTML) از دیجی‌کالا دریافت شد.';
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
          } catch (err: any) {
            lastError =
              err?.name === 'AbortError'
                ? 'اتمام مهلت زمانی پاسخگویی دیجی‌کالا'
                : err?.message || 'خطای شبکه در ارتباط با دیجی‌کالا';
            break;
          }
        }
      }

      if (genuineNotFoundCount >= endpoints.length) {
        break;
      }
    }

    if (!finalJson || !finalJson.data?.product) {
      const detail = lastError || (lastStatus > 0 ? `کد پاسخ: ${lastStatus}` : 'عدم دسترسی');
      return new Response(
        JSON.stringify({
          success: false,
          error: `اطلاعات کالا از دیجی‌کالا دریافت نشد (${detail})`,
          debug: { dkpId, lastStatus, lastError },
        }),
        {
          status: lastStatus === 404 ? 404 : 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const elapsed = Date.now() - t0;
    const data = selectDigikalaBestVariantPriceFn(finalJson.data.product, elapsed);
    return new Response(
      JSON.stringify({
        success: true,
        data,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'خطا در اجرای تابع کلادفلر',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
