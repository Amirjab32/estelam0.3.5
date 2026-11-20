import React, { useState } from 'react';
import {
  Rocket,
  ShoppingBag,
  TrendingUp,
  Building2,
  Gamepad2,
  CalendarCheck,
  Bot,
  Copy,
  Check,
  Send,
} from 'lucide-react';

interface ProjectLauncherProps {
  onSelectPrompt: (prompt: string) => void;
}

export const ProjectLauncher: React.FC<ProjectLauncherProps> = ({ onSelectPrompt }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [customIdea, setCustomIdea] = useState<string>('');

  const projects = [
    {
      id: 'shop',
      title: 'فروشگاه اینترنتی با پرداخت و سبد خرید',
      category: 'تجارت الکترونیک',
      icon: ShoppingBag,
      color: 'from-blue-600 to-indigo-600',
      description:
        'طراحی کامل فروشگاه با فیلتر محصولات، دسته‌بندی‌ها، سبد خرید، اعمال کد تخفیف و فاکتور نهایی.',
      prompt:
        'لطفاً برای من یک فروشگاه اینترنتی کامل با دسته‌بندی محصولات، سبد خرید، تخفیف و صدور فاکتور طراحی کن.',
    },
    {
      id: 'finance',
      title: 'داشبورد مدیریت مالی و حسابداری',
      category: 'مالی و کسب‌وکار',
      icon: TrendingUp,
      color: 'from-emerald-600 to-teal-600',
      description:
        'ثبت درآمد و هزینه روزانه، نمودارهای ماهانه به تومان، دسته‌بندی هزینه‌ها و محاسبه سود و زیان.',
      prompt:
        'یک برنامه مدیریت مالی و حسابداری شخصی با امکان ثبت درآمد و مخارج و نمودارهای تحلیلی بساز.',
    },
    {
      id: 'booking',
      title: 'سامانه رزرو وقت و نوبت‌دهی آنلاین',
      category: 'خدماتی و پزشکی',
      icon: CalendarCheck,
      color: 'from-amber-600 to-orange-600',
      description:
        'انتخاب روز و ساعت از تقویم خورشیدی، فرم مشخصات مراجعین، ارسال تأییدیه و پنل مدیریت نوبت‌ها.',
      prompt:
        'یک سامانه رزرواسیون و نوبت‌دهی آنلاین با تقویم شمسی برای مطب یا کلینیک طراحی کن.',
    },
    {
      id: 'game',
      title: 'بازی فکری و کلمات آنلاین',
      category: 'سرگرمی و آموزش',
      icon: Gamepad2,
      color: 'from-purple-600 to-pink-600',
      description:
        'بازی حدس کلمه یا تست هوش تعاملی به زبان فارسی با جدول رتبه‌بندی، تایمر و امتیازدهی زنده.',
      prompt:
        'یک بازی معمایی و حدس کلمات هیجان‌انگیز فارسی با امتیاز و مراحل گوناگون بساز.',
    },
    {
      id: 'realestate',
      title: 'سامانه املاک و فایلینگ مسکن',
      category: 'املاک و مستغلات',
      icon: Building2,
      color: 'from-cyan-600 to-blue-600',
      description:
        'جستجوی ملک برای رهن و اجاره، فیلتر متراژ و قیمت به تومان، گالری تصاویر و فرم ثبت آگهی.',
      prompt:
        'یک پورتال جستجو و ثبت املاک با فیلترهای پیشرفته قیمت و متراژ بساز.',
    },
    {
      id: 'ai-tools',
      title: 'استودیو هوش مصنوعی و تولید محتوا',
      category: 'ابزار هوشمند',
      icon: Bot,
      color: 'from-violet-600 to-purple-600',
      description:
        'ابزار دستیار نگارش مقالات، بازنویسی محتوا، تولید ایده‌های خلاقانه و ترجمه تخصصی.',
      prompt:
        'یک دستیار تولید محتوا و ایده‌پردازی برای وبلاگ‌ها و شبکه‌های اجتماعی بساز.',
    },
  ];

  const handleCopy = (prompt: string, id: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-violet-700 via-indigo-700 to-purple-800 text-white p-6 sm:p-8 shadow-md">
        <div className="flex items-center gap-2 text-violet-200 text-xs font-medium mb-2">
          <Rocket className="w-4 h-4" />
          <span>مرکز ایده‌پردازی و توسعه گام‌به‌گام</span>
        </div>
        <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight">
          چه پروژه‌ای در ذهن دارید؟
        </h2>
        <p className="mt-2 text-sm text-violet-100/90 leading-relaxed max-w-2xl">
          هر ایده‌ای که دارید را می‌توانید به راحتی مطرح کنید؛ هر یک از قالب‌ها و ساختارهای زیر
          نیز با یک کلیک آماده پیاده‌سازی و شخصی‌سازی کامل هستند.
        </p>
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((proj) => (
          <div
            key={proj.id}
            className="rounded-2xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${proj.color} flex items-center justify-center text-white shadow-md`}
                >
                  <proj.icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                  {proj.category}
                </span>
              </div>

              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base mb-1.5">
                {proj.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {proj.description}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
              <button
                onClick={() => onSelectPrompt(proj.prompt)}
                className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <span>انتخاب این طرح</span>
              </button>

              <button
                onClick={() => handleCopy(proj.prompt, proj.id)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                aria-label="کپی متن درخواست"
              >
                {copiedId === proj.id ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Custom Idea Box */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
        <h3 className="font-bold text-slate-900 dark:text-white text-base mb-2 flex items-center gap-2">
          <span>✍️</span>
          <span>یا ایده اختصاصی خود را بنویسید:</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          توضیح دهید برنامه شما چه بخش‌ها، ظاهر و قابلیت‌هایی باید داشته باشد:
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={customIdea}
            onChange={(e) => setCustomIdea(e.target.value)}
            placeholder="مثلاً: من می‌خواهم یک جدول لیگ فوتبال با جدول رده‌بندی و بازی‌ها بسازم..."
            className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={() => {
              if (customIdea.trim()) {
                onSelectPrompt(customIdea.trim());
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs shadow-sm transition active:scale-95"
          >
            <Send className="w-4 h-4" />
            <span>ثبت و ارسال ایده</span>
          </button>
        </div>
      </div>
    </div>
  );
};
