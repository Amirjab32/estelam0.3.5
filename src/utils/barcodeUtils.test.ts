import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBarcodeInquiryScan,
  findBarcodeConflicts,
  findProductByBarcode,
  isLinearBarcodeFormat,
  mapKeyEventToAsciiChar,
  MAX_BARCODES_PER_PRODUCT,
  NATIVE_1D_DETECTOR_FORMATS,
  normalizeBarcodeInput,
  normalizeBarcodeList,
} from './barcodeUtils.ts';
import type { ProductItem } from '../types.ts';

function makeProduct(id: string, name: string, barcodes?: string[]): ProductItem {
  return {
    id,
    name,
    category: 'لوازم جانبی و قطعات',
    sourceUrl: '',
    imageUrl: '',
    currentPriceToman: 1000000,
    lastPriceToman: 1000000,
    marginPercent: 10,
    customerQuoteToman: 1100000,
    stockStatus: 'in_stock',
    warranty: '',
    lastRefreshedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: '',
    barcodes,
  };
}

test('normalizeBarcodeInput converts Persian and Arabic digits and trims control/whitespace chars', () => {
  assert.equal(normalizeBarcodeInput(' ۶۲۶۱۱۴۹۱۰۱۱۶۹ \r\n'), '6261149101169');
  assert.equal(normalizeBarcodeInput('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeBarcodeInput('  ean-13\u200c-001 '), 'EAN-13-001');
});

test('normalizeBarcodeInput converts Windows Persian keyboard layout letters to English ASCII', () => {
  // ق -> R, ش -> A, س -> S, ۱ -> 1, ۲ -> 2, ۳ -> 3
  assert.equal(normalizeBarcodeInput('قشس۱۲۳'), 'RAS123');
  // ف -> T, ی -> D, گ -> '
  assert.equal(normalizeBarcodeInput('فی-۹۹'), 'TD-99');
});

test('mapKeyEventToAsciiChar uses physical KeyboardEvent.code even when e.key is Persian', () => {
  assert.equal(mapKeyEventToAsciiChar({ key: 'ض', code: 'KeyQ' }), 'Q');
  assert.equal(mapKeyEventToAsciiChar({ key: '۵', code: 'Digit5' }), '5');
  assert.equal(mapKeyEventToAsciiChar({ key: '۹', code: 'Numpad9' }), '9');
  assert.equal(mapKeyEventToAsciiChar({ key: '-', code: 'Minus' }), '-');
  assert.equal(mapKeyEventToAsciiChar({ key: '_', code: 'Minus', shiftKey: true }), '_');
});

test('normalizeBarcodeList deduplicates, normalizes, and enforces max limit', () => {
  const list = normalizeBarcodeList([' ۶۲۶۱ ', '6261', 'abc-1', 'ABC-1', '', '   ']);
  assert.deepEqual(list, ['6261', 'ABC-1']);

  const oversized = Array.from({ length: 30 }, (_, i) => `CODE-${i}`);
  assert.equal(normalizeBarcodeList(oversized).length, MAX_BARCODES_PER_PRODUCT);
});

test('findProductByBarcode and findBarcodeConflicts work across normalized Persian/ASCII codes', () => {
  const p1 = makeProduct('p1', 'ماوس گیمینگ', ['6261149101169', 'SHOP-A1']);
  const p2 = makeProduct('p2', 'کیبورد مکانیکی', ['4711085930125']);
  const products = [p1, p2];

  const found = findProductByBarcode(products, '۶۲۶۱۱۴۹۱۰۱۱۶۹');
  assert.equal(found?.product.id, 'p1');
  assert.equal(found?.matchedBarcode, '6261149101169');

  assert.equal(findProductByBarcode(products, '999999999'), null);

  // Conflict check excluding p2 should report p1 for SHOP-A1, and NOT report p2 for its own barcode
  const conflicts = findBarcodeConflicts(products, ['shop-a1', '4711085930125'], 'p2');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].barcode, 'SHOP-A1');
  assert.equal(conflicts[0].ownerProduct.id, 'p1');
});

test('applyBarcodeInquiryScan collapses consecutive duplicates without multiplying quantity and preserves interleaved comparison scans', () => {
  type Row = { entryId: string; productId: string; quantity: number };
  let tray: Row[] = [];

  // Scan A 3 times in a row -> 1 row for A with quantity 1
  let res = applyBarcodeInquiryScan(tray, { entryId: 'e1', productId: 'A', quantity: 1 });
  assert.equal(res.isConsecutiveDuplicate, false);
  tray = res.nextTray;

  res = applyBarcodeInquiryScan(tray, { entryId: 'e1', productId: 'A', quantity: 1 });
  assert.equal(res.isConsecutiveDuplicate, true);
  tray = res.nextTray;

  res = applyBarcodeInquiryScan(tray, { entryId: 'e1', productId: 'A', quantity: 1 });
  assert.equal(res.isConsecutiveDuplicate, true);
  tray = res.nextTray;
  assert.deepEqual(
    tray.map((r) => ({ id: r.productId, qty: r.quantity })),
    [{ id: 'A', qty: 1 }]
  );

  // Scan B 4 times in a row -> B above A, both quantity 1
  for (let i = 0; i < 4; i++) {
    res = applyBarcodeInquiryScan(tray, { entryId: 'e2', productId: 'B', quantity: 1 });
    assert.equal(res.isConsecutiveDuplicate, i > 0);
    tray = res.nextTray;
  }
  assert.deepEqual(
    tray.map((r) => ({ id: r.productId, qty: r.quantity })),
    [
      { id: 'B', qty: 1 },
      { id: 'A', qty: 1 },
    ]
  );

  // Scan A again after B -> A appears both above B and below B, all with quantity 1
  res = applyBarcodeInquiryScan(tray, { entryId: 'e3', productId: 'A', quantity: 1 });
  assert.equal(res.isConsecutiveDuplicate, false);
  tray = res.nextTray;
  assert.deepEqual(
    tray.map((r) => ({ id: r.productId, qty: r.quantity })),
    [
      { id: 'A', qty: 1 },
      { id: 'B', qty: 1 },
      { id: 'A', qty: 1 },
    ]
  );
});

test('1D linear format guard accepts standard 1D barcodes and rejects QR/2D codes', () => {
  for (const fmt of ['EAN-13', 'EAN13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code 128', 'Code39', 'ITF', 'Codabar']) {
    assert.equal(isLinearBarcodeFormat(fmt), true, `Expected ${fmt} to be allowed`);
  }
  for (const fmt of ['QRCode', 'QR Code', 'qr_code', 'MicroQRCode', 'RMQRCode', 'DataMatrix', 'data_matrix', 'Aztec', 'PDF417', 'MaxiCode']) {
    assert.equal(isLinearBarcodeFormat(fmt), false, `Expected ${fmt} to be rejected`);
  }
  for (const nativeFmt of NATIVE_1D_DETECTOR_FORMATS) {
    assert.equal(isLinearBarcodeFormat(nativeFmt), true);
  }
  assert.equal((NATIVE_1D_DETECTOR_FORMATS as readonly string[]).includes('qr_code'), false);
  assert.equal((NATIVE_1D_DETECTOR_FORMATS as readonly string[]).includes('data_matrix'), false);
});


