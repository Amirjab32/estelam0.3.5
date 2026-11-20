import type { ProductItem } from '../types.ts';

export const MAX_BARCODES_PER_PRODUCT = 20;
export const MAX_BARCODE_LENGTH = 120;

const PERSIAN_TO_ASCII_MAP: Record<string, string> = {
  // Top row (Q..P, [, ])
  'ض': 'Q',
  'ص': 'W',
  'ث': 'E',
  'ق': 'R',
  'ف': 'T',
  'غ': 'Y',
  'ع': 'U',
  'ه': 'I',
  'خ': 'O',
  'ح': 'P',
  'ج': '[',
  'چ': ']',
  // Home row (A..L, ;, ')
  'ش': 'A',
  'س': 'S',
  'ی': 'D',
  'ي': 'D',
  'ب': 'F',
  'ل': 'G',
  'ا': 'H',
  'آ': 'H',
  'ت': 'J',
  'ن': 'K',
  'م': 'L',
  'ک': ';',
  'ك': ';',
  'گ': "'",
  // Bottom row (Z..M)
  'ظ': 'Z',
  'ط': 'X',
  'ز': 'C',
  'ژ': 'C',
  'ر': 'V',
  'ذ': 'B',
  'د': 'N',
  'پ': 'M',
  'ئ': 'M',
  'ء': 'M',
  'و': ',',
  '؟': '?',
};

/**
 * Converts Persian/Arabic digits and Windows Persian keyboard layout characters
 * into clean uppercase ASCII barcode tokens.
 */
export function normalizeBarcodeInput(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw);
  let out = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);

    // Strip whitespace, ZWNJ, directional marks, and control characters
    if (
      code <= 32 ||
      (code >= 0x200b && code <= 0x200f) ||
      (code >= 0x202a && code <= 0x202e) ||
      code === 0xfeff
    ) {
      continue;
    }

    // Persian digits (۰-۹)
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String(code - 0x06f0);
      continue;
    }

    // Arabic-Indic digits (٠-٩)
    if (code >= 0x0660 && code <= 0x0669) {
      out += String(code - 0x0660);
      continue;
    }

    // Persian QWERTY layout mapping
    if (PERSIAN_TO_ASCII_MAP[ch]) {
      out += PERSIAN_TO_ASCII_MAP[ch];
      continue;
    }

    // Printable ASCII (uppercase letters for consistent matching)
    if (code >= 33 && code <= 126) {
      out += ch.toUpperCase();
    }
  }

  return out.slice(0, MAX_BARCODE_LENGTH);
}

/**
 * Normalizes a candidate list (or delimited string) of barcodes for a product,
 * removing empties and duplicates while preserving order and capping at MAX_BARCODES_PER_PRODUCT.
 */
export function normalizeBarcodeList(rawList: unknown): string[] {
  let items: unknown[] = [];
  if (Array.isArray(rawList)) {
    items = rawList;
  } else if (typeof rawList === 'string') {
    items = rawList.split(/[\n,;]+/);
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = normalizeBarcodeInput(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= MAX_BARCODES_PER_PRODUCT) break;
  }

  return result;
}

const CODE_TO_ASCII: Record<string, { normal: string; shift?: string }> = {
  Minus: { normal: '-', shift: '_' },
  Equal: { normal: '=', shift: '+' },
  BracketLeft: { normal: '[', shift: '{' },
  BracketRight: { normal: ']', shift: '}' },
  Backslash: { normal: '\\', shift: '|' },
  Semicolon: { normal: ';', shift: ':' },
  Quote: { normal: "'", shift: '"' },
  Comma: { normal: ',', shift: '<' },
  Period: { normal: '.', shift: '>' },
  Slash: { normal: '/', shift: '?' },
  NumpadAdd: { normal: '+' },
  NumpadSubtract: { normal: '-' },
  NumpadMultiply: { normal: '*' },
  NumpadDivide: { normal: '/' },
  NumpadDecimal: { normal: '.' },
};

/**
 * Resolves a hardware USB/Bluetooth HID scanner KeyboardEvent to an uppercase ASCII character
 * using physical KeyboardEvent.code first so active Windows Persian (FA) IME layout
 * never corrupts scanned barcodes.
 */
export function mapKeyEventToAsciiChar(e: {
  key: string;
  code?: string;
  shiftKey?: boolean;
}): string | null {
  const code = e.code || '';

  if (/^Digit([0-9])$/.test(code)) {
    const digit = code.slice(5);
    if (!e.shiftKey) return digit;
    const shifted = ')!@#$%^&*('[Number(digit)];
    return shifted || digit;
  }

  if (/^Numpad([0-9])$/.test(code)) {
    return code.slice(6);
  }

  if (/^Key([A-Z])$/.test(code)) {
    return code.slice(3);
  }

  if (CODE_TO_ASCII[code]) {
    return e.shiftKey && CODE_TO_ASCII[code].shift
      ? CODE_TO_ASCII[code].shift!
      : CODE_TO_ASCII[code].normal;
  }

  if (e.key && e.key.length === 1) {
    const fallback = normalizeBarcodeInput(e.key);
    return fallback || null;
  }

  return null;
}

export function findProductByBarcode(
  products: ProductItem[],
  rawCode: string
): { product: ProductItem; matchedBarcode: string } | null {
  const target = normalizeBarcodeInput(rawCode);
  if (!target) return null;

  for (const product of products) {
    const codes = normalizeBarcodeList(product.barcodes);
    if (codes.includes(target)) {
      return { product, matchedBarcode: target };
    }
  }
  return null;
}

export interface BarcodeConflict {
  barcode: string;
  ownerProduct: ProductItem;
}

export function findBarcodeConflicts(
  products: ProductItem[],
  candidateBarcodes: string[],
  excludeProductId?: string
): BarcodeConflict[] {
  const normalizedCandidates = normalizeBarcodeList(candidateBarcodes);
  if (normalizedCandidates.length === 0) return [];

  const conflicts: BarcodeConflict[] = [];
  for (const code of normalizedCandidates) {
    for (const prod of products) {
      if (excludeProductId && prod.id === excludeProductId) continue;
      const prodCodes = normalizeBarcodeList(prod.barcodes);
      if (prodCodes.includes(code)) {
        conflicts.push({ barcode: code, ownerProduct: prod });
        break;
      }
    }
  }
  return conflicts;
}

export function detectDefaultScannerMode(): 'camera' | 'hid' {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'hid';
  }

  const ua = navigator.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const isCoarsePointer =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = (navigator.maxTouchPoints || 0) > 0;
  const isNarrowViewport = window.innerWidth <= 1024;

  if (isMobileUa || (isCoarsePointer && hasTouch && isNarrowViewport)) {
    return 'camera';
  }
  return 'hid';
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playScanTone(
  type: 'success' | 'duplicate' | 'error',
  muted = false
): void {
  if (muted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Crisp POS two-tone confirmation chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      osc.frequency.setValueAtTime(1396.9, now + 0.055);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'duplicate') {
      // Gentle muted single mid-tone for consecutive duplicate scan
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.09, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.start(now);
      osc.stop(now + 0.1);
    } else {
      // Distinct low double-buzz for unknown barcode
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.setValueAtTime(180, now + 0.09);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.21);
    }
  } catch {
    // Ignore audio context errors on restricted devices
  }
}

export function triggerScanHaptic(type: 'success' | 'duplicate' | 'error'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      if (type === 'success') {
        navigator.vibrate(45);
      } else if (type === 'duplicate') {
        navigator.vibrate(20);
      } else {
        navigator.vibrate([75, 45, 75]);
      }
    }
  } catch {
    // Ignore unsupported vibration API
  }
}

/**
 * Pure inquiry-history transition:
 * - Consecutive repeat of the current top item (A -> A -> A) never adds a row or multiplies quantity.
 * - Scanning a different item or returning to an earlier item after another (A -> B -> A) prepends a new unit-1 row for comparison.
 */
export function applyBarcodeInquiryScan<
  T extends { productId: string; quantity: number }
>(
  currentTray: T[],
  incomingEntry: T
): { nextTray: T[]; isConsecutiveDuplicate: boolean } {
  if (currentTray.length > 0 && currentTray[0].productId === incomingEntry.productId) {
    const updatedTop: T = {
      ...incomingEntry,
      quantity: currentTray[0].quantity,
    };
    return {
      nextTray: [updatedTop, ...currentTray.slice(1)],
      isConsecutiveDuplicate: true,
    };
  }

  return {
    nextTray: [incomingEntry, ...currentTray],
    isConsecutiveDuplicate: false,
  };
}

export const NATIVE_1D_DETECTOR_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'code_93',
  'itf',
  'codabar',
] as const;

const DISALLOWED_2D_FORMATS = new Set([
  'qrcode',
  'qrcodemodel1',
  'qrcodemodel2',
  'microqrcode',
  'rmqrcode',
  'qr_code',
  'datamatrix',
  'data_matrix',
  'aztec',
  'azteccode',
  'aztecrune',
  'pdf417',
  'compactpdf417',
  'micropdf417',
  'maxicode',
]);

export function isLinearBarcodeFormat(format: unknown): boolean {
  if (!format) return true;
  const key = String(format).trim().toLowerCase().replace(/[\s-]+/g, '');
  return !DISALLOWED_2D_FORMATS.has(key);
}


