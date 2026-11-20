import { ProductItem } from '../types.ts';
import { normalizeBarcodeInput } from './barcodeUtils.ts';
import {
  JalaliDate,
  jalaliToEndOfDayMs,
  jalaliToStartOfDayMs,
} from './jalali.ts';

export type ProductSortOption = 'newest' | 'oldest' | 'price_desc' | 'price_asc';

export interface ProductFilterSortOptions {
  searchTerm: string;
  selectedCategory: string;
  fromDate: JalaliDate | null;
  toDate: JalaliDate | null;
  sortBy: ProductSortOption;
}

/**
 * Parses a product's createdAt timestamp into epoch milliseconds,
 * returning null when missing or invalid so dateless legacy records
 * can be handled explicitly.
 */
export function getValidCreatedAtMs(createdAt?: string | null): number | null {
  if (typeof createdAt !== 'string') return null;
  const trimmed = createdAt.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Returns the product's effective shop selling price in Tomans.
 * Matches ProductCard display: prefers customerQuoteToman, falls back to currentPriceToman
 * only if quote is absent; returns 0 when price is zero or unknown.
 */
export function getEffectiveSellingPrice(product: ProductItem): number {
  const quote = Number(product.customerQuoteToman);
  if (Number.isFinite(quote) && quote > 0) return quote;

  const refPrice = Number(product.currentPriceToman);
  if (Number.isFinite(refPrice) && refPrice > 0) return refPrice;

  return 0;
}

/**
 * Filters products simultaneously by search text/barcode, category, and Jalali date range,
 * then sorts according to the active sort criterion while keeping zero/unknown prices
 * and dateless legacy items at the end of the list.
 */
export function filterAndSortProducts(
  products: ProductItem[],
  options: ProductFilterSortOptions
): ProductItem[] {
  const { searchTerm, selectedCategory, fromDate, toDate, sortBy } = options;

  const lowerSearch = searchTerm.trim().toLowerCase();
  const normalizedSearchBarcode = normalizeBarcodeInput(searchTerm);

  let fromMs = fromDate ? jalaliToStartOfDayMs(fromDate) : null;
  let toMs = toDate ? jalaliToEndOfDayMs(toDate) : null;

  // Guard against inverted date range if both bounds are provided
  if (fromMs !== null && toMs !== null && fromMs > toMs && fromDate && toDate) {
    fromMs = jalaliToStartOfDayMs(toDate);
    toMs = jalaliToEndOfDayMs(fromDate);
  }

  const isDateFilterActive = fromMs !== null || toMs !== null;

  const filtered = products.filter((prod) => {
    const matchSearch =
      !lowerSearch ||
      prod.name.toLowerCase().includes(lowerSearch) ||
      prod.category.toLowerCase().includes(lowerSearch) ||
      (normalizedSearchBarcode.length > 0 &&
        (prod.barcodes || []).some((b) => b.includes(normalizedSearchBarcode)));

    if (!matchSearch) return false;

    const matchCat = selectedCategory === 'all' || prod.category === selectedCategory;
    if (!matchCat) return false;

    if (isDateFilterActive) {
      const createdMs = getValidCreatedAtMs(prod.createdAt);
      // Legacy products without a valid creation date always remain in the list (sorted to end)
      if (createdMs === null) return true;
      if (fromMs !== null && createdMs < fromMs) return false;
      if (toMs !== null && createdMs > toMs) return false;
    }

    return true;
  });

  const sorted = [...filtered];

  sorted.sort((a, b) => {
    const aDate = getValidCreatedAtMs(a.createdAt);
    const bDate = getValidCreatedAtMs(b.createdAt);

    // When a date filter is active, dateless legacy products always stay at the end
    if (isDateFilterActive) {
      if (aDate === null && bDate !== null) return 1;
      if (bDate === null && aDate !== null) return -1;
    }

    if (sortBy === 'newest' || sortBy === 'oldest') {
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return sortBy === 'newest' ? bDate - aDate : aDate - bDate;
    }

    // Price sorting ('price_desc' | 'price_asc') based on final shop selling price
    const aPrice = getEffectiveSellingPrice(a);
    const bPrice = getEffectiveSellingPrice(b);
    const aHasPrice = aPrice > 0;
    const bHasPrice = bPrice > 0;

    // Products with zero or unknown prices are always placed at the end
    if (!aHasPrice && !bHasPrice) {
      if (aDate === null && bDate === null) return 0;
      if (aDate === null) return 1;
      if (bDate === null) return -1;
      return bDate - aDate;
    }
    if (!aHasPrice) return 1;
    if (!bHasPrice) return -1;

    if (aPrice !== bPrice) {
      return sortBy === 'price_desc' ? bPrice - aPrice : aPrice - bPrice;
    }

    // Deterministic tie-breaker: newer item first
    if (aDate !== null && bDate !== null && aDate !== bDate) {
      return bDate - aDate;
    }
    if (aDate === null && bDate !== null) return 1;
    if (bDate === null && aDate !== null) return -1;
    return 0;
  });

  return sorted;
}
