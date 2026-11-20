import React, { useEffect, useState } from 'react';
import { Calendar, Moon, Sun, Clock, Sparkles } from 'lucide-react';
import { getCurrentPersianDate, toPersianDigits } from '../utils/jalali.ts';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  darkMode,
  setDarkMode,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateInfo, setDateInfo] = useState(getCurrentPersianDate());

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = toPersianDigits(now.getHours().toString().padStart(2, '0'));
      const mins = toPersianDigits(now.getMinutes().toString().padStart(2, '0'));
      const secs = toPersianDigits(now.getSeconds().toString().padStart(2, '0'));
      setTimeStr(`${hours}:${mins}:${secs}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { id: 'overview', label: 'پیشخوان اصلی', icon: Sparkles },
    { id: 'calendar', label: 'تقویم و تبدیل تاریخ', icon: Calendar },
    { id: 'tasks', label: 'یادداشت و کارها', icon: '📝' },
    { id: 'text-tools', label: 'ویرایشگر متن فارسی', icon: '✍️' },
    { id: 'converter', label: 'تبدیل واحد و ارز', icon: '🔄' },
    { id: 'launcher', label: 'ایده‌ها و توسعه', icon: '🚀' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 font-bold text-lg">
              س
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">
                  سامانه هوشمند و پیشخوان کاربردی
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium border border-emerald-300 dark:border-emerald-800">
                  آنلاین
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                محیط مدرن فارسی همراه با ابزارهای روزمره و آمادگی برای ساخت پروژه شما
              </p>
            </div>
          </div>

          {/* Date, Time & Mode Toggle */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60">
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {dateInfo.fullDateString}
              </span>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-mono">{timeStr}</span>
              </div>
            </div>

            {/* Dark Mode Button */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'حالت روشن' : 'حالت تاریک'}
              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
            >
              {darkMode ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-600" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 space-x-reverse overflow-x-auto pb-2 scrollbar-none border-t border-slate-100 dark:border-slate-800/60 pt-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 flex items-center gap-2 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                {typeof item.icon === 'string' ? (
                  <span>{item.icon}</span>
                ) : (
                  <item.icon className="w-4 h-4" />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
