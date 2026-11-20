import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import { PriceHistoryItem, ProductItem } from '../types.ts';
import { gregorianToJalali, toPersianDigits } from '../utils/jalali.ts';
import { normalizeBarcodeList } from '../utils/barcodeUtils.ts';

export const SHARED_SHOP_ID = 'main-shop';

function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}_${Date.now()}`;
}

function clampStr(raw: unknown, maxLen: number, fallback = ''): string {
  const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
  const val = s.length > 0 ? s : fallback;
  return val.slice(0, maxLen);
}

function toNumber(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeMargin(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 8;
  return Math.min(500, n);
}

export function calculateCustomerQuote(priceToman: number, marginPercent: number): number {
  if (!Number.isFinite(priceToman) || priceToman <= 0) return 0;
  const safeMargin =
    Number.isFinite(marginPercent) && marginPercent >= 0 ? Math.min(500, marginPercent) : 8;
  return Math.round((priceToman * (1 + safeMargin / 100)) / 1000) * 1000;
}

function getJalaliNow(): { jalaliDate: string; jalaliTime: string } {
  const d = new Date();
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const jalaliDate = `${toPersianDigits(j.jy)}/${toPersianDigits(String(j.jm).padStart(2, '0'))}/${toPersianDigits(String(j.jd).padStart(2, '0'))}`;
  const jalaliTime = `${toPersianDigits(String(d.getHours()).padStart(2, '0'))}:${toPersianDigits(String(d.getMinutes()).padStart(2, '0'))}`;
  return { jalaliDate, jalaliTime };
}

function timestampToIso(ts: unknown): string {
  const optional = timestampToOptionalIso(ts);
  return optional || new Date().toISOString();
}

function timestampToOptionalIso(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (ts && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    if (d instanceof Date && Number.isFinite(d.getTime())) {
      return d.toISOString();
    }
  }
  if (ts && typeof ts === 'object' && typeof (ts as { seconds?: unknown }).seconds === 'number') {
    const ms = (ts as { seconds: number }).seconds * 1000;
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  if (typeof ts === 'string' && ts.trim().length > 0) {
    const ms = Date.parse(ts.trim());
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return '';
}

function mapDocToProduct(data: Record<string, any>, hasPendingWrites = false): ProductItem {
  const currentPrice = toNumber(data.currentPriceToman, 0);
  const margin = normalizeMargin(data.marginPercent ?? 8);
  const quote = toNumber(data.customerQuoteToman, calculateCustomerQuote(currentPrice, margin));
  const createdIso = timestampToOptionalIso(data.createdAt);
  const refreshedIso = timestampToOptionalIso(data.lastRefreshedAt);
  const updatedIso = timestampToOptionalIso(data.updatedAt);
  const effectiveUpdatedAt =
    updatedIso || (hasPendingWrites ? new Date().toISOString() : refreshedIso || createdIso);

  return {
    id: String(data.id),
    name: String(data.name || 'کالای بدون نام'),
    category: String(data.category || 'لوازم جانبی و قطعات'),
    sourceUrl: String(data.sourceUrl || ''),
    imageUrl:
      String(data.imageUrl || '') ||
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    currentPriceToman: currentPrice,
    lastPriceToman: toNumber(data.lastPriceToman, currentPrice),
    marginPercent: margin,
    customerQuoteToman: quote,
    stockStatus:
      data.stockStatus === 'out_of_stock' || data.stockStatus === 'call'
        ? data.stockStatus
        : 'in_stock',
    warranty: String(data.warranty || ''),
    lastRefreshedAt: refreshedIso || (hasPendingWrites ? new Date().toISOString() : createdIso),
    createdAt: createdIso,
    updatedAt: effectiveUpdatedAt,
    notes: String(data.notes || ''),
    barcodes: normalizeBarcodeList(data.barcodes),
  };
}

function mapDocToHistory(data: Record<string, any>): PriceHistoryItem {
  return {
    timestamp: timestampToIso(data.createdAt),
    jalaliDate: String(data.jalaliDate || ''),
    jalaliTime: String(data.jalaliTime || ''),
    priceToman: toNumber(data.priceToman, 0),
    customerQuoteToman: toNumber(data.customerQuoteToman, 0),
    source: String(data.source || 'ثبت قیمت'),
    changePercent: Number.isFinite(Number(data.changePercent)) ? Number(data.changePercent) : 0,
  };
}

const DEFAULT_CLOUD_SEEDS: Array<
  Partial<ProductItem> & { id: string; name: string; currentPriceToman: number }
> = [
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
    stockStatus: 'in_stock',
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
    stockStatus: 'in_stock',
    notes: 'ماوس گیمینگ با محاسبه خودکار ۸٪ سود فروشگاه',
  },
];

function buildCreateSharedProductPayload(
  actorUid: string,
  prodId: string,
  input: Partial<ProductItem>,
  shopId = SHARED_SHOP_ID
) {
  const price = toNumber(input.currentPriceToman, 0);
  const lastPrice = toNumber(input.lastPriceToman, price);
  const margin = normalizeMargin(input.marginPercent ?? 8);
  const quote = toNumber(input.customerQuoteToman, calculateCustomerQuote(price, margin));
  const stockStatus: 'in_stock' | 'out_of_stock' | 'call' =
    input.stockStatus === 'out_of_stock' || input.stockStatus === 'call'
      ? input.stockStatus
      : 'in_stock';

  const normalizedBarcodes = normalizeBarcodeList(input.barcodes);

  return {
    id: prodId,
    shopId,
    createdBy: actorUid,
    updatedBy: actorUid,
    name: clampStr(input.name, 500, 'کالای جدید'),
    category: clampStr(input.category, 120, 'لوازم جانبی و قطعات'),
    sourceUrl: clampStr(input.sourceUrl, 2048, ''),
    imageUrl: clampStr(
      input.imageUrl,
      2048,
      'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'
    ),
    currentPriceToman: price,
    lastPriceToman: lastPrice,
    marginPercent: margin,
    customerQuoteToman: quote,
    stockStatus,
    warranty: clampStr(input.warranty, 200, ''),
    notes: clampStr(input.notes, 1000, ''),
    ...(normalizedBarcodes.length > 0 ? { barcodes: normalizedBarcodes } : {}),
    lastRefreshedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildCreateSharedHistoryPayload(
  actorUid: string,
  productId: string,
  historyId: string,
  priceToman: number,
  customerQuoteToman: number,
  source: string,
  changePercent = 0,
  jalaliDateOverride?: string,
  jalaliTimeOverride?: string,
  shopId = SHARED_SHOP_ID
) {
  const nowParts = getJalaliNow();
  return {
    id: historyId,
    shopId,
    productId,
    createdBy: actorUid,
    jalaliDate: clampStr(jalaliDateOverride || nowParts.jalaliDate, 32, '۱۴۰۵/۰۸/۲۳'),
    jalaliTime: clampStr(jalaliTimeOverride || nowParts.jalaliTime, 32, '۰۰:۰۰'),
    priceToman: toNumber(priceToman, 0),
    customerQuoteToman: toNumber(customerQuoteToman, 0),
    source: clampStr(source, 300, 'ثبت اولیه کالا'),
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    createdAt: serverTimestamp(),
  };
}

/**
 * Ensures the shared shop workspace (`/shops/main-shop`) exists and runs one-time
 * initialization ONLY when the shared shop is empty and not yet seeded.
 * Subsequent authorized Google emails skip seeding completely and read live shared data.
 */
export async function ensureSharedShopInitialized(
  user: User,
  shopId = SHARED_SHOP_ID
): Promise<void> {
  const shopPath = `shops/${shopId}`;
  const shopRef = doc(db, 'shops', shopId);

  let alreadySeeded = false;
  try {
    const snap = await getDoc(shopRef);
    if (!snap.exists()) {
      await setDoc(shopRef, {
        id: shopId,
        name: 'فروشگاه مرکزی کامپیوتر و لپ‌تاپ',
        seededDefaults: false,
        createdBy: user.uid,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      alreadySeeded = Boolean(data?.seededDefaults);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, shopPath);
  }

  // Shared shop already initialized by a previous team account — never overwrite or re-seed!
  if (alreadySeeded) return;

  const productsPath = `shops/${shopId}/products`;
  let existingCount = 0;
  try {
    const existingSnap = await getDocs(
      query(collection(db, 'shops', shopId, 'products'), where('shopId', '==', shopId))
    );
    existingCount = existingSnap.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, productsPath);
  }

  if (existingCount > 0) {
    try {
      await updateDoc(shopRef, {
        seededDefaults: true,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, shopPath);
    }
    return;
  }

  // One-time migration from legacy personal Firestore (`users/{uid}/products`) if present
  let itemsToSeed: Partial<ProductItem>[] = [];
  let legacyHistories: Record<string, PriceHistoryItem[]> = {};

  try {
    const legacySnap = await getDocs(
      query(collection(db, 'users', user.uid, 'products'), where('ownerId', '==', user.uid))
    );
    if (!legacySnap.empty) {
      itemsToSeed = legacySnap.docs.map((d) => mapDocToProduct(d.data()));
      await Promise.all(
        itemsToSeed.map(async (prod) => {
          if (!prod.id) return;
          const safeProdId = sanitizeId(prod.id, 'prod');
          const legacyHistSnap = await getDocs(
            query(
              collection(db, 'users', user.uid, 'products', safeProdId, 'history'),
              where('ownerId', '==', user.uid),
              where('productId', '==', safeProdId)
            )
          ).catch(() => null);
          if (legacyHistSnap && !legacyHistSnap.empty) {
            legacyHistories[safeProdId] = legacyHistSnap.docs.map((h) => mapDocToHistory(h.data()));
          }
        })
      );
    }
  } catch {
    // No legacy per-user data or inaccessible — proceed to local/default check
  }

  // Fallback to local offline cache if no legacy cloud records were found
  if (itemsToSeed.length === 0) {
    try {
      const bundleRaw = localStorage.getItem('shop_offline_bundle_v1');
      if (bundleRaw) {
        const parsedBundle = JSON.parse(bundleRaw);
        if (Array.isArray(parsedBundle?.products) && parsedBundle.products.length > 0) {
          itemsToSeed = parsedBundle.products;
          if (parsedBundle.histories && typeof parsedBundle.histories === 'object') {
            legacyHistories = parsedBundle.histories;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (itemsToSeed.length === 0) {
    const cachedRaw = localStorage.getItem('shop_saved_products');
    if (cachedRaw !== null) {
      try {
        const parsed = JSON.parse(cachedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          itemsToSeed = parsed;
        } else {
          itemsToSeed = DEFAULT_CLOUD_SEEDS;
        }
      } catch {
        itemsToSeed = DEFAULT_CLOUD_SEEDS;
      }
    } else {
      itemsToSeed = DEFAULT_CLOUD_SEEDS;
    }
  }

  if (itemsToSeed.length > 0) {
    const CHUNK_SIZE = 15;
    for (let i = 0; i < itemsToSeed.length; i += CHUNK_SIZE) {
      const chunk = itemsToSeed.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((item, idx) => {
        const prodId = sanitizeId(item.id || `prod_${Date.now()}_${i + idx}`, 'prod');
        const prodRef = doc(db, 'shops', shopId, 'products', prodId);
        const prodPayload = buildCreateSharedProductPayload(user.uid, prodId, item, shopId);
        batch.set(prodRef, prodPayload);

        const existingHist = legacyHistories[prodId] || legacyHistories[item.id || ''] || [];
        if (existingHist.length > 0) {
          existingHist.slice(-25).forEach((h, hIdx) => {
            const histId = sanitizeId(`hist_${Date.now()}_${i + idx}_${hIdx}`, 'hist');
            batch.set(
              doc(db, 'shops', shopId, 'products', prodId, 'history', histId),
              buildCreateSharedHistoryPayload(
                user.uid,
                prodId,
                histId,
                h.priceToman ?? prodPayload.currentPriceToman,
                h.customerQuoteToman ?? prodPayload.customerQuoteToman,
                h.source || 'انتقال خودکار به فروشگاه مشترک',
                h.changePercent ?? 0,
                h.jalaliDate,
                h.jalaliTime,
                shopId
              )
            );
          });
        } else {
          const histId = sanitizeId(`hist_${Date.now()}_${i + idx}`, 'hist');
          batch.set(
            doc(db, 'shops', shopId, 'products', prodId, 'history', histId),
            buildCreateSharedHistoryPayload(
              user.uid,
              prodId,
              histId,
              prodPayload.currentPriceToman,
              prodPayload.customerQuoteToman,
              'همگام‌سازی اولیه فروشگاه مشترک',
              0,
              undefined,
              undefined,
              shopId
            )
          );
        }
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, productsPath);
      }
    }
  }

  try {
    await updateDoc(shopRef, {
      seededDefaults: true,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, shopPath);
  }
}

export function subscribeToSharedProducts(
  onData: (products: ProductItem[]) => void,
  onError?: (err: unknown) => void,
  shopId = SHARED_SHOP_ID
): () => void {
  const path = `shops/${shopId}/products`;
  const q = query(collection(db, 'shops', shopId, 'products'), where('shopId', '==', shopId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => mapDocToProduct(d.data(), d.metadata.hasPendingWrites));
      items.sort((a, b) => {
        const aMs = a.createdAt ? Date.parse(a.createdAt) : NaN;
        const bMs = b.createdAt ? Date.parse(b.createdAt) : NaN;
        const aValid = Number.isFinite(aMs);
        const bValid = Number.isFinite(bMs);
        if (!aValid && !bValid) return 0;
        if (!aValid) return 1;
        if (!bValid) return -1;
        return bMs - aMs;
      });
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Error already logged cleanly by handleFirestoreError
      }
    }
  );
}

export function subscribeToSharedProductHistory(
  productId: string,
  onData: (history: PriceHistoryItem[]) => void,
  shopId = SHARED_SHOP_ID
): () => void {
  const safeProdId = sanitizeId(productId, 'prod');
  const path = `shops/${shopId}/products/${safeProdId}/history`;
  const q = query(
    collection(db, 'shops', shopId, 'products', safeProdId, 'history'),
    where('shopId', '==', shopId),
    where('productId', '==', safeProdId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((d) => mapDocToHistory(d.data()));
      entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      onData(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Logged by handleFirestoreError
      }
    }
  );
}

export async function addProductToFirestore(
  actorUid: string,
  input: Partial<ProductItem>,
  shopId = SHARED_SHOP_ID
): Promise<ProductItem> {
  const prodId = sanitizeId(input.id || `prod_${Date.now()}`, 'prod');
  const histId = sanitizeId(`hist_${Date.now()}`, 'hist');
  const path = `shops/${shopId}/products/${prodId}`;

  const prodPayload = buildCreateSharedProductPayload(actorUid, prodId, input, shopId);
  const histPayload = buildCreateSharedHistoryPayload(
    actorUid,
    prodId,
    histId,
    prodPayload.currentPriceToman,
    prodPayload.customerQuoteToman,
    'ثبت اولیه کالا در فروشگاه مشترک',
    0,
    undefined,
    undefined,
    shopId
  );

  const batch = writeBatch(db);
  batch.set(doc(db, 'shops', shopId, 'products', prodId), prodPayload);
  batch.set(doc(db, 'shops', shopId, 'products', prodId, 'history', histId), histPayload);

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }

  const nowIso = new Date().toISOString();
  return {
    id: prodId,
    name: prodPayload.name,
    category: prodPayload.category,
    sourceUrl: prodPayload.sourceUrl,
    imageUrl: prodPayload.imageUrl,
    currentPriceToman: prodPayload.currentPriceToman,
    lastPriceToman: prodPayload.lastPriceToman,
    marginPercent: prodPayload.marginPercent,
    customerQuoteToman: prodPayload.customerQuoteToman,
    stockStatus: prodPayload.stockStatus,
    warranty: prodPayload.warranty,
    lastRefreshedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    notes: prodPayload.notes,
    barcodes: prodPayload.barcodes,
  };
}

export async function addBulkProductsToFirestore(
  actorUid: string,
  inputs: Partial<ProductItem>[],
  shopId = SHARED_SHOP_ID
): Promise<ProductItem[]> {
  if (inputs.length === 0) return [];
  const productsPath = `shops/${shopId}/products`;
  const createdItems: ProductItem[] = [];
  const CHUNK_SIZE = 15;
  const baseTs = Date.now();

  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    const chunk = inputs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((input, idx) => {
      const globalIdx = i + idx;
      const prodId = sanitizeId(input.id || `prod_${baseTs}_${globalIdx}`, 'prod');
      const histId = sanitizeId(`hist_${baseTs}_${globalIdx}`, 'hist');
      const prodPayload = buildCreateSharedProductPayload(actorUid, prodId, input, shopId);
      const histPayload = buildCreateSharedHistoryPayload(
        actorUid,
        prodId,
        histId,
        prodPayload.currentPriceToman,
        prodPayload.customerQuoteToman,
        'ثبت گروهی از استعلام فایل متنی',
        0,
        undefined,
        undefined,
        shopId
      );

      batch.set(doc(db, 'shops', shopId, 'products', prodId), prodPayload);
      batch.set(doc(db, 'shops', shopId, 'products', prodId, 'history', histId), histPayload);

      const nowIso = new Date().toISOString();
      createdItems.push({
        id: prodId,
        name: prodPayload.name,
        category: prodPayload.category,
        sourceUrl: prodPayload.sourceUrl,
        imageUrl: prodPayload.imageUrl,
        currentPriceToman: prodPayload.currentPriceToman,
        lastPriceToman: prodPayload.lastPriceToman,
        marginPercent: prodPayload.marginPercent,
        customerQuoteToman: prodPayload.customerQuoteToman,
        stockStatus: prodPayload.stockStatus,
        warranty: prodPayload.warranty,
        lastRefreshedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        notes: prodPayload.notes,
        barcodes: prodPayload.barcodes,
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, productsPath);
    }
  }

  return createdItems;
}

export async function updateProductBarcodesInFirestore(
  actorUid: string,
  product: ProductItem,
  barcodes: string[],
  shopId = SHARED_SHOP_ID
): Promise<string[]> {
  const safeProdId = sanitizeId(product.id, 'prod');
  const path = `shops/${shopId}/products/${safeProdId}`;
  const normalizedBarcodes = normalizeBarcodeList(barcodes);

  try {
    await updateDoc(doc(db, 'shops', shopId, 'products', safeProdId), {
      barcodes: normalizedBarcodes,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  return normalizedBarcodes;
}

export async function updateProductMarginInFirestore(
  actorUid: string,
  product: ProductItem,
  newMarginPercent: number,
  shopId = SHARED_SHOP_ID
): Promise<void> {
  const safeProdId = sanitizeId(product.id, 'prod');
  const path = `shops/${shopId}/products/${safeProdId}`;
  const margin = normalizeMargin(newMarginPercent);
  const newQuote = calculateCustomerQuote(product.currentPriceToman, margin);

  try {
    await updateDoc(doc(db, 'shops', shopId, 'products', safeProdId), {
      marginPercent: margin,
      customerQuoteToman: newQuote,
      updatedBy: actorUid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function syncProductPriceInFirestore(
  actorUid: string,
  product: ProductItem,
  liveData: {
    name?: string;
    category?: string;
    priceToman: number;
    imageUrl?: string;
    stockStatus?: 'in_stock' | 'out_of_stock' | 'call';
    source?: string;
  },
  shopId = SHARED_SHOP_ID
): Promise<{ priceChanged: boolean; newPrice: number }> {
  const safeProdId = sanitizeId(product.id, 'prod');
  const path = `shops/${shopId}/products/${safeProdId}`;

  const oldPrice = product.currentPriceToman;
  const newPrice = toNumber(liveData.priceToman, oldPrice);
  const priceChanged = newPrice !== oldPrice && newPrice > 0;
  const effectivePrice = newPrice > 0 ? newPrice : oldPrice;
  const margin = normalizeMargin(product.marginPercent ?? 8);
  const newQuote = calculateCustomerQuote(effectivePrice, margin);

  const batch = writeBatch(db);
  batch.update(doc(db, 'shops', shopId, 'products', safeProdId), {
    name: clampStr(liveData.name || product.name, 500, product.name),
    category: clampStr(liveData.category || product.category, 120, product.category),
    imageUrl: clampStr(
      liveData.imageUrl && !product.imageUrl.includes('unsplash')
        ? product.imageUrl
        : product.imageUrl || liveData.imageUrl,
      2048,
      product.imageUrl
    ),
    currentPriceToman: effectivePrice,
    lastPriceToman: priceChanged ? oldPrice : effectivePrice,
    customerQuoteToman: newQuote,
    stockStatus:
      liveData.stockStatus === 'out_of_stock' || liveData.stockStatus === 'call'
        ? liveData.stockStatus
        : 'in_stock',
    updatedBy: actorUid,
    lastRefreshedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (priceChanged) {
    const changePercent =
      oldPrice > 0 ? Number((((effectivePrice - oldPrice) / oldPrice) * 100).toFixed(1)) : 0;
    const histId = sanitizeId(`hist_${Date.now()}_${Math.floor(Math.random() * 1000)}`, 'hist');
    batch.set(
      doc(db, 'shops', shopId, 'products', safeProdId, 'history', histId),
      buildCreateSharedHistoryPayload(
        actorUid,
        safeProdId,
        histId,
        effectivePrice,
        newQuote,
        liveData.source || 'بروزرسانی زنده دیجی‌کالا',
        changePercent,
        undefined,
        undefined,
        shopId
      )
    );
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  return { priceChanged, newPrice: effectivePrice };
}

export async function deleteProductFromFirestore(
  productId: string,
  shopId = SHARED_SHOP_ID
): Promise<void> {
  const safeProdId = sanitizeId(productId, 'prod');
  const path = `shops/${shopId}/products/${safeProdId}`;

  try {
    const histSnap = await getDocs(
      query(
        collection(db, 'shops', shopId, 'products', safeProdId, 'history'),
        where('shopId', '==', shopId),
        where('productId', '==', safeProdId)
      )
    );

    const batch = writeBatch(db);
    histSnap.docs.forEach((hDoc) => {
      batch.delete(hDoc.ref);
    });
    batch.delete(doc(db, 'shops', shopId, 'products', safeProdId));
    await batch.commit();
  } catch {
    try {
      await deleteDoc(doc(db, 'shops', shopId, 'products', safeProdId));
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.DELETE, path);
    }
  }
}

export async function fetchAllShopHistoriesFromFirestore(
  products: ProductItem[],
  shopId = SHARED_SHOP_ID
): Promise<Record<string, PriceHistoryItem[]>> {
  const histories: Record<string, PriceHistoryItem[]> = {};
  await Promise.all(
    products.map(async (prod) => {
      const safeProdId = sanitizeId(prod.id, 'prod');
      const path = `shops/${shopId}/products/${safeProdId}/history`;
      try {
        const snap = await getDocs(
          query(
            collection(db, 'shops', shopId, 'products', safeProdId, 'history'),
            where('shopId', '==', shopId),
            where('productId', '==', safeProdId)
          )
        );
        const entries = snap.docs.map((d) => mapDocToHistory(d.data()));
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        histories[prod.id] = entries;
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    })
  );
  return histories;
}

export async function applyBundleToFirestore(
  actorUid: string,
  bundle: {
    products: ProductItem[];
    histories?: Record<string, PriceHistoryItem[]>;
    deletedIds?: Record<string, string>;
  },
  mode: 'merge' | 'replace',
  shopId = SHARED_SHOP_ID
): Promise<void> {
  const productsPath = `shops/${shopId}/products`;
  const existingDocsMap = new Map<string, ProductItem>();

  try {
    const existingSnap = await getDocs(
      query(collection(db, 'shops', shopId, 'products'), where('shopId', '==', shopId))
    );
    existingSnap.docs.forEach((d) => {
      const mapped = mapDocToProduct(d.data());
      existingDocsMap.set(d.id, mapped);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, productsPath);
  }

  const incomingIds = new Set(bundle.products.map((p) => sanitizeId(p.id, 'prod')));

  // Delete removed or replaced items
  for (const existingId of existingDocsMap.keys()) {
    const shouldDelete =
      (mode === 'replace' && !incomingIds.has(existingId)) ||
      Boolean(bundle.deletedIds?.[existingId] && !incomingIds.has(existingId));
    if (shouldDelete) {
      await deleteProductFromFirestore(existingId, shopId);
    }
  }

  // Fetch existing histories for existing products so offline/Cloudflare price points aren't lost
  const existingHistoriesMap = new Map<string, PriceHistoryItem[]>();
  for (const item of bundle.products) {
    const safeProdId = sanitizeId(item.id || `prod_${Date.now()}`, 'prod');
    const incomingHist = bundle.histories?.[item.id] || bundle.histories?.[safeProdId] || [];
    if (existingDocsMap.has(safeProdId) && incomingHist.length > 0) {
      try {
        const hSnap = await getDocs(
          query(
            collection(db, 'shops', shopId, 'products', safeProdId, 'history'),
            where('shopId', '==', shopId),
            where('productId', '==', safeProdId)
          )
        );
        existingHistoriesMap.set(
          safeProdId,
          hSnap.docs.map((d) => mapDocToHistory(d.data()))
        );
      } catch {
        // Ignore single product history lookup failure
      }
    }
  }

  // Upsert products & missing history snapshots in safe batches
  const CHUNK_SIZE = 15;
  for (let i = 0; i < bundle.products.length; i += CHUNK_SIZE) {
    const chunk = bundle.products.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (let cIdx = 0; cIdx < chunk.length; cIdx++) {
      const item = chunk[cIdx];
      const safeProdId = sanitizeId(item.id || `prod_${Date.now()}_${i + cIdx}`, 'prod');
      const prodRef = doc(db, 'shops', shopId, 'products', safeProdId);
      const existing = existingDocsMap.get(safeProdId);

      const price = toNumber(item.currentPriceToman, 0);
      const lastPrice = toNumber(item.lastPriceToman, price);
      const margin = normalizeMargin(item.marginPercent ?? 8);
      const quote = toNumber(item.customerQuoteToman, calculateCustomerQuote(price, margin));
      const stockStatus: 'in_stock' | 'out_of_stock' | 'call' =
        item.stockStatus === 'out_of_stock' || item.stockStatus === 'call'
          ? item.stockStatus
          : 'in_stock';

      const itemHistory = bundle.histories?.[item.id] || bundle.histories?.[safeProdId] || [];

      if (existing) {
        const normalizedBarcodes = normalizeBarcodeList(item.barcodes);
        const existingBarcodes = normalizeBarcodeList(existing.barcodes);
        const nextName = clampStr(item.name, 500, existing.name);
        const nextCategory = clampStr(item.category, 120, existing.category);
        const nextSourceUrl = clampStr(item.sourceUrl, 2048, existing.sourceUrl);
        const nextImageUrl = clampStr(item.imageUrl, 2048, existing.imageUrl);
        const nextWarranty = clampStr(item.warranty, 200, '');
        const nextNotes = clampStr(item.notes, 1000, '');

        const hasProductChanges =
          existing.name !== nextName ||
          existing.category !== nextCategory ||
          existing.sourceUrl !== nextSourceUrl ||
          existing.imageUrl !== nextImageUrl ||
          existing.currentPriceToman !== price ||
          existing.lastPriceToman !== lastPrice ||
          existing.marginPercent !== margin ||
          existing.customerQuoteToman !== quote ||
          existing.stockStatus !== stockStatus ||
          existing.warranty !== nextWarranty ||
          existing.notes !== nextNotes ||
          JSON.stringify(existingBarcodes) !== JSON.stringify(normalizedBarcodes);

        if (hasProductChanges) {
          batch.update(prodRef, {
            updatedBy: actorUid,
            name: nextName,
            category: nextCategory,
            sourceUrl: nextSourceUrl,
            imageUrl: nextImageUrl,
            currentPriceToman: price,
            lastPriceToman: lastPrice,
            marginPercent: margin,
            customerQuoteToman: quote,
            stockStatus,
            warranty: nextWarranty,
            notes: nextNotes,
            ...(normalizedBarcodes.length > 0 || existingBarcodes.length > 0
              ? { barcodes: normalizedBarcodes }
              : {}),
            lastRefreshedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // Append any missing history snapshots recorded offline or on Cloudflare
        const existingEntries = existingHistoriesMap.get(safeProdId) || [];
        const missingEntries = itemHistory
          .slice(-20)
          .filter((h) => {
            const hMs = new Date(h.timestamp || 0).getTime();
            return !existingEntries.some(
              (eh) =>
                eh.priceToman === h.priceToman &&
                (Math.abs(new Date(eh.timestamp || 0).getTime() - hMs) < 120000 ||
                  (eh.jalaliDate === h.jalaliDate && eh.jalaliTime === h.jalaliTime))
            );
          });

        missingEntries.forEach((h, hIdx) => {
          const histId = sanitizeId(
            `hist_sync_${new Date(h.timestamp || Date.now()).getTime()}_${cIdx}_${hIdx}`,
            'hist'
          );
          batch.set(
            doc(db, 'shops', shopId, 'products', safeProdId, 'history', histId),
            buildCreateSharedHistoryPayload(
              actorUid,
              safeProdId,
              histId,
              toNumber(h.priceToman, price),
              toNumber(h.customerQuoteToman, quote),
              h.source || 'همگام‌سازی سابقه از کلادفلر/آفلاین',
              Number.isFinite(Number(h.changePercent)) ? Number(h.changePercent) : 0,
              h.jalaliDate,
              h.jalaliTime,
              shopId
            )
          );
        });
      } else {
        const prodPayload = buildCreateSharedProductPayload(
          actorUid,
          safeProdId,
          {
            ...item,
            marginPercent: margin,
            customerQuoteToman: quote,
            stockStatus,
          },
          shopId
        );
        batch.set(prodRef, prodPayload);

        if (itemHistory.length > 0) {
          itemHistory.slice(-20).forEach((h, idx) => {
            const histId = sanitizeId(
              `hist_${new Date(h.timestamp || Date.now()).getTime()}_${cIdx}_${idx}`,
              'hist'
            );
            batch.set(
              doc(db, 'shops', shopId, 'products', safeProdId, 'history', histId),
              buildCreateSharedHistoryPayload(
                actorUid,
                safeProdId,
                histId,
                toNumber(h.priceToman, price),
                toNumber(h.customerQuoteToman, quote),
                h.source || 'بازیابی از همگام‌سازی/بکاپ',
                Number.isFinite(Number(h.changePercent)) ? Number(h.changePercent) : 0,
                h.jalaliDate,
                h.jalaliTime,
                shopId
              )
            );
          });
        } else {
          const histId = sanitizeId(`hist_${Date.now()}_${i + cIdx}`, 'hist');
          batch.set(
            doc(db, 'shops', shopId, 'products', safeProdId, 'history', histId),
            buildCreateSharedHistoryPayload(
              actorUid,
              safeProdId,
              histId,
              price,
              quote,
              'ثبت از همگام‌سازی ابری / بکاپ',
              0,
              undefined,
              undefined,
              shopId
            )
          );
        }
      }
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, productsPath);
    }
  }
}
