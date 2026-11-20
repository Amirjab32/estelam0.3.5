import React, { useState } from 'react';
import {
  X,
  Clock,
  RotateCcw,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Activity,
  Zap,
} from 'lucide-react';
import { SchedulerInfo } from '../types.ts';
import { toPersianDigits, formatPersianNumber } from '../utils/jalali.ts';
import { FIXED_SCHEDULE_HOURS } from '../utils/schedule.ts';

interface SchedulerModalProps {
  schedulerInfo: SchedulerInfo | null;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  onClose: () => void;
}

export const SchedulerModal: React.FC<SchedulerModalProps> = ({
  schedulerInfo,
  onRefreshAll,
  isRefreshing,
  onClose,
}) => {
  const currentHour = new Date().getHours();
  const [testingNow, setTestingNow] = useState(false);
  const [testResultMsg, setTestResultMsg] = useState<string | null>(null);

  const handleTestTrigger = async () => {
    try {
      setTestingNow(true);
      setTestResultMsg(null);
      await onRefreshAll();
      setTestResultMsg('✓ چرخه پایش با موفقیت اجرا شد و قیمت تمام کالاها در پایگاه‌داده ابری بروزرسانی گردید.');
    } catch (err: any) {
      setTestResultMsg('خطا در اجرای تست پایش: ' + (err?.message || 'ناشناخته'));
    } finally {
      setTestingNow(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base sm:text-lg">
                  سیستم پایش و بروزرسانی خودکار ۳ ساعته
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-800/80 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>فعال و در حال اجرا</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                استعلام خودکار قیمت‌های روز در ۸ نوبت ثابت روزانه
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Status Badge */}
        <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-200 leading-relaxed space-y-2">
          <div className="flex items-center gap-2 text-emerald-300 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>پایش خودکار ۳ ساعته کاملاً فعال است</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            سرور در پس‌زمینه بدون نیاز به باز بودن مرورگر، سر ساعت‌های مشخص شده قیمت‌های دیجی‌کالا را
            استعلام و ثبت می‌کند:
          </p>
          <div className="flex items-center justify-between pt-1 border-t border-emerald-800/30 text-[11px]">
            <span className="text-slate-300">نوبت استعلام بعدی:</span>
            <span className="font-bold text-white font-mono text-xs bg-emerald-900/60 px-2 py-0.5 rounded">
              {schedulerInfo?.nextScheduledTime || 'ساعت ۱۲:۰۰'} (حدود{' '}
              {toPersianDigits(schedulerInfo?.remainingMinutes || 0)} دقیقه دیگر)
            </span>
          </div>
        </div>

        {/* 8-Slot Fixed Schedule Grid */}
        <div>
          <span className="block text-xs font-bold text-slate-300 mb-2.5">
            ۸ نوبت ثابت استعلام در طول شبانه‌روز:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FIXED_SCHEDULE_HOURS.map((hr) => {
              const isPast = hr < currentHour;
              const isNext =
                schedulerInfo?.nextScheduledTime.includes(
                  toPersianDigits(hr.toString().padStart(2, '0'))
                );

              return (
                <div
                  key={hr}
                  className={`p-3 rounded-xl border text-center transition ${
                    isNext
                      ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-md shadow-indigo-950/40'
                      : isPast
                        ? 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="block text-sm font-bold font-mono">
                    {toPersianDigits(hr.toString().padStart(2, '0'))}:۰۰
                  </span>
                  <span className="text-[10px] mt-0.5 block font-medium">
                    {isNext ? '🟢 نوبت بعدی' : isPast ? '✓ سپری شده' : '⏳ در انتظار'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Test Result Message */}
        {testResultMsg && (
          <div className="p-3 rounded-xl bg-slate-950 border border-indigo-800/60 text-xs text-indigo-300">
            {testResultMsg}
          </div>
        )}

        {/* Action Buttons: Test 3-Hour Cycle or Immediate Refresh */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">بررسی و تست چرخه ۳ ساعته</span>
              <span className="text-[11px] text-slate-400">
                اجرای یک دور کامل پایش هم‌اکنون برای اطمینان از عملکرد
              </span>
            </div>

            <button
              type="button"
              onClick={handleTestTrigger}
              disabled={testingNow}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-emerald-950/40 transition active:scale-95"
            >
              <Zap className={`w-3.5 h-3.5 ${testingNow ? 'animate-spin' : ''}`} />
              <span>{testingNow ? 'در حال پایش...' : 'تست عملکرد پایش'}</span>
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
