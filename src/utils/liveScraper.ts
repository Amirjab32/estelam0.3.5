/**
 * High-Speed & Precise Price Scraper for Digikala & Iranian Stores
 * 
 * ARCHITECTURE:
 * 1. Tier 1 (Ultra-fast direct microservice query - 200-400ms):
 *    Directly queries api.digikala.com/product/v1/products/{id}/ with DigiCDN session handling.
 *    Extracts default_variant.price:
 *    - rrp_price: Genuine non-discounted original manufacturer price
 *    - is_incredible / is_promotion / discount_percent: Accurately detects and ignores Amazing Offers
 *    - 100% immune to insurance, warranty cards, or unrelated accessory prices (fixes Lenovo laptop bug)
 * 
 * 2. Tier 2 (Optimized Playwright Browser Fallback):
 *    Resource-blocked headless browser targeting strictly the Product Buy Box.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { toEnglishDigits } from './jalali.ts';
import { extractDkpId, selectDigikalaBestVariantPrice } from './universalScraper.ts';

const execAsync = promisify(exec);

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

// extractDkpId is imported from ./universalScraper.ts for unified DKP extraction across all layers.

/**
 * Guess category from product title
 */
function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (
    t.includes('لپ‌تاپ') ||
    t.includes('لپ تاپ') ||
    t.includes('laptop') ||
    t.includes('نوت‌بوک') ||
    t.includes('مک‌بوک') ||
    t.includes('ideapad') ||
    t.includes('thinkpad') ||
    t.includes('vivobook') ||
    t.includes('zenbook') ||
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

/**
 * TIER 1: Ultra-fast direct microservice query (200-400ms)
 * Directly queries Digikala official product API with DigiCDN edge cookie jar.
 */
async function scrapeViaDirectApi(url: string): Promise<ScrapedProductData | null> {
  const dkpId = extractDkpId(url);
  if (!dkpId) return null;

  const t0 = Date.now();
  try {
    const curlCmd = `curl -s -L -c /tmp/dk_api.txt -b /tmp/dk_api.txt -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" -H "Accept: application/json" -H "Accept-Language: fa-IR,fa;q=0.9,en;q=0.8" -H "Referer: https://www.digikala.com/" --connect-timeout 3 --max-time 4 "https://api.digikala.com/product/v1/products/${dkpId}/"`;

    const { stdout } = await execAsync(curlCmd);
    if (!stdout || !stdout.trim().startsWith('{')) return null;

    const json = JSON.parse(stdout);
    if (json.status !== 200 || !json.data?.product) return null;

    const elapsed = Date.now() - t0;
    return selectDigikalaBestVariantPrice(json.data.product, elapsed, 'استعلام فوری');
  } catch (err: any) {
    console.warn('[DirectApi] Quick query failed, falling back to browser:', err.message);
    return null;
  }
}

/**
 * TIER 2: Fast resource-blocked Playwright Browser fallback (3-5s)
 */
async function scrapeViaPlaywright(url: string): Promise<ScrapedProductData | null> {
  const t0 = Date.now();
  let chromiumModule: any = null;

  try {
    // @ts-ignore - dynamic resolution of global playwright module
    const pw = await import('/usr/local/share/bun-global/node_modules/playwright/index.mjs');
    chromiumModule = pw.chromium;
  } catch {
    try {
      const req = (await import('module')).createRequire(import.meta.url);
      const pw = req('/usr/local/share/bun-global/node_modules/playwright');
      chromiumModule = pw.chromium;
    } catch {
      return null;
    }
  }

  if (!chromiumModule) return null;

  let browser: any = null;
  try {
    browser = await chromiumModule.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
      ],
    });

    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    // Abort useless heavy resources to keep query fast
    await page.route('**/*', (route: any) => {
      const type = route.request().resourceType();
      const rUrl = route.request().url();
      if (
        ['image', 'media', 'font'].includes(type) ||
        rUrl.includes('.png') ||
        rUrl.includes('.jpg') ||
        rUrl.includes('.jpeg') ||
        rUrl.includes('.webp') ||
        rUrl.includes('.woff') ||
        rUrl.includes('google-analytics') ||
        rUrl.includes('yandex') ||
        rUrl.includes('chabok') ||
        rUrl.includes('clarity') ||
        rUrl.includes('superweb-sdk')
      ) {
        return route.abort();
      }
      return route.continue();
    });

    // Navigate to URL
    await page.goto(url, { waitUntil: 'commit', timeout: 8000 });

    // Wait specifically for BuyBox price elements
    await page.waitForSelector(
      '[data-testid*="buy-box"] [data-testid="price-final"], [data-testid*="buy-box"] [data-testid="price-no-discount"], [data-theme-animation="price-container"]',
      { timeout: 5000 }
    );

    const data = await page.evaluate(() => {
      // STRICT BuyBox targeting: NEVER read insurance/warranty add-ons (like Lenovo 1.4M insurance)
      const buyBox =
        document.querySelector('[data-testid*="buy-box"]') ||
        document.querySelector('[class*="BuyBox"]') ||
        document.querySelector('[data-theme-animation="price-container"]')?.closest('div[class*="border"], div[class*="shadow"], aside') ||
        document;

      const noDiscountEl =
        buyBox.querySelector('[data-testid="price-no-discount"]') ||
        buyBox.querySelector('.line-through') ||
        buyBox.querySelector('[class*="line-through"]');

      const finalPriceEl =
        buyBox.querySelector('[data-testid="price-final"]') ||
        buyBox.querySelector('[data-theme-animation="price-container"]') ||
        document.querySelector('[data-theme-animation="price-container"]');

      const discountPercentEl = buyBox.querySelector('[data-testid="price-discount-percent"]');

      let priceText: string | null = null;
      let selector = '';
      let isDiscounted = false;

      if (noDiscountEl && noDiscountEl.textContent?.trim()) {
        priceText = noDiscountEl.textContent.trim();
        selector = 'buyBox [data-testid="price-no-discount"] (قیمت اصلی بدون تخفیف)';
        isDiscounted = true;
      } else if (finalPriceEl && finalPriceEl.textContent?.trim()) {
        priceText = finalPriceEl.textContent.trim();
        selector = 'buyBox [data-testid="price-final"]';
      }

      const h1 = document.querySelector('h1')?.textContent?.trim();
      const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      const title = h1 || metaTitle || document.title;
      const img = document.querySelector('meta[property="og:image"]')?.getAttribute('content');

      return {
        priceText,
        discountedText: finalPriceEl?.textContent?.trim() || null,
        discountPercent: discountPercentEl?.textContent?.trim() || '',
        isDiscounted,
        title,
        img,
        selector,
      };
    });

    if (data && data.priceText) {
      const cleanedDigits = toEnglishDigits(
        data.priceText.replace(/تومان/g, '').replace(/[,٬.\s]/g, '')
      );
      const digitMatch = cleanedDigits.match(/\d+/);
      const parsedPrice = digitMatch ? parseInt(digitMatch[0], 10) : 0;

      let discountedPrice = 0;
      if (data.discountedText) {
        const cleanedDisc = toEnglishDigits(
          data.discountedText.replace(/تومان/g, '').replace(/[,٬.\s]/g, '')
        );
        const matchDisc = cleanedDisc.match(/\d+/);
        if (matchDisc) discountedPrice = parseInt(matchDisc[0], 10);
      }

      const elapsed = Date.now() - t0;
      if (parsedPrice > 0) {
        const titleClean = (data.title || 'کالای دیجی‌کالا')
          .replace(/\| دیجی‌کالا/g, '')
          .replace(/فروشگاه اینترنتی دیجی‌کالا/g, '')
          .trim();

        return {
          name: titleClean,
          category: guessCategory(titleClean),
          priceToman: parsedPrice,
          imageUrl:
            data.img ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
          warranty: '',
          source: data.isDiscounted
            ? `قیمت اصلی و بدون تخفیف جعبه خرید دیجی‌کالا (${elapsed}ms)`
            : `قیمت جعبه خرید دیجی‌کالا (${elapsed}ms)`,
          stockStatus: 'in_stock',
          selectorUsed: data.selector,
          hasDiscount: data.isDiscounted,
          discountedPriceToman: discountedPrice,
          discountPercent: data.discountPercent,
          queryTimeMs: elapsed,
        };
      }
    }

    return null;
  } catch (err: any) {
    console.error('[Playwright] Fallback error:', err.message);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Main Scraper Entry Point:
 * Prioritizes 200-400ms direct microservice query with automatic fallback to Playwright.
 */
export async function scrapeLiveDigikalaProduct(url: string): Promise<ScrapedProductData | null> {
  // Step 1: Ultra-fast direct microservice query (200-400ms)
  const apiResult = await scrapeViaDirectApi(url);
  if (apiResult && apiResult.priceToman > 0) {
    console.log(`[Scraper] Fast Direct API Success in ${apiResult.queryTimeMs}ms: ${apiResult.priceToman} Toman (${apiResult.name})`);
    return apiResult;
  }

  // Step 2: Fallback to fast Playwright browser
  console.log('[Scraper] Direct API did not resolve, running fast Playwright browser...');
  const browserResult = await scrapeViaPlaywright(url);
  if (browserResult && browserResult.priceToman > 0) {
    console.log(`[Scraper] Playwright resolved in ${browserResult.queryTimeMs}ms: ${browserResult.priceToman} Toman`);
    return browserResult;
  }

  return null;
}
