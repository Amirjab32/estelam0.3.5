import { extractDkpId, isDigikalaUrlOrId } from './universalScraper.ts';
import { toEnglishDigits } from './jalali.ts';

export type BulkInquiryStatus = 'pending' | 'loading' | 'success' | 'error';

export interface BulkInquiryItem {
  id: string;
  url: string;
  dkpId: string | null;
  status: BulkInquiryStatus;
  productName: string;
  category?: string;
  imageUrl?: string;
  priceToman: number;
  stockStatus?: 'in_stock' | 'out_of_stock' | 'call';
  hasDiscount?: boolean;
  discountedPriceToman?: number;
  discountPercent?: string;
  errorMessage?: string;
  addedToShop?: boolean;
}

export interface ParsedBulkTxtResult {
  items: BulkInquiryItem[];
  totalNonEmptyLines: number;
  duplicateCount: number;
  invalidCount: number;
}

/**
 * Normalizes a single line from the uploaded .txt file into a clean clickable URL.
 */
function normalizeBulkLineToUrl(rawLine: string): { url: string; dkpId: string | null } {
  const trimmed = rawLine.trim();
  const englishLine = toEnglishDigits(trimmed);
  const dkpId = extractDkpId(englishLine);

  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed, dkpId };
  }

  if (/^(?:www\.)?digikala\.com\//i.test(englishLine)) {
    return { url: `https://${trimmed.replace(/^\/+/, '')}`, dkpId };
  }

  if (dkpId && isDigikalaUrlOrId(englishLine)) {
    return {
      url: `https://www.digikala.com/product/dkp-${dkpId}/`,
      dkpId,
    };
  }

  return { url: trimmed, dkpId: null };
}

/**
 * Parses a .txt file containing one Digikala product link per line.
 * - Ignores blank / whitespace-only lines
 * - Deduplicates identical URLs and identical Digikala DKP IDs (preserving first occurrence order)
 * - Marks non-Digikala / invalid lines as row-level error items without breaking the queue
 */
export function parseBulkDigikalaTxt(rawText: string): ParsedBulkTxtResult {
  const lines = rawText.split(/\r?\n/);
  const seenKeys = new Set<string>();
  const items: BulkInquiryItem[] = [];

  let totalNonEmptyLines = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    totalNonEmptyLines++;
    const { url, dkpId } = normalizeBulkLineToUrl(trimmed);
    const dedupKey = dkpId ? `dkp:${dkpId}` : `raw:${url.toLowerCase()}`;

    if (seenKeys.has(dedupKey)) {
      duplicateCount++;
      continue;
    }
    seenKeys.add(dedupKey);

    if (!dkpId) {
      invalidCount++;
      items.push({
        id: `bulk_invalid_${items.length}_${Date.now()}`,
        url,
        dkpId: null,
        status: 'error',
        productName: 'لینک نامعتبر دیجی‌کالا',
        priceToman: 0,
        errorMessage: 'شناسه کالای دیجی‌کالا (dkp) در این خط یافت نشد.',
      });
      continue;
    }

    items.push({
      id: `bulk_dkp_${dkpId}_${items.length}`,
      url,
      dkpId,
      status: 'pending',
      productName: `محصول دیجی‌کالا (dkp-${dkpId})`,
      priceToman: 0,
    });
  }

  return {
    items,
    totalNonEmptyLines,
    duplicateCount,
    invalidCount,
  };
}
