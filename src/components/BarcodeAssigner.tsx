import React, { useMemo, useState } from 'react';
import {
  ScanBarcode,
  Plus,
  X,
  Camera,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { ProductItem } from '../types.ts';
import {
  findBarcodeConflicts,
  MAX_BARCODES_PER_PRODUCT,
  normalizeBarcodeInput,
  normalizeBarcodeList,
  playScanTone,
  triggerScanHaptic,
} from '../utils/barcodeUtils.ts';
import { toPersianDigits } from '../utils/jalali.ts';
import { CameraBarcodeViewport } from './CameraBarcodeViewport.tsx';

interface BarcodeAssignerProps {
  barcodes: string[];
  onChange: (nextBarcodes: string[]) => Promise<void> | void;
  allProducts?: ProductItem[];
  currentProductId?: string;
  compact?: boolean;
  title?: string;
}

export const BarcodeAssigner: React.FC<BarcodeAssignerProps> = ({
  barcodes,
  onChange,
  allProducts = [],
  currentProductId,
  compact = false,
  title = 'بارکدهای متصل به کالا (جعبه و لیبل مغازه)',
}) => {
  const [draft, setDraft] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const normalizedList = useMemo(() => normalizeBarcodeList(barcodes), [barcodes]);

  const conflicts = useMemo(() => {
    const candidate = normalizeBarcodeInput(draft);
    const toCheck = candidate ? [...normalizedList, candidate] : normalizedList;
    return findBarcodeConflicts(allProducts, toCheck, currentProductId);
  }, [allProducts, normalizedList, draft, currentProductId]);

  const commitBarcodes = async (next: string[], feedbackMsg?: string) => {
    setIsUpdating(true);
    try {
      await onChange(next);
      if (feedbackMsg) {
        setInlineNotice({ type: 'success', text: feedbackMsg });
      }
    } catch {
      setInlineNotice({
        type: 'error',
        text: 'خطا در ذخیره‌سازی بارکد؛ لطفاً دوباره تلاش کنید',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const addBarcodeValue = async (rawValue: string, fromCamera = false) => {
    const clean = normalizeBarcodeInput(rawValue);
    if (!clean) return;

    if (normalizedList.includes(clean)) {
      if (fromCamera) {
        playScanTone('error');
        triggerScanHaptic('error');
      }
      setInlineNotice({
        type: 'error',
        text: `بارکد ${clean} قبلاً به این کالا متصل شده است`,
      });
      setDraft('');
      return;
    }

    if (normalizedList.length >= MAX_BARCODES_PER_PRODUCT) {
      setInlineNotice({
        type: 'error',
        text: `حداکثر ${toPersianDigits(MAX_BARCODES_PER_PRODUCT)} بارکد برای هر کالا مجاز است`,
      });
      return;
    }

    if (fromCamera) {
      playScanTone('success');
      triggerScanHaptic('success');
    }

    const next = [...normalizedList, clean];
    setDraft('');
    await commitBarcodes(next, `بارکد ${clean} اضافه شد`);
  };

  const removeBarcode = async (target: string) => {
    const next = normalizedList.filter((b) => b !== target);
    setInlineNotice(null);
    await commitBarcodes(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <ScanBarcode className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{title}</span>
          <span className="text-[11px] font-normal text-slate-400 tabular-nums">
            ({toPersianDigits(normalizedList.length)} / {toPersianDigits(MAX_BARCODES_PER_PRODUCT)})
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowCamera((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition whitespace-nowrap shrink-0 ${
            showCamera
              ? 'bg-indigo-600 text-white border-indigo-500'
              : 'bg-slate-950 text-indigo-300 hover:text-white border-slate-700 hover:border-indigo-500/60'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>{showCamera ? 'بستن دوربین' : 'اسکن با دوربین'}</span>
        </button>
      </div>

      {/* Input + Add Button (Keyboard / Hardware Barcode Scanner) */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          dir="ltr"
          value={draft}
          onChange={(e) => {
            setDraft(normalizeBarcodeInput(e.target.value));
            if (inlineNotice) setInlineNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              addBarcodeValue(draft);
            }
          }}
          placeholder="اسکن با بارکدخوان یا تایپ کد (تبدیل خودکار فارسی به انگلیسی)"
          className="flex-1 min-h-[40px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs sm:text-sm text-slate-100 placeholder-slate-500 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <button
          type="button"
          disabled={isUpdating || !normalizeBarcodeInput(draft)}
          onClick={() => addBarcodeValue(draft)}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isUpdating ? 'در حال ثبت...' : 'افزودن بارکد'}</span>
        </button>
      </div>

      {/* Inline Camera Viewport when toggled */}
      {showCamera && (
        <div className="space-y-1.5">
          <CameraBarcodeViewport
            active={showCamera}
            compact={compact}
            onDetected={(code) => {
              addBarcodeValue(code, true);
            }}
          />
          <p className="text-[11px] text-slate-400">
            بارکد روی جعبه یا لیبل را مقابل دوربین بگیرید تا به‌صورت خودکار ثبت شود.
          </p>
        </div>
      )}

      {/* Duplicate Warning Across Other Products */}
      {conflicts.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {conflicts.map((c) => (
              <p key={c.barcode}>
                بارکد <span dir="ltr" className="font-mono font-bold text-white">{c.barcode}</span>{' '}
                قبلاً روی کالای «<strong>{c.ownerProduct.name}</strong>» ثبت شده است.
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Inline Feedback Notice */}
      {inlineNotice && (
        <div
          className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 ${
            inlineNotice.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
              : 'bg-rose-950/50 border-rose-800/60 text-rose-300'
          }`}
        >
          {inlineNotice.type === 'success' ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{inlineNotice.text}</span>
        </div>
      )}

      {/* Attached Barcodes Chips */}
      {normalizedList.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {normalizedList.map((code) => (
            <div
              key={code}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-xs text-slate-200"
            >
              <span dir="ltr" className="font-mono tabular-nums font-semibold tracking-wide">
                {code}
              </span>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => removeBarcode(code)}
                aria-label={`حذف بارکد ${code}`}
                className="text-slate-400 hover:text-rose-400 transition disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          هنوز بارکدی به این کالا متصل نشده است. می‌توانید چند بارکد (کد کارخانه و لیبل مغازه) ثبت کنید.
        </p>
      )}
    </div>
  );
};
