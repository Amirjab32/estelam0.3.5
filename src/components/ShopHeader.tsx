import React from 'react';
import {
  RotateCcw,
  Plus,
  Clock,
  Laptop,
  Cloud,
  HardDrive,
  Menu,
  Shield,
  ScanBarcode,
  FileText,
} from 'lucide-react';
import { toPersianDigits } from '../utils/jalali.ts';
import {
  CloudflareSyncState,
  ConnectionHealthState,
  SchedulerInfo,
  StorageMode,
} from '../types.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface ShopHeaderProps {
  schedulerInfo: SchedulerInfo | null;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  onOpenAddModal: () => void;
  onOpenBulkInquiry: () => void;
  isBulkInquiryOpen?: boolean;
  onOpenBarcodeScanner: () => void;
  onOpenSchedulerModal: () => void;
  onOpenDrawer: () => void;
  productsCount: number;
  storageMode: StorageMode;
  connectionHealth?: ConnectionHealthState;
  userEmail?: string | null;
  isSyncingCloud?: boolean;
  cloudflareSyncState?: CloudflareSyncState;
}

export const ShopHeader: React.FC<ShopHeaderProps> = ({
  schedulerInfo,
  onRefreshAll,
  isRefreshing,
  onOpenAddModal,
  onOpenBulkInquiry,
  isBulkInquiryOpen = false,
  onOpenBarcodeScanner,
  onOpenSchedulerModal,
  onOpenDrawer,
  productsCount,
  storageMode,
  connectionHealth = 'healthy',
  userEmail,
  isSyncingCloud = false,
  cloudflareSyncState = 'idle',
}) => {
  const modeLabel =
    storageMode === 'firebase'
      ? 'فایربیس ابری'
      : storageMode === 'cloudflare'
        ? 'کلادفلر (بدون فیلترشکن)'
        : 'آفلاین محلی';

  const ModeIcon =
    storageMode === 'firebase'
      ? Cloud
      : storageMode === 'cloudflare'
        ? Shield
        : HardDrive;

  return (
    <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-3 gap-3">
          {/* Right Side (RTL start): Hamburger Menu + Brand Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="باز کردن منوی بکاپ و تنظیمات ابر"
              title="منوی همبرگری: بکاپ JSON و تغییر بین فایربیس و کلادفلر"
              className="w-11 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/60 flex items-center justify-center text-slate-200 hover:text-white transition shrink-0 active:scale-95"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 hidden sm:flex items-center justify-center text-indigo-400 shrink-0">
              <Laptop className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                سیستم استعلام و پایش قیمت فروشگاه کامپیوتر
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 mt-0.5 tabular-nums">
                <span className="text-emerald-400 font-medium">
                  {toPersianDigits(productsCount)} کالا
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onOpenDrawer}
                  className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 transition"
                >
                  <ModeIcon className="w-3 h-3" />
                  <span>{modeLabel}</span>
                  {userEmail && storageMode === 'firebase' ? (
                    <span className="hidden lg:inline text-slate-400">({userEmail})</span>
                  ) : null}
                </button>
                {isSyncingCloud || cloudflareSyncState === 'syncing' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-cyan-400">در حال همگام‌سازی کلادفلر...</span>
                  </>
                ) : cloudflareSyncState === 'synced' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenDrawer}
                      className="text-emerald-400 hover:text-emerald-300 transition font-medium"
                    >
                      کلادفلر همگام
                    </button>
                  </>
                ) : cloudflareSyncState === 'pin_required' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenDrawer}
                      className="text-amber-300 hover:text-amber-200 transition font-medium"
                    >
                      کلادفلر قفل (نیاز به رمز)
                    </button>
                  </>
                ) : cloudflareSyncState === 'kv_missing' ||
                  cloudflareSyncState === 'error' ||
                  cloudflareSyncState === 'unreachable' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={onOpenDrawer}
                      className="text-rose-300 hover:text-rose-200 transition font-medium"
                    >
                      {cloudflareSyncState === 'kv_missing'
                        ? 'کلادفلر بدون KV'
                        : 'کلادفلر غیرفعال'}
                    </button>
                  </>
                ) : connectionHealth === 'degraded' && storageMode !== 'offline' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300">در حال بررسی مجدد اتصال...</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Left Side (RTL end): Action Toolbar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 md:pb-0 shrink-0">
            {/* Next 3-hour sync button */}
            <button
              type="button"
              onClick={onOpenSchedulerModal}
              title="مشاهده زمان‌بندی پایش خودکار ۳ ساعته"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800/90 text-slate-300 text-xs border border-slate-800 hover:border-slate-700 transition whitespace-nowrap shrink-0"
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">پایش بعدی:</span>
              <span className="font-semibold text-white tabular-nums">
                {schedulerInfo?.nextScheduledTime || 'ساعت ۱۲:۰۰'}
              </span>
            </button>

            {/* Manual Refresh All Button */}
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'در حال استعلام...' : 'بروزرسانی قیمت‌ها'}</span>
            </button>

            {/* Discreet PWA Install button when browser prompts install */}
            <PWAInstallButton compact />

            {/* Bulk TXT Price Inquiry Button */}
            <button
              type="button"
              onClick={onOpenBulkInquiry}
              title="استعلام گروهی قیمت از فایل متنی (.txt)"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition whitespace-nowrap shrink-0 active:scale-95 ${
                isBulkInquiryOpen
                  ? 'bg-cyan-600 border-cyan-500 text-white shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 text-cyan-300 hover:text-white border-cyan-500/40 hover:border-cyan-400'
              }`}
            >
              <FileText className={`w-4 h-4 ${isBulkInquiryOpen ? 'text-white' : 'text-cyan-400'}`} />
              <span>استعلام گروهی</span>
            </button>

            {/* Enterprise Barcode Scanner Hub Button */}
            <button
              type="button"
              onClick={onOpenBarcodeScanner}
              title="اسکن بارکد با دوربین موبایل یا بارکدخوان سیستم"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/40 hover:border-indigo-400 transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <ScanBarcode className="w-4 h-4 text-indigo-400" />
              <span>بارکدخوان</span>
            </button>

            {/* Add New Product Button */}
            <button
              type="button"
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن کالا</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
