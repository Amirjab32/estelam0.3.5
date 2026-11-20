import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Upload,
  FileText,
  RotateCcw,
  Pause,
  Trash2,
  ExternalLink,
  XCircle,
  Loader2,
  Clock,
  Plus,
  Check,
  AlertTriangle,
  Percent,
  Layers,
} from 'lucide-react';
import { ProductItem } from '../types.ts';
import { calculateCustomerQuote } from '../services/firestoreProducts.ts';
import { fetchLiveDigikalaProductClient } from '../utils/clientDigikalaScraper.ts';
import { BulkInquiryItem, parseBulkDigikalaTxt } from '../utils/bulkTxtParser.ts';
import { findBestNameDuplicate } from '../utils/productNameMatcher.ts';
import { formatPersianNumber, toPersianDigits } from '../utils/jalali.ts';

interface BulkPriceInquiryViewProps {
  existingProducts: ProductItem[];
  onProductAdded: (newProduct: ProductItem) => Promise<void> | void;
  onBulkProductsAdded: (newProducts: ProductItem[]) => Promise<void> | void;
  onBack: () => void;
  onShowToast: (message: string) => void;
}

interface RowDuplicateInfo {
  isDuplicate: boolean;
  source?: 'shop' | 'batch';
  matchedName?: string;
  matchedBatchRowNumber?: number;
  score: number;
}

const QUEUE_STEP_DELAY_MS = 950;

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export const BulkPriceInquiryView: React.FC<BulkPriceInquiryViewProps> = ({
  existingProducts,
  onProductAdded,
  onBulkProductsAdded,
  onBack,
  onShowToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileMeta, setFileMeta] = useState<{
    fileName: string;
    totalNonEmptyLines: number;
    duplicateCount: number;
    invalidCount: number;
  } | null>(null);

  const [items, setItems] = useState<BulkInquiryItem[]>([]);
  const itemsRef = useRef<BulkInquiryItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [marginPercent, setMarginPercent] = useState<number>(8);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  const runIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateItems = useCallback(
    (updater: (prev: BulkInquiryItem[]) => BulkInquiryItem[]) => {
      setItems((prev) => {
        const next = updater(prev);
        itemsRef.current = next;
        return next;
      });
    },
    []
  );

  const stopActiveQueue = useCallback(() => {
    runIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    updateItems((prev) =>
      prev.map((item) =>
        item.status === 'loading' ? { ...item, status: 'pending' } : item
      )
    );
  }, [updateItems]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      abortControllerRef.current?.abort();
    };
  }, []);

  const runQueueForIds = useCallback(
    async (targetIds: string[]) => {
      if (targetIds.length === 0) return;

      runIdRef.current += 1;
      const currentRunId = runIdRef.current;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsRunning(true);

      let completedInRun = 0;

      for (let i = 0; i < targetIds.length; i++) {
        if (runIdRef.current !== currentRunId || controller.signal.aborted) {
          break;
        }

        const targetId = targetIds[i];
        const snapshotItem = itemsRef.current.find((r) => r.id === targetId);
        if (!snapshotItem || snapshotItem.status === 'success' || !snapshotItem.dkpId) {
          continue;
        }

        updateItems((prev) =>
          prev.map((row) =>
            row.id === targetId
              ? { ...row, status: 'loading', errorMessage: undefined }
              : row
          )
        );

        try {
          const result = await fetchLiveDigikalaProductClient({
            url: snapshotItem.url,
            signal: controller.signal,
          });

          if (
            runIdRef.current !== currentRunId ||
            result.aborted ||
            controller.signal.aborted
          ) {
            updateItems((prev) =>
              prev.map((row) =>
                row.id === targetId && row.status === 'loading'
                  ? { ...row, status: 'pending' }
                  : row
              )
            );
            break;
          }

          if (
            result.data &&
            (result.data.priceToman > 0 || result.data.stockStatus === 'out_of_stock')
          ) {
            completedInRun++;
            updateItems((prev) =>
              prev.map((row) =>
                row.id === targetId
                  ? {
                      ...row,
                      status: 'success',
                      productName: result.data!.name || row.productName,
                      category: result.data!.category,
                      imageUrl: result.data!.imageUrl,
                      priceToman: result.data!.priceToman,
                      stockStatus: result.data!.stockStatus,
                      hasDiscount: result.data!.hasDiscount,
                      discountedPriceToman: result.data!.discountedPriceToman,
                      discountPercent: result.data!.discountPercent,
                      errorMessage: undefined,
                    }
                  : row
              )
            );
          } else {
            updateItems((prev) =>
              prev.map((row) =>
                row.id === targetId
                  ? {
                      ...row,
                      status: 'error',
                      errorMessage:
                        result.diagnosticError ||
                        'امکان دریافت قیمت از دیجی‌کالا فراهم نشد.',
                    }
                  : row
              )
            );
          }
        } catch (err: any) {
          if (runIdRef.current !== currentRunId || controller.signal.aborted) {
            updateItems((prev) =>
              prev.map((row) =>
                row.id === targetId && row.status === 'loading'
                  ? { ...row, status: 'pending' }
                  : row
              )
            );
            break;
          }
          updateItems((prev) =>
            prev.map((row) =>
              row.id === targetId
                ? {
                    ...row,
                    status: 'error',
                    errorMessage:
                      err?.message || 'خطا در ارتباط با سرور استعلام قیمت.',
                  }
                : row
            )
          );
        }

        if (
          i < targetIds.length - 1 &&
          runIdRef.current === currentRunId &&
          !controller.signal.aborted
        ) {
          await sleepWithAbort(QUEUE_STEP_DELAY_MS, controller.signal);
        }
      }

      if (runIdRef.current === currentRunId) {
        setIsRunning(false);
        if (completedInRun > 0) {
          const remainingErrors = itemsRef.current.filter(
            (r) => r.status === 'error'
          ).length;
          onShowToast(
            remainingErrors > 0
              ? `استعلام ${toPersianDigits(completedInRun)} کالا انجام شد (${toPersianDigits(remainingErrors)} مورد نیاز به تلاش مجدد)`
              : `استعلام ${toPersianDigits(completedInRun)} کالا با موفقیت تکمیل شد`
          );
        }
      }
    },
    [onShowToast, updateItems]
  );

  const handleTxtFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.txt') && file.type && !file.type.startsWith('text/')) {
        onShowToast('لطفاً یک فایل متنی معتبر با پسوند .txt انتخاب کنید');
        return;
      }

      stopActiveQueue();

      try {
        const text = await file.text();
        const parsed = parseBulkDigikalaTxt(text);

        if (parsed.items.length === 0) {
          setFileMeta(null);
          updateItems(() => []);
          onShowToast('هیچ لینک یا خط غیرخالی در فایل متنی یافت نشد');
          return;
        }

        setFileMeta({
          fileName: file.name,
          totalNonEmptyLines: parsed.totalNonEmptyLines,
          duplicateCount: parsed.duplicateCount,
          invalidCount: parsed.invalidCount,
        });
        itemsRef.current = parsed.items;
        setItems(parsed.items);

        const pendingIds = parsed.items
          .filter((item) => item.status === 'pending' && Boolean(item.dkpId))
          .map((item) => item.id);

        if (pendingIds.length > 0) {
          void runQueueForIds(pendingIds);
        } else {
          onShowToast('هیچ لینک معتبر دیجی‌کالایی برای استعلام در این فایل یافت نشد');
        }
      } catch (err: any) {
        onShowToast(`خطا در خواندن فایل: ${err?.message || 'نامشخص'}`);
      }
    },
    [onShowToast, runQueueForIds, stopActiveQueue, updateItems]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void handleTxtFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleTxtFile(file);
    }
  };

  const handleRetryFailedAndPending = () => {
    if (isRunning) return;

    const retryIds: string[] = [];
    const nextItems = itemsRef.current.map((item) => {
      if (item.status === 'success' || !item.dkpId) {
        return item;
      }
      retryIds.push(item.id);
      return {
        ...item,
        status: 'pending' as const,
        errorMessage: undefined,
      };
    });

    if (retryIds.length === 0) {
      onShowToast('مورد قابل استعلام مجددی باقی نمانده است');
      return;
    }

    itemsRef.current = nextItems;
    setItems(nextItems);
    void runQueueForIds(retryIds);
  };

  const handleRemoveRow = (itemId: string) => {
    updateItems((prev) => prev.filter((row) => row.id !== itemId));
  };

  const handleClearList = () => {
    stopActiveQueue();
    setFileMeta(null);
    updateItems(() => []);
  };

  /**
   * Smart name-based duplicate evaluation (never compares links/DKPs):
   * - Compares each successfully fetched product name against existing shop products
   * - Also detects duplicates across different links inside the current bulk list
   */
  const duplicateMap = useMemo(() => {
    const map = new Map<string, RowDuplicateInfo>();
    const shopCandidates = existingProducts.map((p) => ({ id: p.id, name: p.name }));
    const seenBatchCandidates: Array<{ id: string; name: string; rowNumber: number }> = [];

    items.forEach((item, idx) => {
      if (item.status !== 'success' || !item.productName.trim()) {
        map.set(item.id, { isDuplicate: false, score: 0 });
        return;
      }

      // Items just added during this session stay marked as "Added" rather than flipping to Duplicate
      if (item.addedToShop) {
        map.set(item.id, { isDuplicate: false, score: 0 });
        seenBatchCandidates.push({
          id: item.id,
          name: item.productName,
          rowNumber: idx + 1,
        });
        return;
      }

      const shopMatch = findBestNameDuplicate(item.productName, shopCandidates);
      if (shopMatch.isDuplicate && shopMatch.matchedItem) {
        map.set(item.id, {
          isDuplicate: true,
          source: 'shop',
          matchedName: shopMatch.matchedItem.name,
          score: shopMatch.score,
        });
        return;
      }

      const batchMatch = findBestNameDuplicate(item.productName, seenBatchCandidates);
      if (batchMatch.isDuplicate && batchMatch.matchedItem) {
        map.set(item.id, {
          isDuplicate: true,
          source: 'batch',
          matchedName: batchMatch.matchedItem.name,
          matchedBatchRowNumber: batchMatch.matchedItem.rowNumber,
          score: batchMatch.score,
        });
        return;
      }

      map.set(item.id, { isDuplicate: false, score: 0 });
      seenBatchCandidates.push({
        id: item.id,
        name: item.productName,
        rowNumber: idx + 1,
      });
    });

    return map;
  }, [items, existingProducts]);

  const duplicateEntries = useMemo(() => {
    return items
      .map((item, idx) => ({
        item,
        rowNumber: idx + 1,
        dup: duplicateMap.get(item.id),
      }))
      .filter((entry) => entry.dup?.isDuplicate);
  }, [items, duplicateMap]);

  const eligibleNewItems = useMemo(() => {
    return items.filter((item) => {
      if (item.status !== 'success' || item.priceToman <= 0 || item.addedToShop) {
        return false;
      }
      const dup = duplicateMap.get(item.id);
      return !dup?.isDuplicate;
    });
  }, [items, duplicateMap]);

  const buildProductPayload = useCallback(
    (item: BulkInquiryItem, indexOffset = 0): ProductItem => {
      const cleanMargin = Math.max(0, Math.min(500, Number(marginPercent) || 0));
      const sellingPrice = calculateCustomerQuote(item.priceToman, cleanMargin);
      const nowIso = new Date().toISOString();

      return {
        id: `prod_${Date.now()}_${indexOffset}_${item.dkpId || Math.floor(Math.random() * 1000)}`,
        name: item.productName,
        category: item.category || 'لوازم جانبی و قطعات',
        sourceUrl: item.url,
        imageUrl:
          item.imageUrl ||
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
        currentPriceToman: item.priceToman,
        lastPriceToman: item.priceToman,
        marginPercent: cleanMargin,
        customerQuoteToman: sellingPrice || item.priceToman,
        stockStatus: item.stockStatus || 'in_stock',
        warranty: '',
        lastRefreshedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        notes: '',
        barcodes: [],
      };
    },
    [marginPercent]
  );

  const handleAddSingleToShop = async (item: BulkInquiryItem) => {
    if (item.status !== 'success' || item.priceToman <= 0 || item.addedToShop) return;
    if (duplicateMap.get(item.id)?.isDuplicate) {
      onShowToast('این کالا بر اساس تشابه نام تکراری است و اضافه نشد');
      return;
    }

    const newProduct = buildProductPayload(item, 0);

    try {
      setAddingItemId(item.id);
      await onProductAdded(newProduct);
      updateItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, addedToShop: true } : row))
      );
    } catch {
      onShowToast('خطا در افزودن کالا به لیست فروشگاه');
    } finally {
      setAddingItemId(null);
    }
  };

  const handleBulkAddAllToShop = async () => {
    if (isRunning || isBulkAdding || eligibleNewItems.length === 0) return;

    const payloads = eligibleNewItems.map((item, idx) => buildProductPayload(item, idx));
    const addedIdSet = new Set(eligibleNewItems.map((item) => item.id));

    try {
      setIsBulkAdding(true);
      await onBulkProductsAdded(payloads);
      updateItems((prev) =>
        prev.map((row) =>
          addedIdSet.has(row.id) ? { ...row, addedToShop: true } : row
        )
      );

      const skippedDuplicatesCount = duplicateEntries.length;
      if (skippedDuplicatesCount > 0) {
        onShowToast(
          `${toPersianDigits(payloads.length)} کالای جدید به فروشگاه اضافه شد (${toPersianDigits(skippedDuplicatesCount)} کالای تکراری بر اساس نام نادیده گرفته شد)`
        );
      } else {
        onShowToast(
          `${toPersianDigits(payloads.length)} کالا با موفقیت به لیست فروشگاه اضافه شد`
        );
      }
    } catch (err: any) {
      onShowToast(`خطا در افزودن گروهی کالاها: ${err?.message || 'لطفاً دوباره تلاش کنید'}`);
    } finally {
      setIsBulkAdding(false);
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const success = items.filter((i) => i.status === 'success').length;
    const error = items.filter((i) => i.status === 'error').length;
    const loading = items.filter((i) => i.status === 'loading').length;
    const pending = items.filter((i) => i.status === 'pending').length;
    const retryable = items.filter(
      (i) => (i.status === 'error' || i.status === 'pending') && Boolean(i.dkpId)
    ).length;
    const finished = success + error;
    const progressPercent = total > 0 ? Math.round((finished / total) * 100) : 0;

    return { total, success, error, loading, pending, retryable, finished, progressPercent };
  }, [items]);

  return (
    <div
      className="space-y-5"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDragging(false);
        }
      }}
      onDrop={handleDrop}
    >
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,text/plain"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top View Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              stopActiveQueue();
              onBack();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold border border-slate-800 transition whitespace-nowrap shrink-0 active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
            <span>بازگشت به لیست کالاها</span>
          </button>

          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
              استعلام گروهی قیمت از فایل متنی
            </h2>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              استعلام نوبتی لینک‌های دیجی‌کالا، حذف موارد اضافه، تشخیص هوشمند تکراری از روی نام و ثبت گروهی
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 hover:border-indigo-500/50 transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>فایل .txt جدید</span>
            </button>

            <button
              type="button"
              onClick={handleClearList}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 text-xs font-semibold border border-slate-800 hover:border-rose-800/50 transition whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>پاک کردن</span>
            </button>
          </div>
        )}
      </div>

      {/* Empty State / File Upload Dropzone */}
      {items.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={`rounded-3xl border-2 border-dashed p-8 sm:p-14 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyan-400 bg-cyan-950/20'
              : 'border-slate-800 bg-slate-900/70 hover:border-indigo-500/60 hover:bg-slate-900'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-4">
            <FileText className="w-7 h-7" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-white">
            فایل متنی (.txt) حاوی لینک‌های دیجی‌کالا را انتخاب یا اینجا رها کنید
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto mt-2 leading-relaxed">
            در هر خط یک لینک محصول دیجی‌کالا قرار دهید. خط‌های خالی و لینک‌های تکراری به‌صورت خودکار نادیده گرفته می‌شوند و استعلام‌ها نوبتی با فاصله کوتاه انجام می‌شوند.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition shadow-lg shadow-indigo-950/30">
              <Upload className="w-4 h-4" />
              <span>انتخاب فایل .txt از سیستم</span>
            </span>
            <span dir="ltr" className="text-[11px] font-mono text-slate-500">
              https://www.digikala.com/product/dkp-...
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* Queue Control & Summary Toolbar */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 space-y-3.5">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
              {/* Unboxed Metadata & Live Counters */}
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300 tabular-nums">
                  <span className="font-bold text-white truncate max-w-[220px]" dir="ltr">
                    {fileMeta?.fileName || 'links.txt'}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>{toPersianDigits(stats.total)} محصول در لیست</span>
                  {fileMeta && fileMeta.duplicateCount > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400">
                        {toPersianDigits(fileMeta.duplicateCount)} خط تکراری فایل حذف شد
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                  <span className="text-emerald-400 font-semibold">
                    موفق: {toPersianDigits(stats.success)}
                  </span>
                  <span aria-hidden="true" className="text-slate-700">·</span>
                  <span className={stats.error > 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                    خطا: {toPersianDigits(stats.error)}
                  </span>
                  <span aria-hidden="true" className="text-slate-700">·</span>
                  <span className="text-slate-400">
                    در انتظار: {toPersianDigits(stats.pending + stats.loading)}
                  </span>
                  {duplicateEntries.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-slate-700">·</span>
                      <span className="text-amber-300 font-semibold">
                        تکراری (تشخیص نام): {toPersianDigits(duplicateEntries.length)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Margin Control + Queue Actions + Bulk Add All */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {/* Margin Input for Selling Quote */}
                <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                  <Percent className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <label htmlFor="bulk-margin-input" className="text-xs text-slate-300 whitespace-nowrap">
                    سود فروش:
                  </label>
                  <input
                    id="bulk-margin-input"
                    type="number"
                    dir="ltr"
                    min={0}
                    max={500}
                    step={0.5}
                    value={marginPercent}
                    onChange={(e) =>
                      setMarginPercent(Math.max(0, Math.min(500, Number(e.target.value) || 0)))
                    }
                    className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-center text-xs text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400">٪</span>
                </div>

                {isRunning && (
                  <button
                    type="button"
                    onClick={stopActiveQueue}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>توقف موقت</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRetryFailedAndPending}
                  disabled={isRunning || stats.retryable === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                  <span>
                    {isRunning
                      ? 'در حال استعلام نوبتی...'
                      : stats.retryable > 0
                        ? `تلاش مجدد (${toPersianDigits(stats.retryable)} مورد)`
                        : 'همه موارد استعلام شد'}
                  </span>
                </button>

                {/* Bulk Add All Non-Duplicate Successful Items (strictly enabled only when queue is finished/paused) */}
                <button
                  type="button"
                  onClick={handleBulkAddAllToShop}
                  disabled={isRunning || isBulkAdding || eligibleNewItems.length === 0}
                  title={
                    isRunning
                      ? 'این دکمه پس از پایان یا توقف صف استعلام فعال می‌شود'
                      : 'افزودن یکجای کالاهای جدید و غیرتکراری به لیست فروشگاه'
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95"
                >
                  {isBulkAdding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Layers className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isBulkAdding
                      ? 'در حال ثبت گروهی...'
                      : isRunning
                        ? 'افزودن همه (منتظر پایان صف)'
                        : eligibleNewItems.length > 0
                          ? `افزودن همه به کالاها (${toPersianDigits(eligibleNewItems.length)})`
                          : 'کالای جدیدی برای افزودن نیست'}
                  </span>
                </button>
              </div>
            </div>

            {/* Live Progress Bar */}
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
                <div
                  className={`h-full transition-all duration-300 ${
                    isRunning
                      ? 'bg-indigo-500'
                      : stats.error > 0
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Duplicate Detection Alert Report (Name-Based) */}
          {duplicateEntries.length > 0 && (
            <div className="rounded-2xl bg-amber-950/25 border border-amber-800/50 p-4 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <h3 className="text-xs sm:text-sm font-bold text-amber-200">
                    تشخیص هوشمند {toPersianDigits(duplicateEntries.length)} کالای تکراری از روی نام محصول
                  </h3>
                  <p className="text-[11px] sm:text-xs text-amber-200/80 leading-relaxed">
                    موارد زیر بر اساس تشابه نام با کالاهای فعلی فروشگاه یا سطرهای قبلی تکراری تشخیص داده شدند و در افزودن گروهی به سیستم اضافه نخواهند شد:
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 pr-6 text-xs text-slate-200">
                {duplicateEntries.map(({ item, rowNumber, dup }) => (
                  <li key={`dup_${item.id}`} className="leading-relaxed">
                    <span className="font-mono tabular-nums text-amber-300 font-bold ml-1.5">
                      #{toPersianDigits(rowNumber)}
                    </span>
                    <span className="font-semibold text-white">{item.productName}</span>
                    <span className="text-slate-400 mx-1.5">←</span>
                    <span className="text-amber-300">
                      {dup?.source === 'shop'
                        ? `تکراری با کالای موجود در فروشگاه: «${dup.matchedName}»`
                        : `تکراری با سطر ${toPersianDigits(dup?.matchedBatchRowNumber || 0)} همین لیست: «${dup?.matchedName}»`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Vertical Product List (1 row per product) */}
          <div
            className={`rounded-2xl bg-slate-900 border overflow-hidden divide-y divide-slate-800/80 transition ${
              isDragging ? 'border-cyan-400 ring-2 ring-cyan-500/30' : 'border-slate-800'
            }`}
          >
            {items.map((item, idx) => {
              const sellingPrice =
                item.status === 'success' && item.priceToman > 0
                  ? calculateCustomerQuote(item.priceToman, marginPercent)
                  : 0;
              const dupInfo = duplicateMap.get(item.id);
              const isDuplicate = Boolean(dupInfo?.isDuplicate);

              return (
                <div
                  key={item.id}
                  className={`px-4 sm:px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 transition-colors ${
                    item.status === 'loading'
                      ? 'bg-indigo-950/20'
                      : item.status === 'error'
                        ? 'bg-rose-950/10 hover:bg-rose-950/20'
                        : isDuplicate
                          ? 'bg-amber-950/10 hover:bg-amber-950/20'
                          : 'hover:bg-slate-800/35'
                  }`}
                >
                  {/* Right Side (RTL Start): Product Name + Link Below Name */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono tabular-nums text-slate-400 flex items-center justify-center shrink-0 mt-0.5">
                      {toPersianDigits(idx + 1)}
                    </span>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-sm font-bold text-slate-100 leading-snug break-words">
                        {item.productName}
                      </h3>

                      <div className="flex items-center gap-1.5 min-w-0">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-mono truncate max-w-full"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{item.url}</span>
                        </a>
                      </div>

                      {isDuplicate && dupInfo?.matchedName && (
                        <p className="text-[11px] text-amber-300 flex items-center gap-1.5 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {dupInfo.source === 'shop'
                              ? `تکراری از روی نام با کالای موجود: «${dupInfo.matchedName}»`
                              : `تکراری از روی نام با سطر ${toPersianDigits(dupInfo.matchedBatchRowNumber || 0)}: «${dupInfo.matchedName}»`}
                          </span>
                        </p>
                      )}

                      {item.status === 'error' && item.errorMessage && (
                        <p className="text-[11px] text-rose-300 flex items-center gap-1.5 pt-0.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{item.errorMessage}</span>
                        </p>
                      )}

                      {item.status === 'loading' && (
                        <p className="text-[11px] text-indigo-300">
                          در حال استعلام زنده قیمت بدون تخفیف از دیجی‌کالا...
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Left Side (RTL End): Prices/Status + Row Add/Duplicate Action + Row Delete Button */}
                  <div className="flex items-center justify-between md:justify-end gap-3 pt-2.5 md:pt-0 border-t md:border-t-0 border-slate-800/70 shrink-0">
                    {item.status === 'success' ? (
                      <>
                        {item.stockStatus === 'out_of_stock' && item.priceToman <= 0 ? (
                          <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>ناموجود در دیجی‌کالا</span>
                          </div>
                        ) : (
                          <div className="text-right md:text-left tabular-nums space-y-0.5">
                            <div className="flex items-center md:justify-end gap-1.5 text-xs text-slate-300">
                              <span className="text-[11px] text-slate-400">
                                قیمت دیجی‌کالا{item.hasDiscount ? ' (بدون تخفیف)' : ''}:
                              </span>
                              <span className="font-mono font-semibold text-slate-200">
                                {formatPersianNumber(item.priceToman)} تومان
                              </span>
                            </div>

                            <div className="flex items-baseline md:justify-end gap-1.5">
                              <span className="text-[11px] text-indigo-300 font-semibold">
                                قیمت فروش ما ({toPersianDigits(marginPercent)}٪):
                              </span>
                              <span className="text-base sm:text-lg font-black text-emerald-400 font-mono tracking-tight">
                                {formatPersianNumber(sellingPrice)}
                              </span>
                              <span className="text-xs font-medium text-emerald-500">تومان</span>
                            </div>
                          </div>
                        )}

                        {item.priceToman > 0 && (
                          item.addedToShop ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 font-semibold whitespace-nowrap shrink-0">
                              <Check className="w-3.5 h-3.5" />
                              <span>اضافه شد</span>
                            </span>
                          ) : isDuplicate ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-950/50 border border-amber-800/60 text-[11px] text-amber-300 font-semibold whitespace-nowrap shrink-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              <span>کالای تکراری</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={addingItemId === item.id || isBulkAdding}
                              onClick={() => handleAddSingleToShop(item)}
                              title="افزودن این کالا به داشبورد اصلی فروشگاه"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-semibold transition whitespace-nowrap shrink-0 active:scale-95 disabled:opacity-50"
                            >
                              {addingItemId === item.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Plus className="w-3.5 h-3.5" />
                              )}
                              <span>افزودن به کالاها</span>
                            </button>
                          )
                        )}
                      </>
                    ) : item.status === 'loading' ? (
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-300 whitespace-nowrap">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                        <span>در حال استعلام...</span>
                      </div>
                    ) : item.status === 'pending' ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span>در صف بررسی</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 whitespace-nowrap">
                        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>استعلام ناموفق</span>
                      </div>
                    )}

                    {/* Row Delete Button (right beside the row action/status button) */}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(item.id)}
                      disabled={isBulkAdding}
                      title="حذف این کالا از لیست استعلام"
                      aria-label={`حذف ${item.productName} از لیست استعلام`}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-800/80 hover:border-rose-800/60 transition shrink-0 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
