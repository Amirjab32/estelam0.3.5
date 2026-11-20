import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Link as LinkIcon,
  Search,
  Percent,
  Check,
  Image as ImageIcon,
  Code2,
  AlertCircle,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { formatPersianNumber, toPersianDigits } from '../utils/jalali.ts';
import { extractPriceFromDigikalaInspect } from '../utils/digikalaScraper.ts';
import { fetchLiveDigikalaProductClient } from '../utils/clientDigikalaScraper.ts';
import { extractDkpId } from '../utils/universalScraper.ts';
import { Capacitor } from '@capacitor/core';
import { ProductItem } from '../types.ts';
import { BarcodeAssigner } from './BarcodeAssigner.tsx';

interface AddProductModalProps {
  onClose: () => void;
  onProductAdded: (newProd: any) => Promise<void> | void;
  existingProducts?: ProductItem[];
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  onClose,
  onProductAdded,
  existingProducts = [],
}) => {
  const [url, setUrl] = useState('');
  const [inspectSnippet, setInspectSnippet] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState<string | null>(null);
  const [extractErrorMsg, setExtractErrorMsg] = useState<string | null>(null);
  const [discountInfo, setDiscountInfo] = useState<{
    hasDiscount: boolean;
    discountedPrice?: number;
    discountPercent?: string;
  } | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
  const [serverStatus, setServerStatus] = useState<{
    checked: boolean;
    isOnline: boolean;
    text: string;
  } | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('لوازم جانبی و قطعات');
  const [priceToman, setPriceToman] = useState<number>(0);
  const [marginPercent, setMarginPercent] = useState<number>(8);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [notes, setNotes] = useState('');
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounceTimerRef = useRef<number | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      activeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isSubmitting]);

  const checkServerHealth = async () => {
    try {
      setIsCheckingServer(true);
      if (Capacitor.isNativePlatform()) {
        setServerStatus({
          checked: true,
          isOnline: true,
          text: 'اپ بومی اندروید فعال است — استعلام مستقیم بدون نیاز به سرور واسط',
        });
        return;
      }

      let res = await fetch('/api/track-url');
      if (res.status === 404) {
        res = await fetch('/api/track-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ping: true }),
        });
      }

      if (res.ok || res.status === 400) {
        const json = await res.json().catch(() => ({}));
        setServerStatus({
          checked: true,
          isOnline: true,
          text: json.message || 'سرور استعلام با موفقیت پاسخ داد و آماده است',
        });
      } else {
        setServerStatus({
          checked: true,
          isOnline: false,
          text: `پاسخ غیرمنتظره با کد ${res.status}`,
        });
      }
    } catch (e: any) {
      setServerStatus({
        checked: true,
        isOnline: false,
        text: `عدم ارتباط با سرور (${e.message || 'Network Error'})`,
      });
    } finally {
      setIsCheckingServer(false);
    }
  };

  const customerSellingPrice =
    priceToman > 0
      ? Math.round((priceToman * (1 + (Number(marginPercent) || 0) / 100)) / 1000) * 1000
      : 0;
  const profitAmountToman = customerSellingPrice > 0 ? customerSellingPrice - priceToman : 0;

  const handleInspectSnippetChange = (val: string) => {
    setInspectSnippet(val);
    if (!val.trim()) return;

    const parsed = extractPriceFromDigikalaInspect(val);
    if (parsed && parsed.priceToman > 0) {
      setPriceToman(parsed.priceToman);
      setAutoFilled(true);
      if (parsed.isDiscountedOriginal) {
        setDiscountInfo({ hasDiscount: true });
        setExtractSuccessMsg(
          `قیمت اصلی و بدون تخفیف (${formatPersianNumber(parsed.priceToman)} تومان) استخراج و درج شد.`
        );
      } else {
        setDiscountInfo(null);
        setExtractSuccessMsg(
          `قیمت کالا (${formatPersianNumber(parsed.priceToman)} تومان) با موفقیت استخراج و درج شد.`
        );
      }
    }
  };

  const handleExtractFromUrl = async (overrideUrl?: string) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const targetUrl = (overrideUrl !== undefined ? overrideUrl : url).trim();
    const trimmedInspect = inspectSnippet.trim();
    if (!targetUrl && !trimmedInspect) return;

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    try {
      setIsExtracting(true);
      setExtractSuccessMsg(null);
      setExtractErrorMsg(null);
      setDiscountInfo(null);

      const {
        data: extractedData,
        diagnosticError,
        aborted,
      } = await fetchLiveDigikalaProductClient({
        url: targetUrl,
        inspectHtml: trimmedInspect,
        fallbackName: name,
        fallbackCategory: category,
        fallbackImageUrl: imageUrl,
        signal: controller.signal,
      });

      if (aborted || controller.signal.aborted) {
        return;
      }

      const diagnosticMsg = diagnosticError || '';

      if (extractedData) {
        if (extractedData.priceToman > 0) {
          setPriceToman(extractedData.priceToman);
        }
        if (extractedData.name) {
          setName(extractedData.name);
        }
        if (extractedData.category) {
          setCategory(extractedData.category);
        }
        if (extractedData.imageUrl) {
          setImageUrl(extractedData.imageUrl);
          setImagePreviewError(false);
        }

        setAutoFilled(true);

        if (extractedData.hasDiscount) {
          setDiscountInfo({
            hasDiscount: true,
            discountedPrice: extractedData.discountedPriceToman,
            discountPercent: extractedData.discountPercent,
          });
          setExtractSuccessMsg(
            `این کالا دارای ${extractedData.discountPercent || ''} تخفیف بود؛ قیمت اصلی بدون تخفیف (${formatPersianNumber(extractedData.priceToman)} تومان) ثبت شد.`
          );
        } else {
          setDiscountInfo(null);
          setExtractSuccessMsg(
            extractedData.priceToman > 0
              ? `قیمت روز دیجی‌کالا (${formatPersianNumber(extractedData.priceToman)} تومان) استعلام و درج شد.`
              : 'مشخصات کالا دریافت شد (ناموجود در انبار).'
          );
        }
      } else {
        setExtractErrorMsg(
          diagnosticMsg ||
            'امکان استعلام خودکار فراهم نشد. لطفاً لینک کالا را بررسی کنید، یا کد اینسپکت و قیمت را دستی وارد نمایید.'
        );
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error('Failed to extract product data', err);
      setExtractErrorMsg(`خطا در استعلام قیمت: ${err.message || 'لطفاً مجدداً تلاش کنید'}`);
    } finally {
      if (activeAbortRef.current === controller) {
        setIsExtracting(false);
      }
    }
  };

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
      setIsExtracting(false);
    }

    const trimmed = newUrl.trim();
    if (!trimmed) {
      setExtractErrorMsg(null);
      return;
    }

    // Trigger automatic lookup 550ms after user stops typing or pasting a valid DKP link/ID
    if (extractDkpId(trimmed)) {
      debounceTimerRef.current = window.setTimeout(() => {
        handleExtractFromUrl(newUrl);
      }, 550);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || priceToman <= 0) return;

    const nowIso = new Date().toISOString();
    const newProdPayload = {
      id: `prod_${Date.now()}`,
      name: name.trim(),
      category,
      sourceUrl: url.trim(),
      imageUrl:
        imageUrl.trim() ||
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
      currentPriceToman: priceToman,
      lastPriceToman: priceToman,
      marginPercent: Number(marginPercent) || 0,
      customerQuoteToman: customerSellingPrice || priceToman,
      stockStatus: 'in_stock' as const,
      warranty: '',
      lastRefreshedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      notes: notes.trim(),
      barcodes,
    };

    try {
      setIsSubmitting(true);
      await onProductAdded(newProdPayload);
      onClose();
    } catch (err: any) {
      setExtractErrorMsg(`خطا در ذخیره‌سازی کالا: ${err?.message || 'لطفاً مجدداً تلاش کنید'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-modal-title"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Fixed Header */}
        <div className="shrink-0 px-5 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900">
          <div className="min-w-0">
            <h3
              id="add-product-modal-title"
              className="font-bold text-white text-base sm:text-lg truncate"
            >
              افزودن کالای جدید
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              استعلام خودکار قیمت اصلی (بدون تخفیف) از دیجی‌کالا یا ثبت دستی مشخصات
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="بستن پنجره"
            className="w-10 h-10 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          {/* Server Connection Status Row */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Activity
                className={`w-4 h-4 shrink-0 ${
                  serverStatus?.isOnline
                    ? 'text-emerald-400'
                    : serverStatus
                      ? 'text-rose-400'
                      : 'text-indigo-400'
                }`}
              />
              <span className="text-slate-300 truncate">
                {serverStatus
                  ? serverStatus.text
                  : 'استعلام از طریق سرور کلادفلر یا موتور محلی'}
              </span>
            </div>

            <button
              type="button"
              onClick={checkServerHealth}
              disabled={isCheckingServer}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 text-xs font-medium transition whitespace-nowrap shrink-0"
            >
              {isCheckingServer ? 'در حال بررسی...' : 'تست اتصال سرور'}
            </button>
          </div>

          {/* Step 1: URL & Inspect Extraction */}
          <div className="space-y-4">
            <div>
              <label
                htmlFor="digikala-url-input"
                className="block text-xs font-semibold text-slate-200 mb-1.5"
              >
                لینک یا شناسه کالای دیجی‌کالا
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <LinkIcon className="w-4 h-4 text-slate-500 absolute top-1/2 -translate-y-1/2 left-3 pointer-events-none" />
                  <input
                    id="digikala-url-input"
                    type="url"
                    dir="ltr"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://www.digikala.com/product/dkp-..."
                    className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3.5 py-2 text-left text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleExtractFromUrl()}
                  disabled={isExtracting || (!url.trim() && !inspectSnippet.trim())}
                  className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition active:scale-95 whitespace-nowrap shrink-0"
                >
                  <Search className={`w-4 h-4 ${isExtracting ? 'animate-spin' : ''}`} />
                  <span>{isExtracting ? 'در حال استعلام...' : 'استعلام قیمت'}</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="digikala-inspect-input"
                  className="text-xs font-medium text-slate-300 flex items-center gap-1.5"
                >
                  <Code2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>کد اینسپکت یا عدد قیمت (اختیاری)</span>
                </label>
                <span dir="ltr" className="text-[11px] text-slate-500 font-mono">
                  price-no-discount
                </span>
              </div>
              <textarea
                id="digikala-inspect-input"
                rows={2}
                dir="ltr"
                value={inspectSnippet}
                onChange={(e) => handleInspectSnippetChange(e.target.value)}
                placeholder='<span data-testid="price-no-discount">2,350,000</span> or 2350000'
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-left text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed resize-none"
              />
            </div>

            {extractErrorMsg && (
              <div className="text-xs text-rose-200 bg-rose-950/60 p-3.5 rounded-xl border border-rose-800/60 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold block">{extractErrorMsg}</span>
                  <span className="text-[11px] text-slate-300 block">
                    می‌توانید کد اینسپکت یا عدد قیمت را در کادر بالا قرار دهید یا مشخصات کالا را مستقیماً در فرم زیر وارد کنید.
                  </span>
                </div>
              </div>
            )}

            {extractSuccessMsg && (
              <div className="text-xs text-emerald-200 bg-emerald-950/50 p-3.5 rounded-xl border border-emerald-800/60 flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold block">{extractSuccessMsg}</span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tabular-nums">
                    <span className="text-emerald-300 font-mono font-bold">
                      قیمت مبنا: {formatPersianNumber(priceToman)} تومان
                    </span>
                    {discountInfo?.discountedPrice ? (
                      <span className="text-slate-400 line-through font-mono">
                        قیمت با تخفیف: {formatPersianNumber(discountInfo.discountedPrice)} تومان
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Product Details Form */}
          <form id="add-product-form" onSubmit={handleSubmit} className="pt-4 border-t border-slate-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label
                  htmlFor="product-name-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  نام کامل کالا
                </label>
                <input
                  id="product-name-input"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: ماوس بی‌سیم گیمینگ مدل T2"
                  className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="product-category-select"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  دسته‌بندی
                </label>
                <div className="relative">
                  <select
                    id="product-category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[42px] appearance-none rounded-xl border border-slate-700 bg-slate-950 pr-3.5 pl-9 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="لوازم جانبی و گیمینگ">لوازم جانبی و گیمینگ (ماوس، کیبورد، هدست)</option>
                    <option value="لپ‌تاپ و اولترابوک">لپ‌تاپ و اولترابوک</option>
                    <option value="قطعات و ارتقا سیستم">قطعات و ارتقا سیستم (رم، SSD، گرافیک، CPU)</option>
                    <option value="مانیتور و نمایشگر">مانیتور و نمایشگر</option>
                    <option value="لوازم جانبی و قطعات">سایر لوازم و قطعات کامپیوتر</option>
                    <option value="تعمیرات و خدمات سخت‌افزاری">تعمیرات و خدمات سخت‌افزاری</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label
                  htmlFor="product-price-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  قیمت اصلی مرجع (بدون تخفیف - تومان)
                </label>
                <input
                  id="product-price-input"
                  type="number"
                  dir="ltr"
                  min={1}
                  required
                  value={priceToman || ''}
                  onChange={(e) => setPriceToman(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="2500000"
                  className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-left text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
                />
                {priceToman > 0 ? (
                  <p className="text-[11px] text-emerald-400 mt-1 tabular-nums">
                    {autoFilled ? 'استخراج هوشمند: ' : ''}
                    {formatPersianNumber(priceToman)} تومان
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">
                    پس از استعلام خودکار یا ورود دستی درج می‌شود
                  </p>
                )}
              </div>

              {/* Margin & Final Price Section */}
              <div className="sm:col-span-2 pt-4 border-t border-slate-800 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Percent className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>تعیین درصد سود فروشگاه و قیمت نهایی مشتری</span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[3, 5, 8, 10, 12, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setMarginPercent(pct)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition whitespace-nowrap ${
                          marginPercent === pct
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {toPersianDigits(pct)}٪
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="product-margin-input"
                      className="block text-[11px] font-medium text-slate-400 mb-1"
                    >
                      درصد سود اختصاصی
                    </label>
                    <div className="relative">
                      <input
                        id="product-margin-input"
                        type="number"
                        dir="ltr"
                        min={0}
                        max={500}
                        step="0.5"
                        value={marginPercent}
                        onChange={(e) =>
                          setMarginPercent(Math.max(0, Math.min(500, Number(e.target.value) || 0)))
                        }
                        className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 pl-8 pr-3.5 py-2 text-left text-sm text-slate-100 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                        ٪
                      </span>
                    </div>
                  </div>

                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-center">
                    <span className="text-[11px] text-slate-400">سود روی هر فروش</span>
                    <div className="flex items-baseline gap-1 mt-0.5 tabular-nums">
                      <span className="text-sm font-bold text-indigo-300 font-mono">
                        +{formatPersianNumber(profitAmountToman)}
                      </span>
                      <span className="text-[11px] text-slate-400">تومان</span>
                    </div>
                  </div>

                  <div className="px-3.5 py-2.5 rounded-xl bg-emerald-950/35 border border-emerald-800/60 flex flex-col justify-center">
                    <span className="text-[11px] text-emerald-300 font-medium">قیمت فروش به مشتری</span>
                    <div className="flex items-baseline gap-1 mt-0.5 tabular-nums">
                      <span className="text-base font-black text-emerald-400 font-mono">
                        {formatPersianNumber(customerSellingPrice)}
                      </span>
                      <span className="text-xs text-emerald-400">تومان</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="product-image-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  آدرس تصویر کالا
                </label>
                <div className="flex items-center gap-2.5">
                  <input
                    id="product-image-input"
                    type="url"
                    dir="ltr"
                    value={imageUrl}
                    onChange={(e) => {
                      setImageUrl(e.target.value);
                      setImagePreviewError(false);
                    }}
                    placeholder="https://dkstatics-public.digikala.com/..."
                    className="flex-1 min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-left text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  {imageUrl && !imagePreviewError ? (
                    <img
                      src={imageUrl}
                      alt="پیش‌نمایش تصویر کالا"
                      referrerPolicy="no-referrer"
                      onError={() => setImagePreviewError(true)}
                      className="w-[42px] h-[42px] rounded-xl object-cover border border-slate-700 shrink-0 bg-slate-950"
                    />
                  ) : (
                    <div className="w-[42px] h-[42px] rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center text-slate-600 shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="product-notes-input"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  یادداشت فروشگاه (اختیاری)
                </label>
                <input
                  id="product-notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="توضیحات موجودی انبار یا نکات گارانتی..."
                  className="w-full min-h-[42px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2 pt-4 border-t border-slate-800">
                <BarcodeAssigner
                  barcodes={barcodes}
                  onChange={setBarcodes}
                  allProducts={existingProducts}
                  compact
                />
              </div>
            </div>
          </form>
        </div>

        {/* Fixed Footer */}
        <div className="shrink-0 px-5 sm:px-6 py-4 border-t border-slate-800 bg-slate-900 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[40px] px-4 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition whitespace-nowrap"
          >
            انصراف
          </button>
          <button
            type="submit"
            form="add-product-form"
            disabled={isSubmitting || !name.trim() || priceToman <= 0}
            className="min-h-[40px] px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition active:scale-95 whitespace-nowrap"
          >
            {isSubmitting ? 'در حال ثبت...' : 'ذخیره کالا و پایش قیمت'}
          </button>
        </div>
      </div>
    </div>
  );
};
