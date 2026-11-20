import React from 'react';
import {
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  LineChart,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { ProductItem } from '../types.ts';
import { formatPersianNumber, toPersianDigits } from '../utils/jalali.ts';

export type ViewLayout = 'grid-4' | 'grid-3' | 'list' | 'compact' | 'large';

interface ProductCardProps {
  product: ProductItem;
  layout?: ViewLayout;
  onSelect: (product: ProductItem) => void;
  onDelete: (id: string, name: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  layout = 'grid-4',
  onSelect,
  onDelete,
}) => {
  // Calculate price difference vs previous check
  const priceDiff = product.currentPriceToman - product.lastPriceToman;
  const isUp = priceDiff > 0;
  const isDown = priceDiff < 0;
  const percentChange =
    product.lastPriceToman > 0
      ? ((priceDiff / product.lastPriceToman) * 100).toFixed(1)
      : '0';

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(product.id, product.name);
  };

  const handleOpenSource = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.sourceUrl) {
      window.open(product.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  };

  /* ========================================================
     1. LIST / ROW VIEW (نمای خطی و سطری)
     ======================================================== */
  if (layout === 'list') {
    return (
      <div
        onClick={() => onSelect(product)}
        className="group relative rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/60 p-3 sm:p-4 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-950/20 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4"
      >
        {/* Right side: Image + Title + Category */}
        <div className="flex items-center gap-3.5 flex-1 min-w-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center group-hover:border-slate-700 transition">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700/60">
                {product.category}
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                موجود در دیجی‌کالا
              </span>
            </div>
            <h3 className="font-bold text-sm sm:text-base text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1 leading-snug">
              {product.name}
            </h3>
            {product.notes && (
              <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                {product.notes}
              </p>
            )}
          </div>
        </div>

        {/* Center: Fluctuation Badge */}
        <div className="flex items-center gap-3 md:justify-center md:px-4">
          {isUp && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-950/60 px-2.5 py-1 rounded-lg border border-rose-800/50">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+{toPersianDigits(percentChange)}٪ ({formatPersianNumber(priceDiff)} ت)</span>
            </span>
          )}
          {isDown && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-800/50">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>{toPersianDigits(percentChange)}٪ ({formatPersianNumber(Math.abs(priceDiff))} ت)</span>
            </span>
          )}
          {!isUp && !isDown && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-lg">
              <Minus className="w-3.5 h-3.5" />
              <span>بدون تغییر</span>
            </span>
          )}
        </div>

        {/* Left: Price & Action Buttons */}
        <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800/60">
          <div className="text-right md:text-left">
            <span className="text-[10px] text-slate-400 block">
              دیجی‌کالا: {formatPersianNumber(product.currentPriceToman)} ت
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] text-indigo-400 font-bold ml-1">
                فروش ({toPersianDigits(product.marginPercent || 0)}٪ سود):
              </span>
              <span className="text-base sm:text-lg font-black text-emerald-400 font-mono tracking-tight">
                {formatPersianNumber(product.customerQuoteToman || product.currentPriceToman)}
              </span>
              <span className="text-xs font-medium text-emerald-500">تومان</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(product)}
              title="مشاهده نمودار نوسانات و جزئیات"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600 hover:text-white text-xs font-medium border border-indigo-500/30 transition active:scale-95"
            >
              <LineChart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تحلیل و نمودار</span>
            </button>

            {product.sourceUrl && (
              <button
                type="button"
                onClick={handleOpenSource}
                title="مشاهده کالا در دیجی‌کالا"
                className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleDelete}
              title="حذف کالا"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ========================================================
     2. COMPACT / MINI VIEW (نمای مینیاتوری و فشرده)
     ======================================================== */
  if (layout === 'compact') {
    return (
      <div
        onClick={() => onSelect(product)}
        className="group relative rounded-xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/60 p-2.5 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-950/20 cursor-pointer flex flex-col justify-between"
      >
        <div>
          {/* Top: Image */}
          <div className="w-full aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-800 mb-2 relative group-hover:border-slate-700 transition">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
              }}
            />
            {/* Tiny fluctuation tag */}
            {isUp && (
              <span className="absolute top-1 right-1 text-[9px] font-bold text-rose-300 bg-rose-950/80 px-1 rounded border border-rose-800/60">
                +{toPersianDigits(percentChange)}٪
              </span>
            )}
            {isDown && (
              <span className="absolute top-1 right-1 text-[9px] font-bold text-emerald-300 bg-emerald-950/80 px-1 rounded border border-emerald-800/60">
                {toPersianDigits(percentChange)}٪
              </span>
            )}
          </div>

          <span className="text-[10px] text-slate-400 block truncate">
            {product.category}
          </span>
          <h3 className="font-bold text-xs text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1 leading-snug mt-0.5">
            {product.name}
          </h3>
        </div>

        {/* Price & Action */}
        <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <div className="text-right">
            <span className="text-[9px] text-slate-400 block">
              خرید: {formatPersianNumber(product.currentPriceToman)}
            </span>
            <span className="text-xs font-black text-emerald-400 font-mono block">
              {formatPersianNumber(product.customerQuoteToman || product.currentPriceToman)} ت
            </span>
            <span className="text-[8px] text-indigo-400 block -mt-0.5">
              سود {toPersianDigits(product.marginPercent || 0)}٪
            </span>
          </div>

          <div className="flex items-center gap-1">
            {product.sourceUrl && (
              <button
                type="button"
                onClick={handleOpenSource}
                title="دیجی‌کالا"
                className="p-1 rounded text-slate-400 hover:text-cyan-400 transition"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              title="حذف"
              className="p-1 rounded text-slate-400 hover:text-rose-400 transition"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ========================================================
     3. LARGE SHOWCASE VIEW (نمای کارت‌های بزرگ و با جزئیات)
     ======================================================== */
  if (layout === 'large') {
    return (
      <div
        onClick={() => onSelect(product)}
        className="group relative rounded-3xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/60 p-5 sm:p-6 transition-all duration-200 hover:shadow-2xl hover:shadow-indigo-950/20 cursor-pointer flex flex-col justify-between"
      >
        <div>
          {/* Top Bar */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs px-3 py-1 rounded-lg bg-slate-800 text-slate-300 font-semibold border border-slate-700/60">
              {product.category}
            </span>

            <div className="flex items-center gap-2">
              {isUp && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-950/60 px-3 py-1 rounded-lg border border-rose-800/50">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>+{toPersianDigits(percentChange)}٪ نوسان صعودی</span>
                </span>
              )}
              {isDown && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-lg border border-emerald-800/50">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>{toPersianDigits(percentChange)}٪ نوسان کاهشی</span>
                </span>
              )}
              {!isUp && !isDown && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-800/60 px-3 py-1 rounded-lg">
                  <Minus className="w-3.5 h-3.5" />
                  <span>قیمت بدون نوسان</span>
                </span>
              )}
            </div>
          </div>

          {/* Product Big Row */}
          <div className="flex flex-col sm:flex-row gap-4 mb-5">
            <div className="w-full sm:w-32 h-32 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center relative group-hover:border-slate-700 transition">
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
                }}
              />
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <h3 className="font-extrabold text-base sm:text-lg text-slate-100 group-hover:text-indigo-300 transition-colors leading-snug line-clamp-2">
                  {product.name}
                </h3>
                {product.notes && (
                  <p className="text-xs text-slate-400 mt-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                    <strong>یادداشت:</strong> {product.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>پایش هوشمند خودکار هر ۳ ساعت یکبار</span>
              </div>
            </div>
          </div>

          {/* Big Real Price Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">قیمت مرجع دیجی‌کالا:</span>
              <span className="font-mono text-slate-300 font-semibold">
                {formatPersianNumber(product.currentPriceToman)} تومان
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-400 block">قیمت نهایی فروش مغازه:</span>
                <span className="text-[11px] text-indigo-400">(با {toPersianDigits(product.marginPercent || 0)}٪ سود فروشگاه)</span>
              </div>
              <div className="text-left">
                <span className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono tracking-tight">
                  {formatPersianNumber(product.customerQuoteToman || product.currentPriceToman)}
                </span>
                <span className="text-xs sm:text-sm font-semibold text-emerald-500 mr-1.5">تومان</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => onSelect(product)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition shadow-md shadow-indigo-600/20 active:scale-95"
          >
            <LineChart className="w-4 h-4" />
            <span>مشاهده تاریخچه و نمودار</span>
          </button>

          <div className="flex items-center gap-2">
            {product.sourceUrl && (
              <button
                type="button"
                onClick={handleOpenSource}
                title="مشاهده کالا در دیجی‌کالا"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-300 hover:text-cyan-400 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">مشاهده در دیجی‌کالا</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDelete}
              title="حذف کالا"
              className="p-2.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/40 transition"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ========================================================
     4. STANDARD GRID (۴ تایی و ۳ تایی در سطر)
     ======================================================== */
  return (
    <div
      onClick={() => onSelect(product)}
      className="group relative rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/60 p-4 transition-all duration-200 hover:shadow-xl hover:shadow-indigo-950/20 cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Top bar: Category & Fluctuation */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 font-medium border border-slate-700/60 truncate max-w-[160px]">
            {product.category}
          </span>

          <div className="flex items-center gap-1.5">
            {isUp && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/50">
                <TrendingUp className="w-3 h-3" />
                <span>+{toPersianDigits(percentChange)}٪</span>
              </span>
            )}
            {isDown && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                <TrendingDown className="w-3 h-3" />
                <span>{toPersianDigits(percentChange)}٪</span>
              </span>
            )}
            {!isUp && !isDown && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">
                <Minus className="w-3 h-3" />
                <span>ثابت</span>
              </span>
            )}
          </div>
        </div>

        {/* Product Image & Title Row */}
        <div className="flex gap-3 mb-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex-shrink-0 flex items-center justify-center relative group-hover:border-slate-700 transition">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';
              }}
            />
          </div>

          <div className="min-w-0 flex-1 flex flex-col justify-between">
            <h3 className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug">
              {product.name}
            </h3>

            {product.notes ? (
              <span className="text-[11px] text-slate-400 line-clamp-1 mt-1">
                {product.notes}
              </span>
            ) : null}
          </div>
        </div>

        {/* Real Product Price Box (Hero) */}
        <div className="rounded-xl bg-slate-950/90 p-3.5 border border-slate-800/80 mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">قیمت مرجع دیجی‌کالا:</span>
            <span className="font-mono text-slate-300 font-bold text-[11px]">
              {formatPersianNumber(product.currentPriceToman)} ت
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-400 block">
                قیمت فروش مغازه:
              </span>
              <span className="text-[10px] text-indigo-400 block">
                ({toPersianDigits(product.marginPercent || 0)}٪ سود فروشگاه)
              </span>
            </div>
            <div className="text-left">
              <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                {formatPersianNumber(product.customerQuoteToman || product.currentPriceToman)}
              </span>
              <span className="text-xs text-emerald-500 mr-1">تومان</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium py-1 px-2 rounded-lg hover:bg-indigo-950/40 transition"
        >
          <LineChart className="w-3.5 h-3.5" />
          <span>تحلیل و نمودار</span>
        </button>

        <div className="flex items-center gap-1">
          {product.sourceUrl && (
            <button
              type="button"
              onClick={handleOpenSource}
              title="مشاهده صفحه در دیجی‌کالا"
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            title="حذف کالا"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
