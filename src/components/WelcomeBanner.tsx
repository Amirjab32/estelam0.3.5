import React from 'react';
import { Sparkles, ArrowLeft, CheckCircle2, Zap, Rocket, Layers, Code, Bot } from 'lucide-react';
import { getCurrentPersianDate, toPersianDigits } from '../utils/jalali.ts';

interface WelcomeBannerProps {
  onSelectTab: (tab: string) => void;
  onSelectIdeaPrompt: (prompt: string) => void;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({
  onSelectTab,
  onSelectIdeaPrompt,
}) => {
  const dateInfo = getCurrentPersianDate();

  const quickFeatures = [
    {
      title: 'تقویم خورشیدی و تبدیل تاریخ',
      desc: 'مشاهده رویدادها، ماه جاری و تبدیل میلادی به شمسی و بالعکس',
      icon: '📅',
      tabId: 'calendar',
      badge: 'دقیق و بومی',
    },
    {
      title: 'مدیریت کارها و یادداشت‌ها',
      desc: 'ثبت وظایف، اولویت‌بندی، دسته‌بندی و ذخیره‌سازی محلی',
      icon: '📝',
      tabId: 'tasks',
      badge: 'ذخیره خودکار',
    },
    {
      title: 'ویراستار متن و نیم‌فاصله‌گذار',
      desc: 'پاکسازی حروف عربی، تبدیل اعداد، اصلاح نیم‌فاصله و آمار کلمات',
      icon: '✍️',
      tabId: 'text-tools',
      badge: 'استاندارد فارسی',
    },
    {
      title: 'تبدیل واحد، تومان و ریال',
      desc: 'تبدیل ریال و تومان به حروف، محاسبه طلا، وزن و مقیاس‌ها',
      icon: '🔄',
      tabId: 'converter',
      badge: 'کاربردی',
    },
  ];

  const suggestedProjects = [
    {
      title: 'فروشگاه اینترنتی مدرن',
      desc: 'سبد خرید، لیست محصولات، فیلترها و درگاه پرداخت شبیه‌سازی‌شده',
      prompt: 'من می‌خواهم یک وب‌سایت فروشگاه اینترنتی با سبد خرید و دسته‌بندی محصولات بسازم.',
      icon: Layers,
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'داشبورد مدیریتی و حسابداری',
      desc: 'نمودارهای دخل و خرج، آمار فروش، جدول مشتریان و گزارش‌گیری',
      prompt: 'یک داشبورد مدیریت مالی و فروشگاهی با نمودارها و آمار جامع برای من طراحی کن.',
      icon: Zap,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: 'سامانه آموزش و آزمون آنلاین',
      desc: 'دوره‌های آموزشی، آزمون تستی با کارنامه و صدور مدرک',
      prompt: 'یک سامانه آموزش آنلاین با قابلیت برگزاری آزمون چهارگزینه‌ای و نمایش نمره بساز.',
      icon: Code,
      color: 'from-amber-500 to-orange-600',
    },
    {
      title: 'پلتفرم هوشمند یا بازی تحت وب',
      desc: 'بازی‌های فکری تعاملی فارسی یا ابزار تخصصی پردازش داده',
      prompt: 'یک بازی فکری جذاب و امتیازی فارسی برای تقویت حافظه طراحی کن.',
      icon: Rocket,
      color: 'from-purple-500 to-pink-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 sm:p-10 shadow-xl border border-indigo-700/40">
        <div className="absolute top-0 left-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs sm:text-sm font-medium text-indigo-200 mb-4">
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>امروز {dateInfo.fullDateString}</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-snug">
            سلام! وقت شما بخیر؛ به سامانه هوشمند خوش آمدید.
          </h2>
          <p className="mt-3 text-sm sm:text-base text-indigo-100/90 leading-relaxed max-w-2xl">
            این محیط به صورت اختصاصی با پشتیبانی کامل از زبان فارسی و ابزارهای پرکاربرد روزمره
            برای شما آماده شده است. می‌توانید از ابزارهای آماده زیر استفاده کنید یا بگویید چه پروژه‌ای
            در ذهن دارید تا فوراً با هم پیاده‌سازی کنیم!
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => onSelectTab('tasks')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-indigo-950 font-semibold text-sm hover:bg-indigo-50 shadow-md transition active:scale-95"
            >
              <span>شروع کار با دفترچه یادداشت</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onSelectTab('calendar')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-700/60 hover:bg-indigo-700 text-white font-medium text-sm border border-indigo-500/40 transition active:scale-95"
            >
              <span>تقویم و تبدیل تاریخ</span>
            </button>
            <button
              onClick={() => onSelectTab('launcher')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-cyan-300 font-medium text-sm border border-cyan-500/30 transition active:scale-95"
            >
              <span>ساخت پروژه اختصاصی</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid of Ready Tools */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>🛠️</span>
            <span>جعبه‌ابزار کاربردی آماده</span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {toPersianDigits(4)} ابزار فعال
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickFeatures.map((feat) => (
            <div
              key={feat.tabId}
              onClick={() => onSelectTab(feat.tabId)}
              className="group cursor-pointer rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-2xl p-2 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:scale-110 transition-transform">
                    {feat.icon}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-medium">
                    {feat.badge}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {feat.title}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feat.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                <span>باز کردن ابزار</span>
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Projects Section */}
      <div className="rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 p-6 border border-slate-200 dark:border-slate-800">
        <div className="mb-4">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>💡</span>
            <span>می‌خواهید چه پروژه‌ای بسازیم؟ (پیشنهادات ساخت)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            با کلیک روی هر گزینه، می‌توانید دستور آماده را بررسی کرده یا موضوع دلخواهتان را در پیام بعدی بفرمایید:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {suggestedProjects.map((proj, idx) => (
            <button
              key={idx}
              onClick={() => onSelectIdeaPrompt(proj.prompt)}
              className="text-right p-4 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-sm hover:shadow transition group flex flex-col justify-between"
            >
              <div>
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${proj.color} flex items-center justify-center text-white mb-2 shadow-sm`}
                >
                  <proj.icon className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {proj.title}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                  {proj.desc}
                </p>
              </div>
              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-3 flex items-center gap-1 group-hover:underline">
                <span>انتخاب این ایده</span>
                <ArrowLeft className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
