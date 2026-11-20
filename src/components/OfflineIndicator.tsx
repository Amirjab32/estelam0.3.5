import React from 'react';
import { WifiOff, HardDrive, RefreshCw } from 'lucide-react';
import { ConnectionHealthState, StorageMode } from '../types.ts';

interface OfflineIndicatorProps {
  isBrowserOnline: boolean;
  storageMode: StorageMode;
  connectionHealth?: ConnectionHealthState;
  isInitialChecking?: boolean;
  isNativeAndroid: boolean;
  isElectronDesktop: boolean;
  cloudflareKvMissing?: boolean;
  onRetryConnection?: () => void;
  isRetrying?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  isBrowserOnline,
  storageMode,
  connectionHealth = 'healthy',
  isInitialChecking = false,
  isNativeAndroid,
  isElectronDesktop,
  cloudflareKvMissing = false,
  onRetryConnection,
  isRetrying = false,
}) => {
  // Never flash the Net-Melli banner during initial startup checks or transient 'degraded' retries
  if (isInitialChecking) return null;
  if (isBrowserOnline && storageMode !== 'offline') return null;
  if (isBrowserOnline && connectionHealth === 'degraded') return null;

  return (
    <div
      role="status"
      className="bg-amber-950/80 border-b border-amber-800/60 text-amber-100 px-4 py-2 text-xs"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isBrowserOnline ? (
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>
            {!isBrowserOnline
              ? 'اتصال اینترنت قطع است — برنامه با حافظه کش آفلاین کار می‌کند و تغییرات پس از وصل اینترنت همگام می‌شوند.'
              : cloudflareKvMissing
                ? 'حافظه Cloudflare KV در تنظیمات Bindings این آدرس متصل نیست — کالاهای جدید فعلاً فقط در همین مرورگر ذخیره می‌شوند و در صفحه ناشناس دیده نمی‌شوند. از منوی همبرگری راهنمای اتصال KV (برای Production و Preview) را ببینید.'
                : isNativeAndroid
                  ? 'حالت نت ملی / آفلاین ابری: استعلام قیمت مستقیماً از دیجی‌کالا داخل اپ اندروید انجام می‌شود و پس از بازگشت اینترنت به فایربیس و کلادفلر ادغام خواهد شد.'
                  : isElectronDesktop
                    ? 'حالت نت ملی / لوکال: استعلام مستقیم از دیجی‌کالا و زمان‌بند ۳ ساعته روی سرور داخلی ویندوز فعال است؛ پس از وصل اینترنت به ابر ادغام می‌شود.'
                    : 'حالت آفلاین محلی فعال است؛ تغییرات شما روی همین دستگاه ذخیره می‌شود و در پس‌زمینه با اولین اتصال پایدار به‌صورت خودکار همگام‌سازی خواهد شد.'}
          </span>
        </div>

        {onRetryConnection && (
          <button
            type="button"
            onClick={onRetryConnection}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-900/70 hover:bg-amber-800/80 disabled:opacity-50 border border-amber-700/60 text-[11px] font-bold text-amber-100 transition shrink-0"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'در حال بررسی...' : 'بررسی مجدد اتصال'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
