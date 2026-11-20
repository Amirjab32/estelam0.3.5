/**
 * Digikala HTML & Inspect Element Scraper Utilities
 * Prioritizes NON-DISCOUNTED original price ([data-testid="price-no-discount"])
 * over discounted price ([data-testid="price-final"]) as requested by user.
 */

import { toEnglishDigits, toPersianDigits } from './jalali.ts';

export interface ScrapedPriceResult {
  priceToman: number;
  formattedPersian: string;
  sourceType: 'data-testid-price-no-discount' | 'data-testid-price-final' | 'price-container' | 'raw-digits';
  rawText: string;
  isDiscountedOriginal?: boolean;
}

/**
 * Parses Digikala HTML snippet, full page HTML, or copied DevTools element
 * and extracts the price in Tomans.
 * CRITICAL: If a non-discounted original price exists, it is chosen first.
 */
export function extractPriceFromDigikalaInspect(input: string): ScrapedPriceResult | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // Pattern 0: NON-DISCOUNTED price: [data-testid="price-no-discount"] or line-through
  // e.g. <span data-testid="price-no-discount">۲,۳۵۰,۰۰۰</span> or with nested div
  const priceNoDiscountPattern = /data-testid=["']price-no-discount["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i;
  const match0 = trimmed.match(priceNoDiscountPattern);
  if (match0) {
    const numMatch = match0[1].match(/([۰-۹0-9,٬]+)/);
    if (numMatch) {
      const raw = numMatch[1];
      const cleaned = toEnglishDigits(raw.replace(/[,٬\s]/g, ''));
      const val = parseInt(cleaned, 10);
      if (!isNaN(val) && val > 0) {
        return {
          priceToman: val,
          formattedPersian: `${toPersianDigits(raw.replace(/,/g, '٬'))} تومان`,
          sourceType: 'data-testid-price-no-discount',
          rawText: raw,
          isDiscountedOriginal: true,
        };
      }
    }
  }

  // Pattern 0.5: Line-through price snippet (e.g. <div class="...line-through...">۲,۳۵۰,۰۰۰</div>)
  const lineThroughPattern = /class=["'][^"']*line-through[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|del|s)>/i;
  const matchLT = trimmed.match(lineThroughPattern);
  if (matchLT) {
    const numMatch = matchLT[1].match(/([۰-۹0-9,٬]+)/);
    if (numMatch) {
      const raw = numMatch[1];
      const cleaned = toEnglishDigits(raw.replace(/[,٬\s]/g, ''));
      const val = parseInt(cleaned, 10);
      if (!isNaN(val) && val > 0) {
        return {
          priceToman: val,
          formattedPersian: `${toPersianDigits(raw.replace(/,/g, '٬'))} تومان`,
          sourceType: 'data-testid-price-no-discount',
          rawText: raw,
          isDiscountedOriginal: true,
        };
      }
    }
  }

  // Pattern 1: Exact selector: <span class="..." data-testid="price-final"><div>۴,۱۶۵,۰۰۰</div></span>
  const priceFinalWithDiv = /data-testid=["']price-final["'][^>]*>\s*<div[^>]*>\s*([۰-۹0-9,٬.]+)\s*<\/div>/i;
  const match1 = trimmed.match(priceFinalWithDiv);
  if (match1) {
    const raw = match1[1];
    const cleaned = toEnglishDigits(raw.replace(/[,٬.\s]/g, ''));
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) {
      return {
        priceToman: val,
        formattedPersian: `${toPersianDigits(raw.replace(/,/g, '٬'))} تومان`,
        sourceType: 'data-testid-price-final',
        rawText: raw,
      };
    }
  }

  // Pattern 2: data-testid="price-final" directly wrapping text or other tags
  const priceFinalGeneric = /data-testid=["']price-final["'][^>]*>([\s\S]*?)<\/span>/i;
  const match2 = trimmed.match(priceFinalGeneric);
  if (match2) {
    const numMatch = match2[1].match(/([۰-۹0-9,٬]+)/);
    if (numMatch) {
      const raw = numMatch[1];
      const cleaned = toEnglishDigits(raw.replace(/[,٬\s]/g, ''));
      const val = parseInt(cleaned, 10);
      if (!isNaN(val) && val > 0) {
        return {
          priceToman: val,
          formattedPersian: `${toPersianDigits(raw.replace(/,/g, '٬'))} تومان`,
          sourceType: 'data-testid-price-final',
          rawText: raw,
        };
      }
    }
  }

  // Pattern 3: data-theme-animation="price-container"
  const containerPattern = /data-theme-animation=["']price-container["'][\s\S]*?<div>\s*([۰-۹0-9,٬]+)\s*<\/div>/i;
  const match3 = trimmed.match(containerPattern);
  if (match3) {
    const raw = match3[1];
    const cleaned = toEnglishDigits(raw.replace(/[,٬\s]/g, ''));
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val > 0) {
      return {
        priceToman: val,
        formattedPersian: `${toPersianDigits(raw.replace(/,/g, '٬'))} تومان`,
        sourceType: 'price-container',
        rawText: raw,
      };
    }
  }

  // Pattern 4: Raw Persian or English price string (e.g. user pasted just "۴,۱۶۵,۰۰۰" or "4,165,000")
  const rawNumPattern = /^[۰-۹0-9,٬\s]+$/;
  if (rawNumPattern.test(trimmed)) {
    const cleaned = toEnglishDigits(trimmed.replace(/[,٬\s]/g, ''));
    const val = parseInt(cleaned, 10);
    if (!isNaN(val) && val >= 1000) {
      return {
        priceToman: val,
        formattedPersian: `${toPersianDigits(trimmed.replace(/,/g, '٬'))} تومان`,
        sourceType: 'raw-digits',
        rawText: trimmed,
      };
    }
  }

  return null;
}
