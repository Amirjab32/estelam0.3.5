import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ScanBarcode,
  Camera,
  Keyboard,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  Check,
  Plus,
  Minus,
  AlertCircle,
  ShieldAlert,
  ShoppingBag,
  Info,
} from 'lucide-react';
import { ProductItem } from '../types.ts';
import {
  applyBarcodeInquiryScan,
  detectDefaultScannerMode,
  findProductByBarcode,
  mapKeyEventToAsciiChar,
  normalizeBarcodeInput,
  playScanTone,
  triggerScanHaptic,
} from '../utils/barcodeUtils.ts';
import { formatPersianNumber, toPersianDigits } from '../utils/jalali.ts';
import { CameraBarcodeViewport } from './CameraBarcodeViewport.tsx';

interface BarcodeScannerModalProps {
  products: ProductItem[];
  onClose: () => void;
}

interface ScannedQuoteEntry {
  entryId: string;
  productId: string;
  name: string;
  imageUrl: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'call';
  unitQuoteToman: number;
  matchedBarcode: string;
  quantity: number;
  scannedAt: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  products,
  onClose,
}) => {
  const autoDetectedMode = useMemo(() => detectDefaultScannerMode(), []);
  const [scanMode, setScanMode] = useState<'camera' | 'hid'>(autoDetectedMode);
  const [isMuted, setIsMuted] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [tray, setTray] = useState<ScannedQuoteEntry[]>([]);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'duplicate' | 'not_found';
    code: string;
    productName?: string;
  } | null>(null);
  const [copiedTray, setCopiedTray] = useState(false);

  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const trayRef = useRef<ScannedQuoteEntry[]>([]);
  const entrySeqRef = useRef<number>(0);
  const hidBufferRef = useRef<{ chars: string; lastKeyAt: number }>({
    chars: '',
    lastKeyAt: 0,
  });
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    trayRef.current = tray;
  }, [tray]);

  const productsRef = useRef(products);
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const showTransientFeedback = useCallback(
    (next: { type: 'success' | 'duplicate' | 'not_found'; code: string; productName?: string }) => {
      setScanFeedback(next);
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(() => {
        setScanFeedback(null);
      }, 3200);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const handleProcessBarcode = useCallback(
    (rawCode: string) => {
      const normalized = normalizeBarcodeInput(rawCode);
      if (!normalized) return;

      const match = findProductByBarcode(productsRef.current, normalized);
      if (!match) {
        playScanTone('error', isMutedRef.current);
        triggerScanHaptic('error');
        showTransientFeedback({ type: 'not_found', code: normalized });
        return;
      }

      const { product, matchedBarcode } = match;
      const sellingPrice = product.customerQuoteToman || product.currentPriceToman || 0;
      const candidateEntry: ScannedQuoteEntry = {
        entryId:
          trayRef.current[0]?.productId === product.id
            ? trayRef.current[0].entryId
            : `scan_${Date.now()}_${++entrySeqRef.current}`,
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        stockStatus: product.stockStatus,
        unitQuoteToman: sellingPrice,
        matchedBarcode,
        quantity: 1,
        scannedAt: new Date().toISOString(),
      };

      const { nextTray, isConsecutiveDuplicate } = applyBarcodeInquiryScan(
        trayRef.current,
        candidateEntry
      );

      trayRef.current = nextTray;
      setTray(nextTray);

      if (isConsecutiveDuplicate) {
        playScanTone('duplicate', isMutedRef.current);
        triggerScanHaptic('duplicate');
        showTransientFeedback({
          type: 'duplicate',
          code: matchedBarcode,
          productName: product.name,
        });
      } else {
        playScanTone('success', isMutedRef.current);
        triggerScanHaptic('success');
        showTransientFeedback({
          type: 'success',
          code: matchedBarcode,
          productName: product.name,
        });
      }
    },
    [showTransientFeedback]
  );

  // Auto-focus manual/HID input when HID mode is active
  useEffect(() => {
    if (scanMode === 'hid') {
      const timer = window.setTimeout(() => {
        manualInputRef.current?.focus();
      }, 60);
      return () => window.clearTimeout(timer);
    }
  }, [scanMode]);

  // Global keyboard / USB HID burst listener + Escape close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (scanMode !== 'hid') return;

      const target = e.target as HTMLElement | null;
      const isInsideFormInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      // Let focused input handle its own typing & Enter submission
      if (isInsideFormInput) return;

      const now = Date.now();
      if (e.key === 'Enter') {
        const buffered = hidBufferRef.current.chars;
        hidBufferRef.current = { chars: '', lastKeyAt: 0 };
        if (buffered.length >= 2) {
          e.preventDefault();
          handleProcessBarcode(buffered);
        }
        return;
      }

      const asciiChar = mapKeyEventToAsciiChar(e);
      if (!asciiChar) return;

      // Reset buffer if delay between characters exceeds normal HID burst threshold (120ms)
      if (now - hidBufferRef.current.lastKeyAt > 120) {
        hidBufferRef.current.chars = asciiChar;
      } else {
        hidBufferRef.current.chars += asciiChar;
      }
      hidBufferRef.current.lastKeyAt = now;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scanMode, onClose, handleProcessBarcode]);

  const totalItemsCount = useMemo(
    () => tray.reduce((sum, item) => sum + item.quantity, 0),
    [tray]
  );

  const grandTotalToman = useMemo(
    () => tray.reduce((sum, item) => sum + item.unitQuoteToman * item.quantity, 0),
    [tray]
  );

  const updateQuantity = (entryId: string, delta: number) => {
    setTray((prev) => {
      const next = prev
        .map((item) =>
          item.entryId === entryId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0);
      trayRef.current = next;
      return next;
    });
  };

  const removeEntry = (entryId: string) => {
    setTray((prev) => {
      const next = prev.filter((item) => item.entryId !== entryId);
      trayRef.current = next;
      return next;
    });
  };

  const handleCopyCustomerList = async () => {
    if (tray.length === 0) return;
    const lines = tray.map((item, idx) => {
      const lineTotal = item.unitQuoteToman * item.quantity;
      const qtyPart = item.quantity > 1 ? ` (${toPersianDigits(item.quantity)} عدد)` : '';
      return `${toPersianDigits(idx + 1)}. ${item.name}${qtyPart} — ${formatPersianNumber(lineTotal)} تومان`;
    });
    lines.push('');
    lines.push(`جمع کل: ${formatPersianNumber(grandTotalToman)} تومان`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedTray(true);
      window.setTimeout(() => setCopiedTray(false), 2000);
    } catch {
      // Clipboard blocked in restricted iframe context
    }
  };

  const stockLabel = (status: ScannedQuoteEntry['stockStatus']) => {
    if (status === 'out_of_stock') return { text: 'ناموجود', cls: 'text-rose-400' };
    if (status === 'call') return { text: 'تماس بگیرید', cls: 'text-amber-400' };
    return { text: 'موجود', cls: 'text-emerald-400' };
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-scanner-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="barcode-scanner-modal-title"
                className="font-bold text-white text-sm sm:text-base truncate"
              >
                بارکدخوان هوشمند استعلام قیمت
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                حالت محرمانه مشتری ·{' '}
                {autoDetectedMode === 'camera'
                  ? 'تشخیص خودکار: موبایل / دوربین'
                  : 'تشخیص خودکار: سیستم / بارکدخوان USB'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setScanMode('hid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  scanMode === 'hid'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>بارکدخوان سیستم</span>
              </button>
              <button
                type="button"
                onClick={() => setScanMode('camera')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  scanMode === 'camera'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>دوربین</span>
              </button>
            </div>

            {/* Sound Mute Toggle */}
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              title={isMuted ? 'فعال کردن صدای بوق اسکن' : 'بی‌صدا کردن بوق اسکن'}
              aria-label={isMuted ? 'فعال کردن صدا' : 'بی‌صدا کردن'}
              className="w-9 h-9 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-slate-500" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="بستن بارکدخوان"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Active Scanner Zone */}
          {scanMode === 'camera' ? (
            <CameraBarcodeViewport
              active={scanMode === 'camera'}
              onDetected={(code) => handleProcessBarcode(code)}
            />
          ) : (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <ScanBarcode className="w-4 h-4 shrink-0" />
                  <span>آماده دریافت بارکد از اسکنر USB / بلوتوث</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  تبدیل خودکار کیبورد فارسی به انگلیسی فعال است
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = normalizeBarcodeInput(manualInput);
                  if (clean) {
                    handleProcessBarcode(clean);
                    setManualInput('');
                  }
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  ref={manualInputRef}
                  type="text"
                  dir="ltr"
                  value={manualInput}
                  onChange={(e) => setManualInput(normalizeBarcodeInput(e.target.value))}
                  placeholder="بارکد را اسکن کنید یا با کیبورد وارد و Enter بزنید..."
                  className="flex-1 min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-left text-sm text-white placeholder-slate-500 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!normalizeBarcodeInput(manualInput)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition whitespace-nowrap shrink-0"
                >
                  استعلام قیمت
                </button>
              </form>
            </div>
          )}

          {/* Non-blocking Scan Result Feedback Banner */}
          {scanFeedback && (
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                scanFeedback.type === 'not_found'
                  ? 'bg-rose-950/60 border-rose-800/70 text-rose-200'
                  : scanFeedback.type === 'duplicate'
                  ? 'bg-amber-950/50 border-amber-800/70 text-amber-200'
                  : 'bg-emerald-950/50 border-emerald-800/70 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {scanFeedback.type === 'not_found' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : scanFeedback.type === 'duplicate' ? (
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className="truncate font-medium">
                  {scanFeedback.type === 'not_found' ? (
                    <>
                      کالایی با بارکد{' '}
                      <strong dir="ltr" className="font-mono text-white">
                        {scanFeedback.code}
                      </strong>{' '}
                      ثبت نشده است.
                    </>
                  ) : scanFeedback.type === 'duplicate' ? (
                    <>این کالا هم‌اکنون در لیست ثبت است (تعداد تغییر نکرد): {scanFeedback.productName}</>
                  ) : (
                    <>به لیست استعلام اضافه شد: {scanFeedback.productName}</>
                  )}
                </span>
              </div>
              <span dir="ltr" className="font-mono text-[11px] text-slate-300 shrink-0">
                {scanFeedback.code}
              </span>
            </div>
          )}

          {/* Confidential Multi-Scan History Tray (No profit %, cost, or reference price shown) */}
          <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/60">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <ShoppingBag className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>نوار تاریخچه استعلام مشتری</span>
                <span className="text-[11px] font-normal text-slate-400 tabular-nums">
                  · {toPersianDigits(totalItemsCount)} قلم
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                  <span>نمایش محرمانه بدون درصد سود</span>
                </span>

                {tray.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      trayRef.current = [];
                      setTray([]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 text-[11px] font-medium transition whitespace-nowrap"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>پاک کردن لیست</span>
                  </button>
                )}
              </div>
            </div>

            {tray.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-1.5">
                <p className="text-xs font-medium text-slate-300">
                  هنوز کالایی اسکن نشده است
                </p>
                <p className="text-[11px] text-slate-500">
                  می‌توانید چند کالا را پشت‌سرهم اسکن کنید تا قیمت فروش نهایی آن‌ها در این نوار جمع و مقایسه شود.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-[260px] overflow-y-auto">
                {tray.map((item) => {
                  const stock = stockLabel(item.stockStatus);
                  const lineTotal = item.unitQuoteToman * item.quantity;

                  return (
                    <div
                      key={item.entryId}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition"
                    >
                      {/* Thumbnail + Product Info (Customer Safe Only) */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover border border-slate-800 bg-slate-900 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-semibold text-white line-clamp-1">
                            {item.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 mt-0.5">
                            <span className={stock.cls}>{stock.text}</span>
                            <span aria-hidden="true">·</span>
                            <span dir="ltr" className="font-mono text-slate-400 tabular-nums">
                              {item.matchedBarcode}
                            </span>
                            {item.quantity > 1 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums text-slate-400">
                                  واحد: {formatPersianNumber(item.unitQuoteToman)} ت
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quantity Stepper + Final Customer Selling Price + Remove */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.entryId, 1)}
                            aria-label="افزایش تعداد"
                            className="w-7 h-7 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold font-mono tabular-nums text-white">
                            {toPersianDigits(item.quantity)}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.entryId, -1)}
                            aria-label="کاهش تعداد"
                            className="w-7 h-7 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-left min-w-[115px] tabular-nums">
                          <span className="text-sm sm:text-base font-black text-emerald-400 font-mono">
                            {formatPersianNumber(lineTotal)}
                          </span>
                          <span className="text-[11px] text-emerald-500 mr-1">تومان</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeEntry(item.entryId)}
                          aria-label={`حذف ${item.name} از لیست`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer Summary */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-slate-800 bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-xs text-slate-400 font-medium">جمع کل اعلامی به مشتری:</span>
            <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
              {formatPersianNumber(grandTotalToman)}
            </span>
            <span className="text-xs text-emerald-500">تومان</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={tray.length === 0}
              onClick={handleCopyCustomerList}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition whitespace-nowrap"
            >
              {copiedTray ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>کپی شد</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی لیست قیمت</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition whitespace-nowrap"
            >
              بستن
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
