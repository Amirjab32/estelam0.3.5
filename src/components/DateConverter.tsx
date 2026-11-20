import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  ArrowLeftRight,
  Clock,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import {
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
  toEnglishDigits,
  getCurrentPersianDate,
  PERSIAN_MONTHS,
  PERSIAN_WEEKDAYS,
} from '../utils/jalali.ts';

export const DateConverter: React.FC = () => {
  const today = getCurrentPersianDate();
  const now = new Date();

  // Jalali to Gregorian state
  const [jYear, setJYear] = useState<number>(today.year);
  const [jMonth, setJMonth] = useState<number>(today.monthNumber);
  const [jDay, setJDay] = useState<number>(today.day);
  const [convertedGregorian, setConvertedGregorian] = useState<string>('');

  // Gregorian to Jalali state
  const [gYear, setGYear] = useState<number>(now.getFullYear());
  const [gMonth, setGMonth] = useState<number>(now.getMonth() + 1);
  const [gDay, setGDay] = useState<number>(now.getDate());
  const [convertedJalali, setConvertedJalali] = useState<string>('');

  const [copied, setCopied] = useState<string | null>(null);

  // Conversion actions
  const handleConvertJalaliToGregorian = () => {
    const res = jalaliToGregorian(Number(jYear), Number(jMonth), Number(jDay));
    const dateObj = new Date(res.gy, res.gm - 1, res.gd);
    const dayName = dateObj.toLocaleDateString('fa-IR', { weekday: 'long' });
    const formatted = `${res.gy}/${String(res.gm).padStart(2, '0')}/${String(res.gd).padStart(2, '0')} (${dayName})`;
    setConvertedGregorian(formatted);
  };

  const handleConvertGregorianToJalali = () => {
    const res = gregorianToJalali(Number(gYear), Number(gMonth), Number(gDay));
    const mName = PERSIAN_MONTHS[res.jm - 1];
    const formatted = `${toPersianDigits(res.jd)} ${mName} ${toPersianDigits(res.jy)} (${toPersianDigits(res.jy)}/${toPersianDigits(String(res.jm).padStart(2, '0'))}/${toPersianDigits(String(res.jd).padStart(2, '0'))})`;
    setConvertedJalali(formatted);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Days until Next Nowruz (1 Farvardin of next year)
  const nextNowruzGreg = jalaliToGregorian(today.year + 1, 1, 1);
  const nextNowruzDate = new Date(nextNowruzGreg.gy, nextNowruzGreg.gm - 1, nextNowruzGreg.gd);
  const diffTime = nextNowruzDate.getTime() - now.getTime();
  const daysUntilNowruz = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

  // Calculate day of the year in Jalali
  const dayOfYear =
    today.monthNumber <= 6
      ? (today.monthNumber - 1) * 31 + today.day
      : 186 + (today.monthNumber - 7) * 30 + today.day;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-200 text-xs font-medium mb-1">
            <CalendarIcon className="w-4 h-4" />
            <span>تقویم جامع خورشیدی</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">
            امروز {today.fullDateString}
          </h2>
          <p className="text-xs text-indigo-100/90 mt-1">
            معادل میلادی: {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-5 py-3 rounded-xl border border-white/20">
          <div className="text-center">
            <span className="block text-xs text-indigo-200">روز از سال</span>
            <span className="text-lg font-bold">{toPersianDigits(dayOfYear)}</span>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div className="text-center">
            <span className="block text-xs text-indigo-200">تا نوروز {toPersianDigits(today.year + 1)}</span>
            <span className="text-lg font-bold">{toPersianDigits(daysUntilNowruz)} روز</span>
          </div>
        </div>
      </div>

      {/* 2-Column Converters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Converter 1: Jalali to Gregorian */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <span>تبدیل تاریخ شمسی به میلادی</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
              خورشیدی ◄ میلادی
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                روز
              </label>
              <select
                value={jDay}
                onChange={(e) => setJDay(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {toPersianDigits(d)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                ماه
              </label>
              <select
                value={jMonth}
                onChange={(e) => setJMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PERSIAN_MONTHS.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {m} ({toPersianDigits(idx + 1)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                سال
              </label>
              <input
                type="number"
                value={jYear}
                onChange={(e) => setJYear(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            onClick={handleConvertJalaliToGregorian}
            className="w-full mt-4 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>محاسبه تاریخ میلادی</span>
          </button>

          {convertedGregorian && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  نتیجه تبدیل:
                </span>
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white" dir="ltr">
                  {convertedGregorian}
                </span>
              </div>
              <button
                onClick={() => handleCopy(convertedGregorian, 'greg')}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                aria-label="کپی تاریخ"
              >
                {copied === 'greg' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Converter 2: Gregorian to Jalali */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>تبدیل تاریخ میلادی به شمسی</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-medium">
              میلادی ◄ خورشیدی
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Day (روز)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={gDay}
                onChange={(e) => setGDay(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Month (ماه)
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={gMonth}
                onChange={(e) => setGMonth(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Year (سال)
              </label>
              <input
                type="number"
                value={gYear}
                onChange={(e) => setGYear(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            onClick={handleConvertGregorianToJalali}
            className="w-full mt-4 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>محاسبه تاریخ خورشیدی</span>
          </button>

          {convertedJalali && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  نتیجه تبدیل:
                </span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  {convertedJalali}
                </span>
              </div>
              <button
                onClick={() => handleCopy(convertedJalali, 'jalali')}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                aria-label="کپی تاریخ خورشیدی"
              >
                {copied === 'jalali' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Persian Months Reference Sheet */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="font-bold text-slate-900 dark:text-white text-base mb-3 flex items-center gap-2">
          <span>📅</span>
          <span>ماه‌های سال خورشیدی و فصول</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50">
            <span className="font-bold text-emerald-700 dark:text-emerald-300 block mb-1">
              🌱 بهار (۳۱ روزه)
            </span>
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-300">
              <li>۱. فروردین</li>
              <li>۲. اردیبهشت</li>
              <li>۳. خرداد</li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50">
            <span className="font-bold text-amber-700 dark:text-amber-300 block mb-1">
              ☀️ تابستان (۳۱ روزه)
            </span>
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-300">
              <li>۴. تیر</li>
              <li>۵. مرداد</li>
              <li>۶. شهریور</li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/50">
            <span className="font-bold text-orange-700 dark:text-orange-300 block mb-1">
              🍂 پاییز (۳۰ روزه)
            </span>
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-300">
              <li>۷. مهر</li>
              <li>۸. آبان</li>
              <li>۹. آذر</li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50">
            <span className="font-bold text-cyan-700 dark:text-cyan-300 block mb-1">
              ❄️ زمستان (۳۰ یا ۲۹ روزه)
            </span>
            <ul className="space-y-0.5 text-slate-700 dark:text-slate-300">
              <li>۱۰. دی</li>
              <li>۱۱. بهمن</li>
              <li>۱۲. اسفند (کبیسه ۳۰ روز)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
