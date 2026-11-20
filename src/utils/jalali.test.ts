import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
  toEnglishDigits,
  formatPersianNumber,
  cleanPersianText,
  isJalaliLeapYear,
  getJalaliMonthLength,
  jalaliToStartOfDayMs,
  jalaliToEndOfDayMs,
} from './jalali.ts';
import { filterAndSortProducts } from './productFilterSort.ts';
import type { ProductItem } from '../types.ts';

test('gregorianToJalali correctly converts Nowruz 2026', () => {
  // 2026-03-21 is 1 Farvardin 1405
  const j = gregorianToJalali(2026, 3, 21);
  assert.equal(j.jy, 1405);
  assert.equal(j.jm, 1);
  assert.equal(j.jd, 1);
});

test('jalaliToGregorian correctly converts 1405-01-01 back to Gregorian', () => {
  const g = jalaliToGregorian(1405, 1, 1);
  assert.equal(g.gy, 2026);
  assert.equal(g.gm, 3);
  assert.equal(g.gd, 21);
});

test('converts Persian digits accurately', () => {
  assert.equal(toPersianDigits(1234567890), '۱۲۳۴۵۶۷۸۹۰');
  assert.equal(toEnglishDigits('۱۲۳۴۵۶۷۸۹۰'), '1234567890');
});

test('formatPersianNumber formats with Persian separators', () => {
  assert.equal(formatPersianNumber(1000000), '۱٬۰۰۰٬۰۰۰');
  assert.equal(formatPersianNumber(25000), '۲۵٬۰۰۰');
});

test('cleanPersianText normalizes Arabic characters and half-spaces', () => {
  const input = 'علي  مي رود به كلاس ها';
  const output = cleanPersianText(input);
  // Ali should have Persian 'ی', 'می رود' should have half space, 'کلاس ها' should have half space
  assert.ok(output.includes('علی'));
  assert.ok(output.includes('کلاس'));
  assert.ok(output.includes('می\u200cرود'));
  assert.ok(output.includes('کلاس\u200cها'));
});

test('Jalali leap year and month length calculation works accurately', () => {
  assert.equal(isJalaliLeapYear(1403), true);
  assert.equal(isJalaliLeapYear(1404), false);
  assert.equal(getJalaliMonthLength(1403, 12), 30);
  assert.equal(getJalaliMonthLength(1404, 12), 29);
  assert.equal(getJalaliMonthLength(1405, 1), 31);
  assert.equal(getJalaliMonthLength(1405, 7), 30);
});

test('filterAndSortProducts handles price zero-at-end, date bounds 00:00:00..23:59:59, and dateless legacy items at end', () => {
  const makeProd = (overrides: Partial<ProductItem>): ProductItem => ({
    id: 'p',
    name: 'کالا',
    category: 'لوازم جانبی و گیمینگ',
    sourceUrl: '',
    imageUrl: '',
    currentPriceToman: 1000,
    lastPriceToman: 1000,
    marginPercent: 10,
    customerQuoteToman: 1100,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: '2026-10-15T10:00:00.000Z',
    createdAt: '2026-10-15T10:00:00.000Z',
    notes: '',
    ...overrides,
  });

  // 1405/08/20 => Gregorian 2026-11-11
  const gStart = jalaliToStartOfDayMs({ jy: 1405, jm: 8, jd: 20 });
  const gEnd = jalaliToEndOfDayMs({ jy: 1405, jm: 8, jd: 20 });

  const items: ProductItem[] = [
    makeProd({ id: 'zero_price', customerQuoteToman: 0, currentPriceToman: 0, createdAt: new Date(gStart + 3600_000).toISOString() }),
    makeProd({ id: 'cheap', customerQuoteToman: 500_000, createdAt: new Date(gStart + 7200_000).toISOString() }),
    makeProd({ id: 'expensive_late', customerQuoteToman: 5_000_000, createdAt: new Date(gEnd - 1000).toISOString() }),
    makeProd({ id: 'out_of_range', customerQuoteToman: 9_000_000, createdAt: new Date(gStart - 86_400_000).toISOString() }),
    makeProd({ id: 'no_date', customerQuoteToman: 2_000_000, createdAt: '' }),
  ];

  // Cheapest sort with no date filter: zero_price must be at the end
  const cheapestAll = filterAndSortProducts(items, {
    searchTerm: '',
    selectedCategory: 'all',
    fromDate: null,
    toDate: null,
    sortBy: 'price_asc',
  });
  assert.deepEqual(
    cheapestAll.map((p) => p.id),
    ['cheap', 'no_date', 'expensive_late', 'out_of_range', 'zero_price']
  );

  // Date filter for single day 1405/08/20: includes expensive_late (23:59:58.999) and keeps no_date at end
  const filteredDay = filterAndSortProducts(items, {
    searchTerm: '',
    selectedCategory: 'all',
    fromDate: { jy: 1405, jm: 8, jd: 20 },
    toDate: { jy: 1405, jm: 8, jd: 20 },
    sortBy: 'price_desc',
  });
  assert.deepEqual(
    filteredDay.map((p) => p.id),
    ['expensive_late', 'cheap', 'zero_price', 'no_date']
  );
});

