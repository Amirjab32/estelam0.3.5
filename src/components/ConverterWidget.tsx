import React, { useState } from 'react';
import {
  Coins,
  Scale,
  ArrowRightLeft,
  Copy,
  Check,
  Calculator,
} from 'lucide-react';
import {
  formatPersianNumber,
  toPersianDigits,
  toEnglishDigits,
} from '../utils/jalali.ts';

/**
 * Convert number to Persian words (up to trillions)
 */
function numberToPersianWords(num: number): string {
  if (num === 0) return 'صفر';
  if (num < 0) return 'منفی ' + numberToPersianWords(Math.abs(num));

  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahha = [
    'ده',
    'یازده',
    'دوازده',
    'سیزده',
    'چهارده',
    'پانزده',
    'شانزده',
    'هفده',
    'هجده',
    'نوزده',
  ];
  const dahgan = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const sadgan = [
    '',
    'یکصد',
    'دویست',
    'سیصد',
    'چهارصد',
    'پانصد',
    'ششصد',
    'هفتصد',
    'هشتصد',
    'نهصد',
  ];
  const scale = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

  const parts: string[] = [];
  let scaleIndex = 0;

  let n = Math.floor(num);
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const cSad = Math.floor(chunk / 100);
      const cRem = chunk % 100;
      const cDah = Math.floor(cRem / 10);
      const cYek = cRem % 10;

      const chunkWords: string[] = [];
      if (cSad > 0) chunkWords.push(sadgan[cSad]);

      if (cRem >= 10 && cRem <= 19) {
        chunkWords.push(dahha[cRem - 10]);
      } else {
        if (cDah > 0) chunkWords.push(dahgan[cDah]);
        if (cYek > 0) chunkWords.push(yekan[cYek]);
      }

      const chunkStr = chunkWords.join(' و ');
      const withScale = scale[scaleIndex] ? `${chunkStr} ${scale[scaleIndex]}` : chunkStr;
      parts.unshift(withScale);
    }
    n = Math.floor(n / 1000);
    scaleIndex++;
  }

  return parts.join(' و ');
}

export const ConverterWidget: React.FC = () => {
  // Currency state
  const [currencyInput, setCurrencyInput] = useState<string>('500000');
  const [currencyType, setCurrencyType] = useState<'toman' | 'rial'>('toman');
  const [copied, setCopied] = useState<boolean>(false);

  // Gold / Mesghal state
  const [goldGrams, setGoldGrams] = useState<string>('4.6083');
  const [goldMesghals, setGoldMesghals] = useState<string>('1');

  // Currency calculations
  const rawNum = Number(toEnglishDigits(currencyInput)) || 0;
  const tomanValue = currencyType === 'toman' ? rawNum : Math.floor(rawNum / 10);
  const rialValue = currencyType === 'rial' ? rawNum : rawNum * 10;
  const persianWords = rawNum > 0 ? numberToPersianWords(tomanValue) + ' تومان' : 'صفر تومان';

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGramsChange = (val: string) => {
    setGoldGrams(val);
    const num = parseFloat(toEnglishDigits(val)) || 0;
    setGoldMesghals((num / 4.6083).toFixed(4));
  };

  const handleMesghalChange = (val: string) => {
    setGoldMesghals(val);
    const num = parseFloat(toEnglishDigits(val)) || 0;
    setGoldGrams((num * 4.6083).toFixed(4));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white p-6 shadow-md">
        <div className="flex items-center gap-2 text-amber-200 text-xs font-medium mb-1">
          <Coins className="w-4 h-4" />
          <span>تبدیل مالی و مقیاس‌های کاربردی</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold">
          تبدیل تومان، ریال و واحدهای سنتی و مدرن
        </h2>
        <p className="text-xs text-amber-100/90 mt-1">
          محاسبه دقیق تومان به ریال با نوشتن حروف فارسی و تبدیل مثقال به گرم.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Toman & Rial Card */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>تبدیل تومان ◄► ریال و حروف‌نویسی</span>
            </h3>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                مبلغ ورودی
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCurrencyType('toman')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    currencyType === 'toman'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  به تومان
                </button>
                <button
                  type="button"
                  onClick={() => setCurrencyType('rial')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    currencyType === 'rial'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  به ریال
                </button>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value)}
                placeholder="مثلاً ۵۰۰,۰۰۰"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-base font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
              />
            </div>
          </div>

          {/* Results Block */}
          <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/40 p-4 border border-amber-200/70 dark:border-amber-800/40 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">معادل تومان:</span>
              <span className="font-bold text-amber-900 dark:text-amber-200 font-mono text-base">
                {formatPersianNumber(tomanValue)} تومان
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">معادل ریال:</span>
              <span className="font-bold text-amber-900 dark:text-amber-200 font-mono text-base">
                {formatPersianNumber(rialValue)} ریال
              </span>
            </div>

            <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">به حروف:</span>
                <button
                  onClick={() => handleCopy(persianWords)}
                  className="text-xs text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>کپی متن</span>
                </button>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                {persianWords}
              </p>
            </div>
          </div>
        </div>

        {/* Mesghal & Grams Calculator */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-500" />
              <span>محاسبه مثقال و گرم طلا</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              ۱ مثقال = ۴.۶۰۸۳ گرم
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                وزن به گرم
              </label>
              <input
                type="text"
                value={goldGrams}
                onChange={(e) => handleGramsChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div className="flex justify-center">
              <span className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                <ArrowRightLeft className="w-4 h-4" />
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                وزن به مثقال (صیرفی)
              </label>
              <input
                type="text"
                value={goldMesghals}
                onChange={(e) => handleMesghalChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 p-3.5 border border-indigo-200/60 dark:border-indigo-800/50 text-xs text-indigo-900 dark:text-indigo-200">
              <p className="leading-relaxed">
                <strong>نکته زرگری:</strong> مظنه یا قیمت یک مثقال طلای ۱۷ عیار (۷۰۵) است، در حالی که طلای رایج بازار ایران ۱۸ عیار (۷۵۰) محاسبه می‌شود.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
