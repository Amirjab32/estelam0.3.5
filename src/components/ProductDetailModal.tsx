import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldCheck,
  Filter,
  BarChart2,
  Sparkles,
  RotateCcw,
  Percent,
  Check,
} from 'lucide-react';
import { ProductItem, PriceHistoryItem } from '../types.ts';
import {
  formatPersianNumber,
  toPersianDigits,
  getCurrentPersianDate,
} from '../utils/jalali.ts';
import { subscribeToSharedProductHistory } from '../services/firestoreProducts.ts';
import { StorageMode } from '../types.ts';
import { BarcodeAssigner } from './BarcodeAssigner.tsx';

interface ProductDetailModalProps {
  userId?: string | null;
  storageMode: StorageMode;
  fallbackHistory?: PriceHistoryItem[];
  product: ProductItem;
  allProducts?: ProductItem[];
  onBack: () => void;
  onUpdateMargin?: (productId: string, newMargin: number) => Promise<void> | void;
  onUpdateBarcodes?: (productId: string, nextBarcodes: string[]) => Promise<void> | void;
  onRefreshSingle?: (productId: string) => Promise<void>;
  isRefreshingSingle?: boolean;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  userId,
  storageMode,
  fallbackHistory = [],
  product,
  allProducts = [],
  onBack,
  onUpdateMargin,
  onUpdateBarcodes,
  onRefreshSingle,
  isRefreshingSingle = false,
}) => {
  const [history, setHistory] = useState<PriceHistoryItem[]>(fallbackHistory);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(storageMode === 'firebase');
  const [marginDraft, setMarginDraft] = useState<number>(product.marginPercent ?? 8);
  const [isSavingMargin, setIsSavingMargin] = useState(false);

  useEffect(() => {
    setMarginDraft(product.marginPercent ?? 8);
  }, [product.id, product.marginPercent]);

  // Date Range filter states
  const [filterPreset, setFilterPreset] = useState<'all' | '30d' | '14d' | '7d'>('all');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (storageMode !== 'firebase' || !userId || !product.id) {
      setHistory(fallbackHistory);
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    const unsubscribe = subscribeToSharedProductHistory(product.id, (entries) => {
      setHistory(entries.length > 0 ? entries : fallbackHistory);
      setLoadingHistory(false);
    });
    return () => unsubscribe();
  }, [storageMode, userId, product.id, fallbackHistory]);

  // Filter history based on preset
  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    if (filterPreset === 'all') return history;

    const now = Date.now();
    let daysCutoff = 30;
    if (filterPreset === '14d') daysCutoff = 14;
    if (filterPreset === '7d') daysCutoff = 7;

    const cutoffMs = now - daysCutoff * 24 * 3600 * 1000;
    return history.filter((item) => new Date(item.timestamp).getTime() >= cutoffMs);
  }, [history, filterPreset]);

  // Chart statistics
  const stats = useMemo(() => {
    if (filteredHistory.length === 0) {
      return {
        minPrice: product.currentPriceToman,
        maxPrice: product.currentPriceToman,
        avgPrice: product.currentPriceToman,
        fluctuationPercent: 0,
      };
    }

    const prices = filteredHistory.map((h) => h.priceToman);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const fluctuationPercent =
      firstPrice > 0 ? Number((((lastPrice - firstPrice) / firstPrice) * 100).toFixed(1)) : 0;

    return { minPrice, maxPrice, avgPrice, fluctuationPercent };
  }, [filteredHistory, product.currentPriceToman]);

  // SVG Chart Geometry
  const chartHeight = 220;
  const chartWidth = 700;
  const paddingX = 40;
  const paddingY = 30;

  const points = useMemo(() => {
    if (filteredHistory.length === 0) return [];
    const minP = stats.minPrice;
    const maxP = stats.maxPrice;
    const range = maxP === minP ? 1 : maxP - minP;

    // If only 1 entry or constant price, span a flat horizontal line across the chart
    if (filteredHistory.length === 1) {
      const singleItem = filteredHistory[0];
      const flatY = chartHeight / 2;
      return [
        { x: paddingX, y: flatY, item: singleItem, idx: 0 },
        { x: chartWidth - paddingX, y: flatY, item: singleItem, idx: 1 },
      ];
    }

    return filteredHistory.map((item, idx) => {
      const x =
        paddingX +
        (idx / Math.max(1, filteredHistory.length - 1)) * (chartWidth - paddingX * 2);
      // Invert Y since SVG 0 is top
      const y =
        maxP === minP
          ? chartHeight / 2
          : chartHeight -
            paddingY -
            ((item.priceToman - minP) / range) * (chartHeight - paddingY * 2);
      return { x, y, item, idx };
    });
  }, [filteredHistory, stats, chartWidth, chartHeight, paddingX, paddingY]);

  // Construct SVG Path
  const linePath = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${linePath} L ${last.x} ${chartHeight - paddingY} L ${first.x} ${chartHeight - paddingY} Z`;
  }, [linePath, points, chartHeight, paddingY]);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold border border-slate-800 transition active:scale-95"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به لیست کالاها</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Live Refresh from Digikala button */}
          {onRefreshSingle && (
            <button
              type="button"
              onClick={() => onRefreshSingle(product.id)}
              disabled={isRefreshingSingle}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition active:scale-95"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshingSingle ? 'animate-spin' : ''}`} />
              <span>{isRefreshingSingle ? 'در حال استعلام از دیجی‌کالا...' : 'استعلام زنده مجدد از دیجی‌کالا'}</span>
            </button>
          )}

          {product.sourceUrl && (
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 text-xs font-medium border border-cyan-500/30 transition"
            >
              <span>مشاهده در سایت دیجی‌کالا / مرجع</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Main Product Showcase Card */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Product Image Column */}
          <div className="lg:col-span-4 flex flex-col items-center">
            <div className="w-full aspect-square max-w-[320px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 p-2 shadow-inner">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover object-center rounded-xl"
              />
            </div>
            <span className="text-xs text-slate-400 mt-3 text-center">
              تصویر رسمی استخراج‌شده از مرجع فروش
            </span>
          </div>

          {/* Details & Quote Controls Column */}
          <div className="lg:col-span-8 space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-xs font-medium">
                  {product.category}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-xs font-medium">
                  موجود در انبار مغازه
                </span>
                {product.warranty ? (
                  <span className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-xs font-medium">
                    {product.warranty}
                  </span>
                ) : null}
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white leading-snug">
                {product.name}
              </h2>

              {product.notes && (
                <p className="mt-2 text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                  <strong>یادداشت مغازه:</strong> {product.notes}
                </p>
              )}
            </div>

            {/* Real Price & Market Fluctuation Overview (Customer calculator removed per request) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Main Real Price Card & Customer Quote */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-medium">قیمت مرجع دیجی‌کالا:</span>
                  <span className="text-sm font-bold text-slate-200 font-mono">
                    {formatPersianNumber(product.currentPriceToman)} تومان
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-emerald-400 block">قیمت فروش به مشتری:</span>
                    <span className="text-[10px] text-indigo-400">با {toPersianDigits(product.marginPercent ?? 8)}٪ سود مغازه</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                      {formatPersianNumber(product.customerQuoteToman || product.currentPriceToman)}
                    </span>
                    <span className="text-xs font-semibold text-emerald-500">تومان</span>
                  </div>
                </div>
                {onUpdateMargin && (
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                      <Percent className="w-3.5 h-3.5 text-indigo-400" />
                      <span>تغییر درصد سود:</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={500}
                        step={0.5}
                        value={marginDraft}
                        onChange={(e) => setMarginDraft(Math.max(0, Math.min(500, Number(e.target.value) || 0)))}
                        className="w-16 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-center text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={isSavingMargin || marginDraft === (product.marginPercent ?? 8)}
                        onClick={async () => {
                          setIsSavingMargin(true);
                          try {
                            await onUpdateMargin(product.id, marginDraft);
                          } finally {
                            setIsSavingMargin(false);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold transition"
                      >
                        <Check className="w-3 h-3" />
                        <span>ذخیره</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Fluctuation vs Previous */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs text-slate-400 block mb-1 font-medium">وضعیت آخرین تغییر قیمت:</span>
                {(() => {
                  const diff = product.currentPriceToman - product.lastPriceToman;
                  const isUp = diff > 0;
                  const isDown = diff < 0;
                  const percent = product.lastPriceToman > 0 ? ((diff / product.lastPriceToman) * 100).toFixed(1) : '0';
                  if (isUp) {
                    return (
                      <div className="flex items-center gap-2 text-rose-400 font-bold">
                        <TrendingUp className="w-5 h-5" />
                        <span className="text-base font-mono">+{formatPersianNumber(Math.abs(diff))} تومان (+{toPersianDigits(percent)}٪)</span>
                      </div>
                    );
                  }
                  if (isDown) {
                    return (
                      <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <TrendingDown className="w-5 h-5" />
                        <span className="text-base font-mono">-{formatPersianNumber(Math.abs(diff))} تومان ({toPersianDigits(percent)}٪)</span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center gap-2 text-slate-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span>بدون تغییر نسبت به استعلام قبلی</span>
                    </div>
                  );
                })()}
                <span className="text-[10px] text-slate-500 mt-1">
                  قیمت قبلی: {formatPersianNumber(product.lastPriceToman)} تومان
                </span>
              </div>
            </div>

            {/* Price Stats Grid: High / Low / Average */}
            <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block">بالاترین قیمت دوره</span>
                <span className="text-xs sm:text-sm font-bold text-slate-200 font-mono">
                  {formatPersianNumber(stats.maxPrice)}
                </span>
                <span className="text-[10px] text-slate-500 mr-0.5">ت</span>
              </div>
              <div className="border-x border-slate-800">
                <span className="text-[10px] text-slate-400 block">میانگین قیمت</span>
                <span className="text-xs sm:text-sm font-bold text-indigo-300 font-mono">
                  {formatPersianNumber(stats.avgPrice)}
                </span>
                <span className="text-[10px] text-slate-500 mr-0.5">ت</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">پایین‌ترین قیمت دوره</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-300 font-mono">
                  {formatPersianNumber(stats.minPrice)}
                </span>
                <span className="text-[10px] text-slate-500 mr-0.5">ت</span>
              </div>
            </div>

            {/* Product Barcodes Management */}
            {onUpdateBarcodes && (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <BarcodeAssigner
                  barcodes={product.barcodes || []}
                  onChange={(nextBarcodes) => onUpdateBarcodes(product.id, nextBarcodes)}
                  allProducts={allProducts}
                  currentProductId={product.id}
                  compact
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LOWER SECTION: Solar Hijri Date Range & Price Fluctuation Chart */}
      <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header of Chart Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium mb-1">
              <BarChart2 className="w-4 h-4" />
              <span>پایش اختصاصی و تاریخچه تغییرات قیمت</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white">
              نمودار نوسانات قیمت در تقویم خورشیدی
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              ثبت‌شده از استعلام‌های خودکار ۳ ساعته دیجی‌کالا و نوسانات بازار
            </p>
          </div>

          {/* Persian Date Range Presets */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            <button
              onClick={() => setFilterPreset('7d')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filterPreset === '7d'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ۷ روز اخیر
            </button>
            <button
              onClick={() => setFilterPreset('14d')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filterPreset === '14d'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ۱۴ روز اخیر
            </button>
            <button
              onClick={() => setFilterPreset('30d')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filterPreset === '30d'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ۳۰ روز اخیر
            </button>
            <button
              onClick={() => setFilterPreset('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                filterPreset === 'all'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              کل سوابق ({toPersianDigits(history.length)} رکورد)
            </button>
          </div>
        </div>

        {/* Key Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">بالاترین قیمت در بازه:</span>
            <span className="text-base font-bold text-rose-400 font-mono">
              {formatPersianNumber(stats.maxPrice)}
            </span>
            <span className="text-[10px] text-slate-400 mr-1">تومان</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">پایین‌ترین قیمت در بازه:</span>
            <span className="text-base font-bold text-emerald-400 font-mono">
              {formatPersianNumber(stats.minPrice)}
            </span>
            <span className="text-[10px] text-slate-400 mr-1">تومان</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">میانگین قیمت بازار:</span>
            <span className="text-base font-bold text-slate-200 font-mono">
              {formatPersianNumber(stats.avgPrice)}
            </span>
            <span className="text-[10px] text-slate-400 mr-1">تومان</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-[11px] text-slate-400 block mb-0.5">میزان نوسان کل:</span>
            <span
              className={`text-base font-bold font-mono ${
                stats.fluctuationPercent >= 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {stats.fluctuationPercent >= 0 ? '+' : ''}
              {toPersianDigits(stats.fluctuationPercent)}٪
            </span>
          </div>
        </div>

        {/* Vector SVG Line Chart */}
        <div className="relative rounded-2xl bg-slate-950 p-4 border border-slate-800 overflow-hidden">
          {loadingHistory ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              در حال بارگذاری اطلاعات نوسانات...
            </div>
          ) : filteredHistory.length < 2 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
              سوابق کافی برای رسم نمودار در این بازه وجود ندارد (حداقل ۲ استعلام مورد نیاز است).
            </div>
          ) : (
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-64 overflow-visible"
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal reference grid lines */}
                {[0.2, 0.4, 0.6, 0.8].map((ratio, i) => {
                  const yVal = paddingY + ratio * (chartHeight - paddingY * 2);
                  return (
                    <line
                      key={i}
                      x1={paddingX}
                      y1={yVal}
                      x2={chartWidth - paddingX}
                      y2={yVal}
                      stroke="#334155"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                      opacity="0.4"
                    />
                  );
                })}

                {/* Gradient area beneath curve */}
                <path d={areaPath} fill="url(#chartGradient)" />

                {/* Primary price line */}
                <path
                  d={linePath}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points */}
                {points.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredIndex === idx ? 6 : 3.5}
                    fill={hoveredIndex === idx ? '#38bdf8' : '#818cf8'}
                    stroke="#020617"
                    strokeWidth="2"
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                ))}

                {/* Hover line indicator */}
                {hoveredIndex !== null && points[hoveredIndex] && (
                  <line
                    x1={points[hoveredIndex].x}
                    y1={paddingY}
                    x2={points[hoveredIndex].x}
                    y2={chartHeight - paddingY}
                    stroke="#38bdf8"
                    strokeDasharray="2 2"
                    strokeWidth="1.5"
                  />
                )}
              </svg>

              {/* Tooltip on Hover */}
              {hoveredIndex !== null && points[hoveredIndex] && (
                <div
                  className="absolute z-20 pointer-events-none rounded-xl bg-slate-900 border border-indigo-500/80 p-3 shadow-xl text-xs space-y-1"
                  style={{
                    top: Math.max(10, points[hoveredIndex].y - 80),
                    left: `${(points[hoveredIndex].x / chartWidth) * 100}%`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Clock className="w-3 h-3 text-indigo-400" />
                    <span>
                      {points[hoveredIndex].item.jalaliDate} - ساعت{' '}
                      {points[hoveredIndex].item.jalaliTime}
                    </span>
                  </div>
                  <div className="font-bold text-white font-mono text-sm">
                    {formatPersianNumber(points[hoveredIndex].item.priceToman)} تومان
                  </div>
                  <div className="text-[10px] text-amber-300">
                    قیمت مشتری: {formatPersianNumber(points[hoveredIndex].item.customerQuoteToman)} تومان
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timeline labels at the bottom */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-900">
            <span>قدیمی‌ترین ثبت در بازه ({filteredHistory[0]?.jalaliDate || '-'})</span>
            <span>آخرین قیمت استعلام‌شده ({filteredHistory[filteredHistory.length - 1]?.jalaliDate || '-'})</span>
          </div>
        </div>

        {/* History Table List */}
        <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
          <div className="p-3.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-300">
            <span>جدول ثبت وقایع و نوسانات قیمتی</span>
            <span className="text-slate-400 font-normal">
              تعداد رکوردها: {toPersianDigits(filteredHistory.length)}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 text-xs">
            {filteredHistory
              .slice()
              .reverse()
              .map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 flex items-center justify-between hover:bg-slate-900/50 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="text-slate-300 font-mono">{item.jalaliDate}</span>
                    <span className="text-slate-500 font-mono">ساعت {item.jalaliTime}</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                      {item.source}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-slate-400 text-[11px]">
                      مشتری: {formatPersianNumber(item.customerQuoteToman)} تومان
                    </span>
                    <span className="font-bold text-white font-mono">
                      {formatPersianNumber(item.priceToman)} تومان
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};
