import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { ProductSortOption } from '../utils/productFilterSort.ts';

interface ProductSortMenuProps {
  value: ProductSortOption;
  onChange: (nextSort: ProductSortOption) => void;
}

const SORT_OPTIONS: { id: ProductSortOption; label: string }[] = [
  { id: 'newest', label: 'جدیدترین' },
  { id: 'oldest', label: 'قدیمی‌ترین' },
  { id: 'price_desc', label: 'گران‌ترین' },
  { id: 'price_asc', label: 'ارزانترین' },
];

export const ProductSortMenu: React.FC<ProductSortMenuProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const activeOption = SORT_OPTIONS.find((opt) => opt.id === value) || SORT_OPTIONS[0];

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

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 border transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isOpen
            ? 'bg-indigo-600/15 border-indigo-500 text-white'
            : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700 hover:text-white'
        }`}
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="text-slate-400">مرتب‌سازی:</span>
        <span className="font-semibold text-white">{activeOption.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-300' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="گزینه‌های مرتب‌سازی"
          className="absolute top-full mt-2 right-0 z-40 min-w-[190px] rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-slate-950/80 p-1.5 space-y-0.5"
        >
          {SORT_OPTIONS.map((opt) => {
            const isActive = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`w-full min-h-[38px] px-3 py-2 rounded-xl text-xs flex items-center justify-between gap-3 transition whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  isActive
                    ? 'bg-indigo-600 text-white font-bold shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium'
                }`}
              >
                <span>{opt.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
