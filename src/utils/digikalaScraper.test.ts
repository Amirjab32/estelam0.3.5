import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPriceFromDigikalaInspect } from './digikalaScraper.ts';
import {
  extractDkpId,
  formatCookieJar,
  isDigikalaUrlOrId,
  mergeSetCookiesIntoJar,
  scrapeDigikalaDetailed,
  selectDigikalaBestVariantPrice,
} from './universalScraper.ts';

test('extractPriceFromDigikalaInspect parses exact DevTools snippet from user image', () => {
  // Exact snippet from screenshot:
  const snippet = `<div class="flex flex-row items-center" data-theme-animation="price-container">
  <span class="ml-1 text-neutral-800" data-testid="price-final">
    <div>۴,۱۶۵,۰۰۰</div>
  </span>
  <dds-icon name="value-toman" color="content/1" aria-hidden="true" style="font-size: 14px;"></dds-icon>
</div>`;

  const result = extractPriceFromDigikalaInspect(snippet);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
  assert.equal(result?.sourceType, 'data-testid-price-final');
});

test('extractPriceFromDigikalaInspect parses span with data-testid="price-final"', () => {
  const span = `<span class="ml-1 text-neutral-800" data-testid="price-final"><div>۴,۱۶۵,۰۰۰</div></span>`;
  const result = extractPriceFromDigikalaInspect(span);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});

test('extractPriceFromDigikalaInspect parses raw pasted Persian digits with commas', () => {
  const raw = '۴,۱۶۵,۰۰۰';
  const result = extractPriceFromDigikalaInspect(raw);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});

test('extractPriceFromDigikalaInspect parses English digits with commas', () => {
  const raw = '4,165,000';
  const result = extractPriceFromDigikalaInspect(raw);
  assert.notEqual(result, null);
  assert.equal(result?.priceToman, 4165000);
});

test('selectDigikalaBestVariantPrice picks lowest non-discounted same-color seller price (MacBook DKP-21723566)', () => {
  const mockProduct = {
    title_fa: 'لپ‌تاپ اپل مدل MacBook Air MDHE4 2026 LLA',
    category: { title_fa: 'لپ تاپ و الترابوک' },
    default_variant: {
      id: 84388591,
      status: 'marketable',
      color: { id: 22, title: 'سرمه‌ای' },
      seller: { title: 'دیجی‌کالا' },
      price: {
        rrp_price: 3657553000,
        selling_price: 3474676000,
        discount_percent: 5,
        is_promotion: true,
      },
    },
    variants: [
      {
        id: 84388591,
        status: 'marketable',
        color: { id: 22, title: 'سرمه‌ای' },
        seller: { title: 'دیجی‌کالا' },
        price: {
          rrp_price: 3657553000,
          selling_price: 3474676000,
          discount_percent: 5,
          is_promotion: true,
        },
      },
      {
        id: 78848253,
        status: 'marketable',
        color: { id: 22, title: 'سرمه‌ای' },
        seller: { title: 'تامین کالای آرتین همتا' },
        price: {
          rrp_price: 3471676000,
          selling_price: 3471676000,
          discount_percent: 0,
          marketable_stock: 1,
        },
      },
      {
        id: 99999999,
        status: 'marketable',
        color: { id: 1, title: 'مشکی' },
        seller: { title: 'فروشنده رنگ دیگر' },
        price: {
          rrp_price: 3000000000,
          selling_price: 3000000000,
          discount_percent: 0,
          marketable_stock: 2,
        },
      },
    ],
  };

  const res = selectDigikalaBestVariantPrice(mockProduct, 120);
  assert.equal(res.priceToman, 347167600);
  assert.equal(res.stockStatus, 'in_stock');
  assert.equal(res.hasDiscount, false);
  assert.ok(res.source.includes('تامین کالای آرتین همتا'));
});

test('selectDigikalaBestVariantPrice ignores single-seller promo discount and treats omitted marketable_stock as in_stock', () => {
  const mockPromoProduct = {
    title_fa: 'ماوس بی سیم گیمینگ مدل T2',
    default_variant: {
      id: 73538348,
      status: 'marketable',
      color: { id: 1, title: 'مشکی' },
      seller: { title: 'شیک سنتر' },
      price: {
        rrp_price: 23500000,
        selling_price: 16230000,
        discount_percent: 31,
        is_promotion: true,
      },
    },
    variants: [
      {
        id: 73538348,
        status: 'marketable',
        color: { id: 1, title: 'مشکی' },
        seller: { title: 'شیک سنتر' },
        price: {
          rrp_price: 23500000,
          selling_price: 16230000,
          discount_percent: 31,
          is_promotion: true,
        },
      },
    ],
  };

  const res = selectDigikalaBestVariantPrice(mockPromoProduct, 80);
  assert.equal(res.priceToman, 2350000);
  assert.equal(res.stockStatus, 'in_stock');
  assert.equal(res.hasDiscount, true);
});

test('extractDkpId handles standard URLs, uppercase DKP, Persian digits, percent-encoding, and query params', () => {
  assert.equal(
    extractDkpId('https://www.digikala.com/product/dkp-18991772/laptop-lenovo/'),
    '18991772'
  );
  assert.equal(
    extractDkpId('https://www.digikala.com/product/DKP-۲۰۷۱۷۲۲۸/?utm_source=share'),
    '20717228'
  );
  assert.equal(
    extractDkpId('https://www.digikala.com/product/dkp%2D4820194/samsung-ssd/'),
    '4820194'
  );
  assert.equal(extractDkpId('https://www.digikala.com/product/12345678/'), '12345678');
  assert.equal(extractDkpId('https://www.digikala.com/?product_id=9302148'), '9302148');
  assert.equal(extractDkpId('۱۸۹۹۱۷۷۲'), '18991772');
  assert.equal(extractDkpId('https://example.com/no-id'), null);
  assert.equal(isDigikalaUrlOrId('DKP-۱۸۹۹۱۷۷۲'), true);
});

test('mergeSetCookiesIntoJar accumulates cookies without breaking on Expires commas', () => {
  const jar = new Map<string, string>();
  jar.set('existing', 'abc');

  const headers = new Headers();
  headers.append(
    'set-cookie',
    'digicdn_cookie=fresh123; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT, session_id=xyz987; HttpOnly'
  );
  mergeSetCookiesIntoJar(jar, headers);

  assert.equal(jar.get('existing'), 'abc');
  assert.equal(jar.get('digicdn_cookie'), 'fresh123');
  assert.equal(jar.get('session_id'), 'xyz987');
  assert.equal(
    formatCookieJar(jar),
    'existing=abc; digicdn_cookie=fresh123; session_id=xyz987'
  );
});

test('scrapeDigikalaDetailed recovers on first call after 307 challenge + 403 transient failure', async () => {
  const originalFetch = globalThis.fetch;
  const seenCookies: string[] = [];
  let callIndex = 0;

  globalThis.fetch = (async (_input: any, init?: RequestInit) => {
    callIndex++;
    const hdrs = (init?.headers || {}) as Record<string, string>;
    seenCookies.push(hdrs['Cookie'] || '');

    // Call 1: DigiCDN 307 challenge setting cookie
    if (callIndex === 1) {
      return new Response(null, {
        status: 307,
        headers: {
          location: 'https://api.digikala.com/product/v1/products/20717228/',
          'set-cookie': 'digicdn_cookie=challenge_token_1; Path=/',
        },
      });
    }

    // Call 2: Transient 403 on v1 even with cookie
    if (callIndex === 2) {
      return new Response('<html>blocked</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      });
    }

    // Call 3: Fallback to v2 succeeds cleanly with JSON
    return new Response(
      JSON.stringify({
        status: 200,
        data: {
          product: {
            title_fa: 'ماوس گیمینگ تست',
            default_variant: {
              id: 1,
              status: 'marketable',
              seller: { title: 'دیجی‌کالا' },
              price: { rrp_price: 23500000, selling_price: 23500000, discount_percent: 0 },
            },
            variants: [],
          },
        },
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  }) as typeof fetch;

  try {
    const res = await scrapeDigikalaDetailed('https://www.digikala.com/product/dkp-20717228/', {
      maxRounds: 2,
      perRequestTimeoutMs: 2000,
    });
    assert.notEqual(res.data, null);
    assert.equal(res.data?.priceToman, 2350000);
    assert.equal(res.lastStatus, 200);
    assert.equal(seenCookies[1], 'digicdn_cookie=challenge_token_1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

