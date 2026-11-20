import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNextScheduledRefresh,
  calculateCustomerPrice,
  extractDigikalaProductCode,
  FIXED_SCHEDULE_HOURS,
} from './schedule.ts';

test('FIXED_SCHEDULE_HOURS contains expected 8 3-hour points', () => {
  assert.deepEqual(FIXED_SCHEDULE_HOURS, [0, 3, 6, 9, 12, 15, 18, 21]);
});

test('getNextScheduledRefresh finds next hour in same day', () => {
  // Simulate 10:15 AM -> next should be 12:00
  const d = new Date(2026, 9, 15, 10, 15, 0);
  const next = getNextScheduledRefresh(d);
  assert.equal(next.targetHour, 12);
  assert.equal(next.remainingMinutes, 105);
});

test('getNextScheduledRefresh rolls over to 00:00 next day if after 21:00', () => {
  // Simulate 22:30 -> next should be 00:00 next day
  const d = new Date(2026, 9, 15, 22, 30, 0);
  const next = getNextScheduledRefresh(d);
  assert.equal(next.targetHour, 0);
  assert.equal(next.targetDate.getDate(), 16);
});

test('calculateCustomerPrice applies margin and rounds to nearest 1,000 Toman', () => {
  // 1,000,000 Toman with 10% margin -> 1,100,000
  const res = calculateCustomerPrice(1000000, 10);
  assert.equal(res.customerPrice, 1100000);
  assert.equal(res.marginAmount, 100000);
  assert.equal(res.roundedCustomerPrice, 1100000);

  // 2,350,000 Toman with 8% margin -> 2,538,000 (nearest 1,000, not 5,000)
  const res2 = calculateCustomerPrice(2350000, 8);
  assert.equal(res2.roundedCustomerPrice, 2538000);
});

test('extractDigikalaProductCode extracts DKP id from various url patterns', () => {
  const url1 = 'https://www.digikala.com/product/dkp-1234567/logitech-g502-mouse/';
  assert.equal(extractDigikalaProductCode(url1), '1234567');

  const url2 = 'https://digikala.com/product/dkp/9876543';
  assert.equal(extractDigikalaProductCode(url2), '9876543');

  const url3 = 'https://random-store.ir/product/123';
  assert.equal(extractDigikalaProductCode(url3), null);
});
