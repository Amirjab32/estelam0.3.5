import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase.ts';
import {
  BackupBundle,
  CloudflareStatus,
  PriceHistoryItem,
  ProductItem,
  StoragePreference,
} from '../types.ts';
import { calculateCustomerQuote } from './firestoreProducts.ts';
import { gregorianToJalali, toPersianDigits } from '../utils/jalali.ts';
import { normalizeBarcodeList } from '../utils/barcodeUtils.ts';

const OFFLINE_BUNDLE_KEY = 'shop_offline_bundle_v1';
const SAVED_PIN_KEY = 'shop_saved_pin_v1';
const STORAGE_PREF_KEY = 'shop_storage_preference_v1';
const CLOUDFLARE_ORIGIN_KEY = 'shop_cloudflare_origin_v1';
const CLOUDFLARE_MIRRORS_KEY = 'shop_cloudflare_mirrors_v1';

export const DEFAULT_CLOUDFLARE_ORIGIN = 'https://estelam-005.pages.dev';

let lastHealthyKvBase: string | null = null;

export function isElectronApp(): boolean {
  return (
    typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')
  );
}

export function normalizeCloudflareOrigin(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_CLOUDFLARE_ORIGIN;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function getCloudflareOrigin(): string {
  try {
    const saved = localStorage.getItem(CLOUDFLARE_ORIGIN_KEY);
    return saved ? normalizeCloudflareOrigin(saved) : DEFAULT_CLOUDFLARE_ORIGIN;
  } catch {
    return DEFAULT_CLOUDFLARE_ORIGIN;
  }
}

export function setCloudflareOrigin(url: string): string {
  const normalized = normalizeCloudflareOrigin(url);
  lastHealthyKvBase = null;
  try {
    localStorage.setItem(CLOUDFLARE_ORIGIN_KEY, normalized);
  } catch {
    // Ignore storage errors
  }
  return normalized;
}

export function getCloudflareMirrors(): string[] {
  try {
    const raw = localStorage.getItem(CLOUDFLARE_MIRRORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((u) => String(u || '').trim())
          .filter(Boolean)
          .map((u) => normalizeCloudflareOrigin(u))
      )
    );
  } catch {
    return [];
  }
}

export function setCloudflareMirrors(input: string | string[]): string[] {
  const rawList = Array.isArray(input)
    ? input
    : String(input || '')
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const normalized = Array.from(new Set(rawList.map((u) => normalizeCloudflareOrigin(u))));
  lastHealthyKvBase = null;
  try {
    localStorage.setItem(CLOUDFLARE_MIRRORS_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage errors
  }
  return normalized;
}

function getKvBaseCandidates(): string[] {
  const primaryOrigin = getCloudflareOrigin();
  const mirrors = getCloudflareMirrors();
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin.replace(/\/+$/, '')
      : '';

  const ordered: string[] = [];
  const pushUnique = (val: string) => {
    if (!ordered.includes(val)) ordered.push(val);
  };

  if (lastHealthyKvBase !== null) {
    pushUnique(lastHealthyKvBase);
  }

  if (Capacitor.isNativePlatform()) {
    pushUnique(primaryOrigin);
    mirrors.forEach(pushUnique);
    return ordered;
  }

  if (isElectronApp()) {
    // Prefer local Express relay first (instant, zero-VPN, relays upstream + caches locally)
    pushUnique('');
    if (primaryOrigin !== currentOrigin) pushUnique(primaryOrigin);
    mirrors.forEach((m) => {
      if (m !== currentOrigin) pushUnique(m);
    });
    return ordered;
  }

  // Standard Web Browser: hit same-origin (/api/kv/* relay or _worker.js) first, then external mirrors
  pushUnique('');
  if (primaryOrigin && primaryOrigin !== currentOrigin) {
    pushUnique(primaryOrigin);
  }
  mirrors.forEach((m) => {
    if (m !== currentOrigin) pushUnique(m);
  });
  return ordered;
}

export const DEFAULT_LOCAL_SEEDS: ProductItem[] = [
  {
    id: 'prod_lenovo_ideapad_1',
    name: 'لپ‌تاپ لنوو مدل IdeaPad 1 15IJL7 با پردازنده Celeron N4500، رم DDR4 8GB، حافظه SSD 256GB',
    category: 'لپ‌تاپ و اولترابوک',
    sourceUrl: 'https://www.digikala.com/product/dkp-18991772/',
    imageUrl:
      'https://dkstatics-public.digikala.com/digikala-products/509ef6a33068c0d055e624baf07569faa72ea082_1786538650.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 89000000,
    lastPriceToman: 89000000,
    marginPercent: 8,
    customerQuoteToman: calculateCustomerQuote(89000000, 8),
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: 'پرفروش‌ترین لپ‌تاپ اقتصادی با قیمت مرجع بدون تخفیف',
  },
  {
    id: 'prod_t2_gaming_mouse',
    name: 'ماوس بی سیم گیمینگ مدل T2',
    category: 'لوازم جانبی و گیمینگ',
    sourceUrl: 'https://www.digikala.com/product/dkp-20717228/',
    imageUrl:
      'https://dkstatics-public.digikala.com/digikala-products/e575af4ee6bdc77e88284fa977c39480bbacf27d_1760876748.jpg?x-oss-process=image/resize,m_lfit,h_800,w_800/quality,q_90',
    currentPriceToman: 2350000,
    lastPriceToman: 2350000,
    marginPercent: 8,
    customerQuoteToman: calculateCustomerQuote(2350000, 8),
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: 'ماوس گیمینگ با محاسبه خودکار ۸٪ سود فروشگاه',
  },
];

export function getSavedShopPin(): string {
  try {
    return localStorage.getItem(SAVED_PIN_KEY) || '';
  } catch {
    return '';
  }
}

export function setSavedShopPin(pin: string): void {
  try {
    localStorage.setItem(SAVED_PIN_KEY, pin.trim());
  } catch {
    // Ignore storage errors
  }
}

export function clearSavedShopPin(): void {
  try {
    localStorage.removeItem(SAVED_PIN_KEY);
  } catch {
    // Ignore
  }
}

export function getStoragePreference(): StoragePreference {
  try {
    const val = localStorage.getItem(STORAGE_PREF_KEY);
    if (val === 'firebase' || val === 'cloudflare' || val === 'auto') return val;
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function setStoragePreference(pref: StoragePreference): void {
  try {
    localStorage.setItem(STORAGE_PREF_KEY, pref);
  } catch {
    // Ignore
  }
}

export function getJalaliNowParts(): { jalaliDate: string; jalaliTime: string } {
  const d = new Date();
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const jalaliDate = `${toPersianDigits(j.jy)}/${toPersianDigits(String(j.jm).padStart(2, '0'))}/${toPersianDigits(String(j.jd).padStart(2, '0'))}`;
  const jalaliTime = `${toPersianDigits(String(d.getHours()).padStart(2, '0'))}:${toPersianDigits(String(d.getMinutes()).padStart(2, '0'))}`;
  return { jalaliDate, jalaliTime };
}

function normalizeCreatedAt(rawCreatedAt: unknown): string {
  if (typeof rawCreatedAt === 'string' && rawCreatedAt.trim().length > 0) {
    const ms = Date.parse(rawCreatedAt.trim());
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString();
    }
  }
  return '';
}

export function normalizeProductItem(raw: any, index = 0): ProductItem {
  const price = Math.max(0, Number(raw?.currentPriceToman) || 0);
  const lastPrice = Math.max(0, Number(raw?.lastPriceToman) || price);
  const rawMargin = raw?.marginPercent;
  const margin =
    rawMargin !== undefined && rawMargin !== null && Number.isFinite(Number(rawMargin))
      ? Math.max(0, Math.min(500, Number(rawMargin)))
      : 8;
  const quote =
    Number(raw?.customerQuoteToman) > 0
      ? Number(raw.customerQuoteToman)
      : calculateCustomerQuote(price, margin);

  const nowIso = new Date().toISOString();
  const createdAtIso = normalizeCreatedAt(raw?.createdAt);
  const lastRefreshedIso = normalizeCreatedAt(raw?.lastRefreshedAt);
  const updatedAtIso = normalizeCreatedAt(raw?.updatedAt);
  return {
    id: String(raw?.id || `prod_${Date.now()}_${index}`),
    name: String(raw?.name || 'کالای بدون نام').trim() || 'کالای بدون نام',
    category: String(raw?.category || 'لوازم جانبی و قطعات').trim() || 'لوازم جانبی و قطعات',
    sourceUrl: String(raw?.sourceUrl || ''),
    imageUrl:
      String(raw?.imageUrl || '') ||
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: price,
    lastPriceToman: lastPrice,
    marginPercent: margin,
    customerQuoteToman: quote,
    stockStatus:
      raw?.stockStatus === 'out_of_stock' || raw?.stockStatus === 'call'
        ? raw.stockStatus
        : 'in_stock',
    warranty: String(raw?.warranty || ''),
    lastRefreshedAt: lastRefreshedIso || createdAtIso || nowIso,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso || lastRefreshedIso || createdAtIso || '',
    notes: String(raw?.notes || ''),
    barcodes: normalizeBarcodeList(raw?.barcodes),
  };
}

export function loadOfflineBundle(): BackupBundle | null {
  try {
    const raw = localStorage.getItem(OFFLINE_BUNDLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.products)) return null;
    return {
      version: Number(parsed.version) || 1,
      exportedAt: String(parsed.exportedAt || new Date().toISOString()),
      source: String(parsed.source || 'offline-cache'),
      products: parsed.products.map((p: any, idx: number) => normalizeProductItem(p, idx)),
      histories: parsed.histories && typeof parsed.histories === 'object' ? parsed.histories : {},
      deletedIds:
        parsed.deletedIds && typeof parsed.deletedIds === 'object' ? parsed.deletedIds : {},
    };
  } catch {
    return null;
  }
}

export function saveOfflineBundle(bundle: BackupBundle): void {
  try {
    localStorage.setItem(OFFLINE_BUNDLE_KEY, JSON.stringify(bundle));
  } catch {
    // Ignore quota errors
  }
}

export function createSeedOfflineBundle(): BackupBundle {
  const { jalaliDate, jalaliTime } = getJalaliNowParts();
  const histories: Record<string, PriceHistoryItem[]> = {};
  DEFAULT_LOCAL_SEEDS.forEach((p) => {
    histories[p.id] = [
      {
        timestamp: p.createdAt,
        jalaliDate,
        jalaliTime,
        priceToman: p.currentPriceToman,
        customerQuoteToman: p.customerQuoteToman,
        source: 'ثبت اولیه نمونه',
        changePercent: 0,
      },
    ];
  });
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'offline-seed',
    products: DEFAULT_LOCAL_SEEDS,
    histories,
    deletedIds: {},
  };
}

function getUpdatedMs(p: ProductItem): number {
  const ts = p.updatedAt || p.lastRefreshedAt || p.createdAt;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function mergeHistoryArrays(
  a: PriceHistoryItem[] = [],
  b: PriceHistoryItem[] = []
): PriceHistoryItem[] {
  const map = new Map<string, PriceHistoryItem>();
  [...a, ...b].forEach((entry) => {
    if (!entry) return;
    const key = entry.timestamp
      ? `${entry.timestamp}_${entry.priceToman}`
      : `${entry.jalaliDate}_${entry.jalaliTime}_${entry.priceToman}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  });
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.timestamp || 0).getTime() - new Date(y.timestamp || 0).getTime()
  );
}

export function mergeBundles(
  base: BackupBundle,
  incoming: BackupBundle,
  preferIncomingOnTie = false
): BackupBundle {
  const mergedDeletedIds: Record<string, string> = { ...(base.deletedIds || {}) };
  Object.entries(incoming.deletedIds || {}).forEach(([id, delIso]) => {
    const existingMs = mergedDeletedIds[id] ? new Date(mergedDeletedIds[id]).getTime() : 0;
    const incomingMs = new Date(delIso).getTime();
    if (incomingMs > existingMs) {
      mergedDeletedIds[id] = delIso;
    }
  });

  const productMap = new Map<string, ProductItem>();

  const consider = (item: ProductItem, isIncoming: boolean) => {
    const prodTime = getUpdatedMs(item);
    const delIso = mergedDeletedIds[item.id];
    const delTime = delIso ? new Date(delIso).getTime() : 0;

    // Exclude items deleted more recently than their last update (unless manual import resurrects)
    if (delTime > prodTime && !(isIncoming && preferIncomingOnTie)) {
      return;
    }

    const existing = productMap.get(item.id);
    if (!existing) {
      productMap.set(item.id, item);
      return;
    }

    const existingTime = getUpdatedMs(existing);
    if (prodTime > existingTime || (isIncoming && preferIncomingOnTie && prodTime >= existingTime)) {
      productMap.set(item.id, item);
    }
  };

  base.products.forEach((p) => consider(p, false));
  incoming.products.forEach((p) => consider(p, true));

  const products = Array.from(productMap.values()).sort((a, b) => {
    const aMs = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const bMs = b.createdAt ? Date.parse(b.createdAt) : NaN;
    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);
    if (!aValid && !bValid) return 0;
    if (!aValid) return 1;
    if (!bValid) return -1;
    return bMs - aMs;
  });

  const histories: Record<string, PriceHistoryItem[]> = {};
  products.forEach((p) => {
    const mergedH = mergeHistoryArrays(base.histories?.[p.id], incoming.histories?.[p.id]);
    if (mergedH.length > 0) {
      histories[p.id] = mergedH;
    }
  });

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'merged-sync',
    products,
    histories,
    deletedIds: mergedDeletedIds,
  };
}

export function parseAndValidateBackupJson(jsonText: string): BackupBundle {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('فایل انتخاب‌شده فرمت معتبر JSON ندارد.');
  }

  let rawProducts: any[] = [];
  let rawHistories: Record<string, PriceHistoryItem[]> = {};
  let rawDeletedIds: Record<string, string> = {};

  if (Array.isArray(parsed)) {
    rawProducts = parsed;
  } else if (parsed && Array.isArray(parsed.products)) {
    rawProducts = parsed.products;
    if (parsed.histories && typeof parsed.histories === 'object') {
      rawHistories = parsed.histories;
    }
    if (parsed.deletedIds && typeof parsed.deletedIds === 'object') {
      rawDeletedIds = parsed.deletedIds;
    }
  } else {
    throw new Error('ساختار فایل بکاپ با فرمت سامانه مطابقت ندارد.');
  }

  const products = rawProducts.map((item, idx) => normalizeProductItem(item, idx));
  const { jalaliDate, jalaliTime } = getJalaliNowParts();
  const histories: Record<string, PriceHistoryItem[]> = {};

  const nowIso = new Date().toISOString();
  products.forEach((p) => {
    const list = Array.isArray(rawHistories[p.id]) ? rawHistories[p.id] : [];
    const fallbackTs = p.createdAt || nowIso;
    if (list.length > 0) {
      histories[p.id] = list.map((h: any) => ({
        timestamp: String(h?.timestamp || fallbackTs),
        jalaliDate: String(h?.jalaliDate || jalaliDate),
        jalaliTime: String(h?.jalaliTime || jalaliTime),
        priceToman: Number(h?.priceToman) || p.currentPriceToman,
        customerQuoteToman: Number(h?.customerQuoteToman) || p.customerQuoteToman,
        source: String(h?.source || 'بازیابی از فایل بکاپ'),
        changePercent: Number.isFinite(Number(h?.changePercent)) ? Number(h.changePercent) : 0,
      }));
    } else {
      histories[p.id] = [
        {
          timestamp: fallbackTs,
          jalaliDate,
          jalaliTime,
          priceToman: p.currentPriceToman,
          customerQuoteToman: p.customerQuoteToman,
          source: 'بازیابی از فایل بکاپ JSON',
          changePercent: 0,
        },
      ];
    }
  });

  return {
    version: Number(parsed?.version) || 1,
    exportedAt: String(parsed?.exportedAt || new Date().toISOString()),
    source: String(parsed?.source || 'json-backup-file'),
    products,
    histories,
    deletedIds: rawDeletedIds,
  };
}

export function downloadBackupJson(bundle: BackupBundle): void {
  const payload: BackupBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: bundle.source || 'shop-backup',
    products: bundle.products,
    histories: bundle.histories || {},
    deletedIds: bundle.deletedIds || {},
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(
    2,
    '0'
  )}`;
  a.href = url;
  a.download = `shop-prices-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface EdgeHttpResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  data: any;
}

async function edgeHttpRequest(
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    isSameOriginRelay?: boolean;
  }
): Promise<EdgeHttpResponse> {
  const timeoutMs = options.timeoutMs ?? 8500;
  const relayHeaders: Record<string, string> = options.isSameOriginRelay
    ? { 'X-Cloudflare-Origin': getCloudflareOrigin() }
    : {};

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: options.method,
      headers: {
        Accept: 'application/json',
        ...relayHeaders,
        ...(options.headers || {}),
      },
      data: options.body !== undefined ? options.body : undefined,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });

    const normalizedHeaders: Record<string, string> = {};
    if (response.headers && typeof response.headers === 'object') {
      Object.entries(response.headers).forEach(([k, v]) => {
        normalizedHeaders[k.toLowerCase()] = String(v);
      });
    }

    let parsedData = response.data;
    if (typeof parsedData === 'string') {
      const trimmed = parsedData.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parsedData = JSON.parse(trimmed);
        } catch {
          // Keep raw string if malformed
        }
      }
    }

    const status = Number(response.status) || 0;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: normalizedHeaders,
      data: parsedData,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: options.method,
      headers: {
        ...relayHeaders,
        ...(options.headers || {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const normalizedHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      normalizedHeaders[key.toLowerCase()] = value;
    });

    const contentType = normalizedHeaders['content-type'] || '';
    let parsedData: any = null;
    if (contentType.includes('application/json')) {
      parsedData = await res.json().catch(() => null);
    } else {
      const text = await res.text().catch(() => '');
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parsedData = JSON.parse(trimmed);
        } catch {
          parsedData = null;
        }
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      headers: normalizedHeaders,
      data: parsedData,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeCloudflareStatus(): Promise<CloudflareStatus> {
  const bases = getKvBaseCandidates();
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const base of bases) {
      try {
        const res = await edgeHttpRequest(`${base}/api/kv/status`, {
          method: 'GET',
          timeoutMs: Capacitor.isNativePlatform() ? 7500 : 5000,
          isSameOriginRelay: base === '',
        });
        const json = res.data;
        if (res.ok && json && typeof json === 'object' && json.success && json.available) {
          lastHealthyKvBase = base;
          return {
            reachable: true,
            kvConfigured: Boolean(json?.kvConfigured),
            kvBindingName: json?.kvBindingName ?? null,
            relayed: Boolean(json?.relayed),
            upstreamReachable:
              json?.upstreamReachable !== undefined ? Boolean(json.upstreamReachable) : true,
            endpointUsed: base || (typeof window !== 'undefined' ? window.location.origin : 'local'),
          };
        }
      } catch {
        // Try next candidate or retry
      }
    }
    if (attempt + 1 < maxAttempts) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return { reachable: false, kvConfigured: false, kvBindingName: null };
}

export async function verifyShopPinOnEdge(pin: string): Promise<{
  valid: boolean;
  kvConfigured: boolean;
  unauthorized?: boolean;
  error?: string;
}> {
  const bases = getKvBaseCandidates();
  let lastError = 'امکان برقراری ارتباط با سرور کلادفلر وجود ندارد.';
  for (const base of bases) {
    try {
      const res = await edgeHttpRequest(`${base}/api/kv/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { pin: pin.trim() },
        timeoutMs: Capacitor.isNativePlatform() ? 8500 : 5500,
        isSameOriginRelay: base === '',
      });
      const json = res.data;
      if (!json || typeof json !== 'object') continue;
      if (!res.ok || !json?.success) {
        return {
          valid: false,
          kvConfigured: Boolean(json?.kvConfigured),
          unauthorized: res.status === 401,
          error: json?.error || 'رمز فروشگاه نادرست است.',
        };
      }
      lastHealthyKvBase = base;
      return {
        valid: true,
        kvConfigured: Boolean(json?.kvConfigured),
        unauthorized: false,
      };
    } catch {
      lastError = 'امکان برقراری ارتباط با سرور کلادفلر وجود ندارد.';
    }
  }
  return {
    valid: false,
    kvConfigured: false,
    unauthorized: false,
    error: lastError,
  };
}

export async function changeShopPinOnEdge(
  currentPin: string,
  newPin: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const bases = getKvBaseCandidates();
  let anySucceeded = false;
  let lastError = 'خطا در برقراری ارتباط برای تغییر رمز فروشگاه.';

  for (const base of bases) {
    try {
      const res = await edgeHttpRequest(`${base}/api/kv/change-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          currentPin: currentPin.trim(),
          newPin: newPin.trim(),
        },
        timeoutMs: Capacitor.isNativePlatform() ? 9000 : 6000,
        isSameOriginRelay: base === '',
      });
      const json = res.data;
      if (!json || typeof json !== 'object') continue;
      if (!res.ok || !json?.success) {
        lastError = json?.error || 'امکان تغییر رمز فروشگاه فراهم نشد.';
        if (res.status === 401 && !anySucceeded) {
          return { ok: false, error: lastError };
        }
        continue;
      }
      lastHealthyKvBase = base;
      anySucceeded = true;
    } catch {
      // Try remaining candidate
    }
  }

  if (anySucceeded) {
    return {
      ok: true,
      message: 'رمز فروشگاه با موفقیت تغییر یافت و رمزنگاری شد.',
    };
  }
  return {
    ok: false,
    error: lastError,
  };
}

export async function fetchCloudflareBundle(pin: string): Promise<{
  reachable: boolean;
  kvConfigured: boolean;
  unauthorized: boolean;
  bundle: BackupBundle | null;
}> {
  const bases = getKvBaseCandidates();
  for (const base of bases) {
    try {
      const res = await edgeHttpRequest(`${base}/api/kv/bundle`, {
        method: 'GET',
        headers: { 'X-Shop-Pin': pin.trim() },
        timeoutMs: Capacitor.isNativePlatform() ? 10500 : 8500,
        isSameOriginRelay: base === '',
      });
      if (res.status === 401) {
        return { reachable: true, kvConfigured: true, unauthorized: true, bundle: null };
      }
      const json = res.data;
      if (!res.ok || !json || typeof json !== 'object') continue;
      lastHealthyKvBase = base;
      if (!json?.kvConfigured) {
        return { reachable: true, kvConfigured: false, unauthorized: false, bundle: null };
      }
      const bundle = json.bundle
        ? {
            version: Number(json.bundle.version) || 1,
            exportedAt: String(json.bundle.exportedAt || new Date().toISOString()),
            source: 'cloudflare-kv',
            products: Array.isArray(json.bundle.products)
              ? json.bundle.products.map((p: any, idx: number) => normalizeProductItem(p, idx))
              : [],
            histories:
              json.bundle.histories && typeof json.bundle.histories === 'object'
                ? json.bundle.histories
                : {},
            deletedIds:
              json.bundle.deletedIds && typeof json.bundle.deletedIds === 'object'
                ? json.bundle.deletedIds
                : {},
          }
        : null;

      return { reachable: true, kvConfigured: true, unauthorized: false, bundle };
    } catch {
      // Try fallback candidate
    }
  }
  return { reachable: false, kvConfigured: false, unauthorized: false, bundle: null };
}

export async function pushCloudflareBundle(
  pin: string,
  bundle: BackupBundle
): Promise<{
  reachable: boolean;
  kvConfigured: boolean;
  unauthorized: boolean;
  saved: boolean;
  bundle: BackupBundle | null;
  error?: string;
}> {
  const bases = getKvBaseCandidates();
  let primaryResult: {
    reachable: boolean;
    kvConfigured: boolean;
    unauthorized: boolean;
    saved: boolean;
    bundle: BackupBundle | null;
    error?: string;
  } | null = null;

  for (const base of bases) {
    try {
      const res = await edgeHttpRequest(`${base}/api/kv/bundle`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Pin': pin.trim(),
        },
        body: bundle,
        timeoutMs: Capacitor.isNativePlatform() ? 11000 : 9000,
        isSameOriginRelay: base === '',
      });
      if (res.status === 401) {
        if (!primaryResult) {
          return {
            reachable: true,
            kvConfigured: true,
            unauthorized: true,
            saved: false,
            bundle: null,
            error: 'احراز هویت با رمز فروشگاه رد شد.',
          };
        }
        continue;
      }
      const json = res.data;
      if (!json || typeof json !== 'object') continue;
      lastHealthyKvBase = base;
      const kvConfigured = Boolean(json?.kvConfigured);
      const saved = Boolean(res.ok && json?.success && kvConfigured);
      const result = {
        reachable: true,
        kvConfigured,
        unauthorized: false,
        saved,
        bundle: saved ? json?.bundle || bundle : null,
        error: saved ? undefined : json?.error || 'ذخیره در حافظه کلادفلر انجام نشد.',
      };
      if (!primaryResult) primaryResult = result;
      if (saved && !isElectronApp()) break;
    } catch {
      // Continue to fallback candidate
    }
  }

  return (
    primaryResult || {
      reachable: false,
      kvConfigured: false,
      unauthorized: false,
      saved: false,
      bundle: null,
      error: 'امکان اتصال به سرور کلادفلر برقرار نشد.',
    }
  );
}

async function probeFirebaseOnce(timeoutMs: number): Promise<boolean> {
  try {
    const result = await Promise.race<boolean>([
      getDocFromServer(doc(db, 'test', 'connection'))
        .then(() => true)
        .catch((err: any) => {
          const code = String(err?.code || '');
          const msg = String(err?.message || '').toLowerCase();
          // Permission denied proves Firestore server responded cleanly!
          if (code === 'permission-denied' || code === 'not-found') {
            return true;
          }
          if (
            code === 'unavailable' ||
            msg.includes('offline') ||
            msg.includes('network') ||
            msg.includes('failed to get document')
          ) {
            return false;
          }
          return true;
        }),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    return result;
  } catch {
    return false;
  }
}

export async function probeFirebaseReachable(timeoutMs = 2800): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  const first = await probeFirebaseOnce(timeoutMs);
  if (first) return true;
  await new Promise((r) => setTimeout(r, 250));
  return probeFirebaseOnce(Math.min(timeoutMs, 2200));
}
