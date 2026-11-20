import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { extractPriceFromDigikalaInspect } from './digikalaScraper.ts';
import { extractDkpId, selectDigikalaBestVariantPrice } from './universalScraper.ts';
import { FIXED_SCHEDULE_HOURS } from './schedule.ts';

export interface ClientScrapedResult {
  name: string;
  category?: string;
  priceToman: number;
  imageUrl: string;
  warranty: string;
  source: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'call';
  hasDiscount?: boolean;
  discountedPriceToman?: number;
  discountPercent?: string;
  queryTimeMs?: number;
}

const CLIENT_SCHEDULER_SLOT_KEY = 'shop_last_client_3h_slot_v1';

function sleepClientMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mergeNativeSetCookies(jar: Map<string, string>, rawSetCookie: unknown): void {
  if (!rawSetCookie) return;
  const text = Array.isArray(rawSetCookie) ? rawSetCookie.join(',') : String(rawSetCookie);
  const withoutExpires = text.replace(/\bexpires=(?:[a-z]{3},\s*)?[^;,]+/gi, '');
  for (const entry of withoutExpires.split(/,(?=\s*[^;,=]+=)/)) {
    const firstSeg = entry.split(';')[0].trim();
    const eqIdx = firstSeg.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = firstSeg.slice(0, eqIdx).trim();
    const value = firstSeg.slice(eqIdx + 1).trim();
    if (!name) continue;
    if (!value || value === 'deleted') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function formatNativeCookieJar(jar: Map<string, string>): string {
  if (jar.size === 0) return '';
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Queries Digikala microservice directly using Capacitor Native HTTP
 * when running inside Android APK — bypasses WebView CORS completely,
 * enabling standalone live price updates during Iran National Intranet ("نت ملی").
 */
async function scrapeDigikalaViaCapacitorNative(
  rawUrl: string,
  externalSignal?: AbortSignal
): Promise<ClientScrapedResult | null> {
  const dkpId = extractDkpId(rawUrl);
  if (!dkpId) return null;

  const t0 = Date.now();
  const endpoints = [
    `https://api.digikala.com/product/v1/products/${dkpId}/`,
    `https://api.digikala.com/v2/product/${dkpId}/`,
  ];
  const jar = new Map<string, string>();

  try {
    for (let round = 0; round < 2; round++) {
      if (externalSignal?.aborted) return null;
      if (round > 0) {
        jar.clear();
        await sleepClientMs(300 * round);
      }

      let genuineNotFoundCount = 0;

      for (const endpoint of endpoints) {
        let currentUrl = endpoint;

        for (let step = 0; step < 5; step++) {
          if (externalSignal?.aborted) return null;

          const headers: Record<string, string> = {
            'User-Agent':
              'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7',
            Referer: 'https://www.digikala.com/',
            'Cache-Control': 'no-cache',
          };
          const cookieStr = formatNativeCookieJar(jar);
          if (cookieStr) headers['Cookie'] = cookieStr;

          const response = await CapacitorHttp.request({
            url: currentUrl,
            method: 'GET',
            connectTimeout: 5000,
            readTimeout: 5000,
            disableRedirects: true,
            headers,
          });

          const setCookieRaw =
            response.headers?.['set-cookie'] || response.headers?.['Set-Cookie'] || '';
          mergeNativeSetCookies(jar, setCookieRaw);

          if ([301, 302, 307, 308].includes(response.status)) {
            const location =
              response.headers?.location || response.headers?.Location || '';
            if (location) {
              currentUrl = String(location).startsWith('http')
                ? String(location)
                : new URL(String(location), currentUrl).toString();
              continue;
            }
            break;
          }

          let parsedJson: any = null;
          if (typeof response.data === 'string') {
            const trimmed = response.data.trim();
            if (trimmed.startsWith('{')) {
              try {
                parsedJson = JSON.parse(trimmed);
              } catch {
                parsedJson = null;
              }
            }
          } else if (response.data && typeof response.data === 'object') {
            parsedJson = response.data;
          }

          if (
            response.status === 200 &&
            parsedJson &&
            (parsedJson.status === 200 || parsedJson.data?.product)
          ) {
            if (parsedJson.data?.product) {
              const elapsed = Date.now() - t0;
              return selectDigikalaBestVariantPrice(
                parsedJson.data.product,
                elapsed,
                'استعلام مستقیم اندروید'
              );
            }
          }

          if (response.status === 404 && parsedJson?.status === 404) {
            genuineNotFoundCount++;
            break;
          }

          if (
            response.status === 403 ||
            response.status === 429 ||
            (response.status === 200 && !parsedJson)
          ) {
            jar.clear();
            break;
          }

          break;
        }
      }

      if (genuineNotFoundCount >= endpoints.length) {
        break;
      }
    }

    return null;
  } catch (err) {
    console.warn('[CapacitorNativeScraper] Digikala query error:', err);
    return null;
  }
}

async function postTrackUrlSingleAttempt(
  endpoint: string,
  payload: { url?: string; inspectHtml?: string; name?: string; imageUrl?: string },
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<{
  data: ClientScrapedResult | null;
  error?: string;
  status: number;
  abortedByCaller: boolean;
  retryable: boolean;
}> {
  if (externalSignal?.aborted) {
    return { data: null, status: 0, abortedByCaller: true, retryable: false };
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        data: null,
        status: res.status,
        abortedByCaller: false,
        retryable: res.status >= 500,
        error:
          res.status === 404
            ? 'سرور استعلام (/api/track-url) در این آدرس فعال نیست.'
            : `پاسخ نامعتبر از سرور استعلام (کد ${res.status})`,
      };
    }
    const json = await res.json();
    if (json?.success && json?.data) {
      return {
        data: json.data as ClientScrapedResult,
        status: res.status,
        abortedByCaller: false,
        retryable: false,
      };
    }
    return {
      data: null,
      status: res.status,
      abortedByCaller: false,
      retryable: res.status >= 500 || res.status === 429,
      error: json?.error || 'اطلاعات قیمت یافت نشد.',
    };
  } catch (err: any) {
    const abortedByCaller = Boolean(externalSignal?.aborted);
    return {
      data: null,
      status: 0,
      abortedByCaller,
      retryable: !abortedByCaller,
      error: timedOut
        ? 'اتمام مهلت زمانی دریافت پاسخ از سرور استعلام'
        : err?.message || 'عدم برقراری ارتباط با سرور استعلام',
    };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

async function postTrackUrlEndpoint(
  endpoint: string,
  payload: { url?: string; inspectHtml?: string; name?: string; imageUrl?: string },
  timeoutMs = 15000,
  externalSignal?: AbortSignal,
  maxAttempts = 2
): Promise<{
  data: ClientScrapedResult | null;
  error?: string;
  status: number;
  abortedByCaller: boolean;
}> {
  let lastResult: Awaited<ReturnType<typeof postTrackUrlSingleAttempt>> = {
    data: null,
    status: 0,
    abortedByCaller: false,
    retryable: false,
  };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleepClientMs(350);
      if (externalSignal?.aborted) {
        return { data: null, status: 0, abortedByCaller: true };
      }
    }

    lastResult = await postTrackUrlSingleAttempt(endpoint, payload, timeoutMs, externalSignal);
    if (lastResult.data || lastResult.abortedByCaller || !lastResult.retryable) {
      break;
    }
  }

  return {
    data: lastResult.data,
    error: lastResult.error,
    status: lastResult.status,
    abortedByCaller: lastResult.abortedByCaller,
  };
}

/**
 * Unified zero-overhead live Digikala fetcher:
 * 1. In Android APK (Capacitor): calls Digikala directly via CapacitorHttp (no CORS, works during Net-Melli).
 * 2. On Web / Cloudflare Pages / Windows Electron: uses /api/track-url first (fast Worker / embedded Node server),
 *    then bridges to http://localhost:3000/api/track-url if running locally on Windows.
 * 3. Inspect HTML snippet fallback offline.
 */
export async function fetchLiveDigikalaProductClient(input: {
  url?: string;
  inspectHtml?: string;
  fallbackName?: string;
  fallbackCategory?: string;
  fallbackImageUrl?: string;
  signal?: AbortSignal;
}): Promise<{ data: ClientScrapedResult | null; diagnosticError?: string; aborted?: boolean }> {
  const url = (input.url || '').trim();
  const inspectHtml = (input.inspectHtml || '').trim();
  const signal = input.signal;

  if (signal?.aborted) {
    return { data: null, aborted: true };
  }

  // Android Capacitor Native path: direct CORS-free internal network call
  if (Capacitor.isNativePlatform() && url) {
    const nativeData = await scrapeDigikalaViaCapacitorNative(url, signal);
    if (signal?.aborted) {
      return { data: null, aborted: true };
    }
    if (nativeData) {
      return { data: nativeData };
    }
  }

  let diagnosticError = '';

  // Web / Electron / Localhost primary path (/api/track-url)
  if (!Capacitor.isNativePlatform() && (url || inspectHtml)) {
    const primary = await postTrackUrlEndpoint(
      '/api/track-url',
      {
        url,
        inspectHtml,
        name: input.fallbackName,
        imageUrl: input.fallbackImageUrl,
      },
      15000,
      signal,
      2
    );
    if (primary.abortedByCaller || signal?.aborted) {
      return { data: null, aborted: true };
    }
    if (primary.data) {
      return { data: primary.data };
    }
    if (primary.error) diagnosticError = primary.error;

    // Local Node/Electron bridge if browsing via remote domain (skip if URL itself was invalid 400)
    if (
      primary.status !== 400 &&
      typeof window !== 'undefined' &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1') &&
      url
    ) {
      const localBridge = await postTrackUrlEndpoint(
        'http://localhost:3000/api/track-url',
        { url, inspectHtml },
        8000,
        signal,
        1
      );
      if (localBridge.abortedByCaller || signal?.aborted) {
        return { data: null, aborted: true };
      }
      if (localBridge.data) {
        return {
          data: {
            ...localBridge.data,
            source: `${localBridge.data.source || 'استعلام سریع'} (سرور محلی سیستم)`,
          },
        };
      }
    }
  }

  // Offline Inspect HTML snippet fallback
  if (inspectHtml) {
    const parsed = extractPriceFromDigikalaInspect(inspectHtml);
    if (parsed && parsed.priceToman > 0) {
      return {
        data: {
          name: input.fallbackName || 'کالای استعلام‌شده',
          category: input.fallbackCategory,
          priceToman: parsed.priceToman,
          imageUrl: input.fallbackImageUrl || '',
          warranty: '',
          hasDiscount: parsed.isDiscountedOriginal,
          source: 'استخراج مستقیم از کد اینسپکت (آفلاین)',
          stockStatus: 'in_stock',
        },
      };
    }
  }

  return { data: null, diagnosticError };
}

/**
 * Returns the most recent 3-hour slot identifier (e.g. "2026-11-14T09")
 * and whether this device has already run an auto-check for that slot.
 */
export function getCurrent3HourSlotId(now: Date = new Date()): string {
  const currentHour = now.getHours();
  const activeSlotHour = [...FIXED_SCHEDULE_HOURS]
    .reverse()
    .find((h) => h <= currentHour) ?? 0;

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(activeSlotHour).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}`;
}

export function shouldRunClient3HourAutoSync(now: Date = new Date()): boolean {
  try {
    const currentSlot = getCurrent3HourSlotId(now);
    const lastSlot = localStorage.getItem(CLIENT_SCHEDULER_SLOT_KEY);
    return lastSlot !== currentSlot;
  } catch {
    return false;
  }
}

export function markClient3HourSlotDone(now: Date = new Date()): void {
  try {
    localStorage.setItem(CLIENT_SCHEDULER_SLOT_KEY, getCurrent3HourSlotId(now));
  } catch {
    // Ignore storage errors
  }
}
