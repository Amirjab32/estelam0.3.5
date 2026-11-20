import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  compareJalaliDates,
  formatJalaliDateLabel,
  getJalaliMonthLength,
  getJalaliMonthStartWeekday,
  getTodayJalaliDate,
  JalaliDate,
  PERSIAN_MONTHS,
  PERSIAN_WEEKDAYS,
  toPersianDigits,
} from '../utils/jalali.ts';

interface JalaliDateRangeFilterProps {
  fromDate: JalaliDate | null;
  toDate: JalaliDate | null;
  onChangeFromDate: (date: JalaliDate | null) => void;
  onChangeToDate: (date: JalaliDate | null) => void;
  onClear: () => void;
}

type ActiveTarget = 'from' | 'to';

const SHORT_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export const JalaliDateRangeFilter: React.FC<JalaliDateRangeFilterProps> = ({
  fromDate,
  toDate,
  onChangeFromDate,
  onChangeToDate,
  onClear,
}) => {
  const today = useMemo(() => getTodayJalaliDate(), []);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>('from');
  const [viewYear, setViewYear] = useState<number>(today.jy);
  const [viewMonth, setViewMonth] = useState<number>(today.jm);

  const hasAnyDate = Boolean(fromDate || toDate);

  const openForTarget = (target: ActiveTarget) => {
    if (isOpen && activeTarget === target) {
      setIsOpen(false);
      return;
    }
    const seedDate =
      target === 'from' ? fromDate || toDate || today : toDate || fromDate || today;
    setActiveTarget(target);
    setViewYear(seedDate.jy);
    setViewMonth(seedDate.jm);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const applySelectedDate = (picked: JalaliDate) => {
    if (activeTarget === 'from') {
      if (toDate && compareJalaliDates(picked, toDate) > 0) {
        // User picked a start date later than existing end date; reset end date and prompt for end
        onChangeFromDate(picked);
        onChangeToDate(null);
        setActiveTarget('to');
        return;
      }
      onChangeFromDate(picked);
      if (!toDate) {
        setActiveTarget('to');
      } else {
        setIsOpen(false);
      }
    } else {
      if (fromDate && compareJalaliDates(picked, fromDate) < 0) {
        // Keep range valid by swapping if end date is earlier than start date
        onChangeToDate(fromDate);
        onChangeFromDate(picked);
      } else {
        onChangeToDate(picked);
      }
      setIsOpen(false);
    }
  };

  const monthLength = getJalaliMonthLength(viewYear, viewMonth);
  const startWeekday = getJalaliMonthStartWeekday(viewYear, viewMonth);

  const yearOptions = useMemo(() => {
    const start = Math.min(today.jy - 10, viewYear - 2);
    const end = Math.max(today.jy + 2, viewYear + 2);
    const years: number[] = [];
    for (let y = end; y >= start; y--) {
      years.push(y);
    }
    return years;
  }, [today.jy, viewYear]);

  const isSameDay = (a: JalaliDate | null, day: number) =>
    Boolean(a && a.jy === viewYear && a.jm === viewMonth && a.jd === day);

  const isBetweenRange = (day: number) => {
    if (!fromDate || !toDate) return false;
    const current: JalaliDate = { jy: viewYear, jm: viewMonth, jd: day };
    return (
      compareJalaliDates(current, fromDate) > 0 &&
      compareJalaliDates(current, toDate) < 0
    );
  };

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-2">
      {/* From Date Trigger */}
      <button
        type="button"
        onClick={() => openForTarget('from')}
        aria-expanded={isOpen && activeTarget === 'from'}
        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 border transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isOpen && activeTarget === 'from'
            ? 'bg-indigo-600/15 border-indigo-500 text-white'
            : fromDate
              ? 'bg-slate-950 border-indigo-500/60 text-slate-100 hover:border-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="text-slate-400">از تاریخ:</span>
        <span
          className={`font-mono tabular-nums ${
            fromDate ? 'text-white font-semibold' : 'text-slate-500'
          }`}
        >
          {fromDate ? formatJalaliDateLabel(fromDate) : 'انتخاب تاریخ'}
        </span>
      </button>

      {/* To Date Trigger */}
      <button
        type="button"
        onClick={() => openForTarget('to')}
        aria-expanded={isOpen && activeTarget === 'to'}
        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 border transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isOpen && activeTarget === 'to'
            ? 'bg-indigo-600/15 border-indigo-500 text-white'
            : toDate
              ? 'bg-slate-950 border-indigo-500/60 text-slate-100 hover:border-indigo-400'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
        }`}
      >
        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="text-slate-400">تا تاریخ:</span>
        <span
          className={`font-mono tabular-nums ${
            toDate ? 'text-white font-semibold' : 'text-slate-500'
          }`}
        >
          {toDate ? formatJalaliDateLabel(toDate) : 'انتخاب تاریخ'}
        </span>
      </button>

      {/* Clear Date Filter Button */}
      <button
        type="button"
        onClick={() => {
          onClear();
          setIsOpen(false);
        }}
        disabled={!hasAnyDate}
        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          hasAnyDate
            ? 'bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border-rose-800/50 active:scale-95'
            : 'bg-slate-950/60 text-slate-600 border-slate-800/70 cursor-not-allowed'
        }`}
      >
        <X className="w-3.5 h-3.5 shrink-0" />
        <span>پاک کردن فیلتر تاریخ</span>
      </button>

      {/* Dark-Themed RTL Jalali Calendar Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="انتخابگر تاریخ شمسی"
          className="absolute top-full mt-2 right-0 z-40 w-[min(320px,calc(100vw-2rem))] rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-slate-950/80 p-3.5 space-y-3"
        >
          {/* Target Switcher (From / To) */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setActiveTarget('from');
                if (fromDate) {
                  setViewYear(fromDate.jy);
                  setViewMonth(fromDate.jm);
                }
              }}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                activeTarget === 'from'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              از: {fromDate ? formatJalaliDateLabel(fromDate) : '—'}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTarget('to');
                if (toDate) {
                  setViewYear(toDate.jy);
                  setViewMonth(toDate.jm);
                }
              }}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition whitespace-nowrap ${
                activeTarget === 'to'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تا: {toDate ? formatJalaliDateLabel(toDate) : '—'}
            </button>
          </div>

          {/* Month & Year Navigation */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="ماه قبل"
              aria-label="ماه قبل"
              className="w-9 h-9 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <select
                aria-label="ماه شمسی"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="flex-1 min-w-0 h-9 rounded-xl bg-slate-950 border border-slate-800 px-2 text-xs font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PERSIAN_MONTHS.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="سال شمسی"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="w-20 h-9 rounded-xl bg-slate-950 border border-slate-800 px-2 text-xs font-mono tabular-nums font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {toPersianDigits(y)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="ماه بعد"
              aria-label="ماه بعد"
              className="w-9 h-9 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {SHORT_WEEKDAYS.map((wd, idx) => (
              <div
                key={wd}
                title={PERSIAN_WEEKDAYS[idx]}
                className="text-[11px] font-semibold text-slate-400 py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startWeekday }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-9" />
            ))}

            {Array.from({ length: monthLength }, (_, i) => i + 1).map((day) => {
              const selectedFrom = isSameDay(fromDate, day);
              const selectedTo = isSameDay(toDate, day);
              const selected = selectedFrom || selectedTo;
              const inRange = isBetweenRange(day);
              const isToday =
                today.jy === viewYear && today.jm === viewMonth && today.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => applySelectedDate({ jy: viewYear, jm: viewMonth, jd: day })}
                  className={`h-9 rounded-lg text-xs font-mono tabular-nums transition flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    selected
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : inRange
                        ? 'bg-indigo-600/20 text-indigo-200 hover:bg-indigo-600/35'
                        : 'text-slate-200 hover:bg-slate-800'
                  } ${isToday && !selected ? 'ring-1 ring-indigo-400/70' : ''}`}
                >
                  {toPersianDigits(day)}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setViewYear(today.jy);
                setViewMonth(today.jm);
                applySelectedDate(today);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-indigo-300 text-[11px] font-semibold transition whitespace-nowrap"
            >
              امروز ({formatJalaliDateLabel(today)})
            </button>

            <div className="flex items-center gap-1.5">
              {((activeTarget === 'from' && fromDate) ||
                (activeTarget === 'to' && toDate)) && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeTarget === 'from') onChangeFromDate(null);
                    else onChangeToDate(null);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-rose-300 hover:bg-rose-950/50 text-[11px] font-medium transition whitespace-nowrap"
                >
                  حذف
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-[11px] font-medium transition whitespace-nowrap"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
