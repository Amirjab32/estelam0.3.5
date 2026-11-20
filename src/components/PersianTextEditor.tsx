import React, { useState } from 'react';
import {
  Wand2,
  Copy,
  Check,
  RotateCcw,
  AlignRight,
  Sparkles,
  FileText,
} from 'lucide-react';
import {
  cleanPersianText,
  toPersianDigits,
  toEnglishDigits,
} from '../utils/jalali.ts';

export const PersianTextEditor: React.FC = () => {
  const sampleText =
    'اين يك متن آزمايشي است كه با كيبورد هاي مختلف تايپ شده و داراي غلط هاي تايپي مي باشد. اعداد مانند 12345 و ي ها و ك ها اصلاح مي شوند.';

  const [text, setText] = useState<string>(sampleText);
  const [copied, setCopied] = useState<boolean>(false);
  const [lastAction, setLastAction] = useState<string>('');

  // Statistics
  const charCount = text.length;
  const charNoSpaceCount = text.replace(/\s/g, '').length;
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 180));

  const handleCleanHalfSpaces = () => {
    const cleaned = cleanPersianText(text);
    setText(cleaned);
    setLastAction('نیم‌فاصله‌ها و حروف عربی (ي و ك) اصلاح شد');
  };

  const handleConvertToPersianDigits = () => {
    setText(toPersianDigits(text));
    setLastAction('تمامی اعداد به ارقام فارسی تبدیل شدند');
  };

  const handleConvertToEnglishDigits = () => {
    setText(toEnglishDigits(text));
    setLastAction('تمامی اعداد به ارقام انگلیسی تبدیل شدند');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setText('');
    setLastAction('');
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-teal-100 text-xs font-medium mb-1">
            <Sparkles className="w-4 h-4" />
            <span>ویراستار و بهینه‌ساز خط فارسی</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">
            ویرایشگر هوشمند متن و نیم‌فاصله
          </h2>
          <p className="text-xs text-teal-100/90 mt-1">
            اصلاح خودکار پیشوندهای «می/نمی»، پسوندهای جمع «ها»، حروف غیراستاندارد «ي» و «ك» و ارقام.
          </p>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/20 text-xs">
          <div className="text-center px-2">
            <span className="block text-teal-200">کلمات</span>
            <span className="text-base font-bold">{toPersianDigits(wordCount)}</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="text-center px-2">
            <span className="block text-teal-200">کاراکتر</span>
            <span className="text-base font-bold">{toPersianDigits(charCount)}</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="text-center px-2">
            <span className="block text-teal-200">زمان خواندن</span>
            <span className="text-base font-bold">~{toPersianDigits(readingTimeMin)} دقیقه</span>
          </div>
        </div>
      </div>

      {/* Main Editor Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCleanHalfSpaces}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition active:scale-95"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>اصلاح نیم‌فاصله و حروف</span>
            </button>

            <button
              onClick={handleConvertToPersianDigits}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition"
            >
              <span>اعداد فارسی (۰-۹)</span>
            </button>

            <button
              onClick={handleConvertToEnglishDigits}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs transition"
            >
              <span>اعداد انگلیسی (0-9)</span>
            </button>

            <button
              onClick={() => setText(sampleText)}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>متن نمونه</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm transition active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>کپی شد!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی متن</span>
                </>
              )}
            </button>

            <button
              onClick={handleClear}
              aria-label="پاک کردن متن"
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="متن خود را اینجا تایپ کنید یا الصاق نمایید..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-4 text-sm sm:text-base text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed resize-y font-sans"
          />
        </div>

        {/* Status bar */}
        {lastAction && (
          <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            <span>{lastAction}</span>
          </div>
        )}
      </div>

      {/* Rules explanation box */}
      <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 p-5 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
        <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
          <span>💡</span>
          <span>نیم‌فاصله چیست و چرا مهم است؟</span>
        </h4>
        <p className="leading-relaxed">
          نیم‌فاصله (Zero-width non-joiner) فاصله کوتاهی است که بدون ایجاد فضای خالی بزرگ میان دو حرف،
          مانع چسبیدن آنها به یکدیگر می‌شود. به عنوان مثال، نوشتن «می‌روم» به جای «می روم» یا «میروم»، و
          «کتاب‌ها» به جای «کتاب ها» رسم‌الخط صحیح و استاندارد فرهنگستان زبان و ادب فارسی است.
        </p>
      </div>
    </div>
  );
};
