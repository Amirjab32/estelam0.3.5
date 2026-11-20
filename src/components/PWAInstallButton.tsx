import React from 'react';
import { Download, CheckCircle2, Smartphone, Monitor } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isNativeAndroid, isElectronDesktop, installApp } =
    usePWAInstall();

  if (isElectronDesktop) {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs font-semibold">
        <Monitor className="w-3.5 h-3.5 shrink-0" />
        <span>در حال اجرا به صورت برنامه ویندوز (EXE) — پایش ۳ ساعته پس‌زمینه فعال است</span>
      </div>
    );
  }

  if (isNativeAndroid) {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs font-semibold">
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>در حال اجرا در اپ اندروید — استعلام مستقیم دیجی‌کالا فعال است</span>
      </div>
    );
  }

  if (isInstalled) {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>برنامه روی دستگاه شما نصب شده است</span>
      </div>
    );
  }

  if (!isInstallable) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      className={
        compact
          ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 border border-indigo-500/40 text-xs font-semibold transition whitespace-nowrap shrink-0 active:scale-95'
          : 'w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition active:scale-95'
      }
      title="نصب برنامه به عنوان اپلیکیشن مستقل و پشتیبانی آفلاین"
    >
      <Download className="w-3.5 h-3.5 shrink-0" />
      <span>نصب برنامه (PWA آفلاین)</span>
    </button>
  );
};
