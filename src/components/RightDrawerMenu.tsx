import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Cloud,
  Shield,
  HardDrive,
  RefreshCw,
  Download,
  Upload,
  KeyRound,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  Info,
  Trash2,
  LayoutGrid,
  Grid3X3,
  List,
  Grid2X2,
  Columns2,
  Layers,
} from 'lucide-react';
import {
  BackupBundle,
  CloudflareStatus,
  CloudflareSyncState,
  ConnectionHealthState,
  ProductItem,
  PriceHistoryItem,
  StorageMode,
  StoragePreference,
} from '../types.ts';
import { toPersianDigits } from '../utils/jalali.ts';
import { parseAndValidateBackupJson } from '../services/storageSync.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { ViewLayout } from './ProductCard.tsx';

interface RightDrawerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  storageMode: StorageMode;
  storagePreference: StoragePreference;
  connectionHealth?: ConnectionHealthState;
  onChangeStoragePreference: (pref: StoragePreference) => void;
  cloudflareStatus: CloudflareStatus;
  firebaseReachable: boolean;
  hasSavedPin: boolean;
  savedPinPreview?: string;
  onVerifyAndSavePin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onChangeShopPin: (currentPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;
  onClearPin: () => void;
  userEmail?: string | null;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onManualSyncNow: () => Promise<void>;
  isSyncing: boolean;
  lastSyncedAt?: string | null;
  products: ProductItem[];
  histories: Record<string, PriceHistoryItem[]>;
  onExportJson: () => void;
  onImportJson: (bundle: BackupBundle, mode: 'merge' | 'replace') => Promise<void>;
  cloudflareOrigin: string;
  onSaveCloudflareOrigin: (url: string) => Promise<void>;
  cloudflareMirrors?: string[];
  onSaveCloudflareMirrors?: (urlsText: string) => Promise<void>;
  layout: ViewLayout;
  onChangeLayout: (layout: ViewLayout) => void;
  filteredProductsCount: number;
  cloudflareSyncState?: CloudflareSyncState;
  lastCloudflareSyncedAt?: string | null;
  cloudflareSyncError?: string | null;
}

const DRAWER_LAYOUT_OPTIONS: {
  id: ViewLayout;
  label: string;
  icon: React.FC<{ className?: string }>;
  desc: string;
}[] = [
  { id: 'grid-4', label: '۴ در سطر', icon: LayoutGrid, desc: 'چیدمان ۴ ستونه متراکم و مدرن' },
  { id: 'grid-3', label: '۳ در سطر', icon: Grid3X3, desc: 'چیدمان ۳ ستونه استاندارد' },
  { id: 'list', label: 'خطی / سطری', icon: List, desc: 'نمایش افقی و سطری کالاها' },
  { id: 'compact', label: 'کوچک و فشرده', icon: Grid2X2, desc: 'کارت‌های مینیاتوری برای پایش سریع' },
  { id: 'large', label: 'بزرگ با جزئیات', icon: Columns2, desc: '۲ در سطر با عکس‌های درشت' },
];

export const RightDrawerMenu: React.FC<RightDrawerMenuProps> = ({
  isOpen,
  onClose,
  storageMode,
  storagePreference,
  connectionHealth = 'healthy',
  onChangeStoragePreference,
  cloudflareStatus,
  firebaseReachable,
  hasSavedPin,
  onVerifyAndSavePin,
  onChangeShopPin,
  onClearPin,
  userEmail,
  onGoogleSignIn,
  onGoogleSignOut,
  onManualSyncNow,
  isSyncing,
  lastSyncedAt,
  products,
  histories,
  onExportJson,
  onImportJson,
  cloudflareOrigin,
  onSaveCloudflareOrigin,
  cloudflareMirrors = [],
  onSaveCloudflareMirrors,
  layout,
  onChangeLayout,
  filteredProductsCount,
  cloudflareSyncState = 'idle',
  lastCloudflareSyncedAt,
  cloudflareSyncError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [originDraft, setOriginDraft] = useState(cloudflareOrigin);
  const [mirrorsDraft, setMirrorsDraft] = useState(cloudflareMirrors.join('\n'));
  useEffect(() => {
    setOriginDraft(cloudflareOrigin);
  }, [cloudflareOrigin]);
  useEffect(() => {
    setMirrorsDraft(cloudflareMirrors.join('\n'));
  }, [cloudflareMirrors]);
  const [isSavingOrigin, setIsSavingOrigin] = useState(false);
  const [isSavingMirrors, setIsSavingMirrors] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isCheckingPin, setIsCheckingPin] = useState(false);

  const [showChangePinForm, setShowChangePinForm] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [changePinSuccess, setChangePinSuccess] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);

  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    bundle: BackupBundle;
    totalHistoryCount: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [showKvGuide, setShowKvGuide] = useState(false);

  if (!isOpen) return null;

  const totalHistoryRecords = Object.values(histories).reduce(
    (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
    0
  );

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinDraft.trim()) return;
    setPinError(null);
    setIsCheckingPin(true);
    try {
      const res = await onVerifyAndSavePin(pinDraft.trim());
      if (res.ok) {
        setPinDraft('');
      } else {
        setPinError(res.error || 'رمز فروشگاه نادرست است.');
      }
    } finally {
      setIsCheckingPin(false);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError(null);
    setChangePinSuccess(null);

    const cur = currentPinInput.trim();
    const nxt = newPinInput.trim();
    const conf = confirmNewPinInput.trim();

    if (!cur || !nxt) {
      setChangePinError('لطفاً رمز فعلی و رمز جدید را وارد کنید.');
      return;
    }
    if (nxt.length < 4) {
      setChangePinError('رمز جدید باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    if (nxt !== conf) {
      setChangePinError('تکرار رمز جدید با رمز جدید مطابقت ندارد.');
      return;
    }

    setIsChangingPin(true);
    try {
      const res = await onChangeShopPin(cur, nxt);
      if (res.ok) {
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmNewPinInput('');
        setChangePinSuccess('رمز فروشگاه با موفقیت تغییر یافت و رمزنگاری شد.');
        setTimeout(() => {
          setShowChangePinForm(false);
          setChangePinSuccess(null);
        }, 1800);
      } else {
        setChangePinError(res.error || 'خطا در تغییر رمز فروشگاه.');
      }
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    try {
      const text = await file.text();
      const parsedBundle = parseAndValidateBackupJson(text);
      const totalHist = Object.values(parsedBundle.histories || {}).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
      );
      setPendingImport({
        fileName: file.name,
        bundle: parsedBundle,
        totalHistoryCount: totalHist,
      });
    } catch (err: any) {
      setImportError(err?.message || 'خطا در خواندن فایل بکاپ JSON');
      setPendingImport(null);
    }
  };

  const handleConfirmImport = async (mode: 'merge' | 'replace') => {
    if (!pendingImport) return;
    setIsImporting(true);
    setImportError(null);
    try {
      await onImportJson(pendingImport.bundle, mode);
      setPendingImport(null);
    } catch (err: any) {
      setImportError(err?.message || 'خطا در بازیابی فایل JSON');
    } finally {
      setIsImporting(false);
    }
  };

  const formatShortTime = (iso?: string | null) => {
    if (!iso) return 'ثبت نشده';
    try {
      return new Date(iso).toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'اکنون';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-start bg-slate-950/75 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="منوی تنظیمات ابر و بکاپ JSON"
    >
      {/* In RTL (dir="rtl"), justify-start anchors the drawer cleanly on the RIGHT side */}
      <aside
        className="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 className="text-base font-extrabold text-white">
              مدیریت ابر، کلادفلر و بکاپ JSON
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              سوئیچ خودکار هنگام قطعی نت · پشتیبان‌گیری دستی آفلاین
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن منو"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Display Mode & Filtered Product Counter */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-200">
                حالت نمایش و آمار لیست کالاها
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>
                  نمایش <strong className="text-white font-mono">{toPersianDigits(filteredProductsCount)}</strong> از{' '}
                  <strong className="text-slate-300 font-mono">{toPersianDigits(products.length)}</strong>
                </span>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-2 gap-2">
              {DRAWER_LAYOUT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = layout === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeLayout(opt.id)}
                    title={opt.desc}
                    className={`min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs transition active:scale-95 whitespace-nowrap ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold'
                        : 'bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 font-medium'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 1: Active Backend & Failover Mode */}
          <section className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200">
                ۱. وضعیت زیرساخت و حالت ذخیره‌سازی
              </h3>
              <span className="text-[11px] text-slate-400 tabular-nums">
                آخرین همگام‌سازی: {formatShortTime(lastSyncedAt)}
              </span>
            </div>

            {/* Active Status Card */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {storageMode === 'firebase' ? (
                    <Cloud className="w-5 h-5 text-indigo-400 shrink-0" />
                  ) : storageMode === 'cloudflare' ? (
                    <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <HardDrive className="w-5 h-5 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">
                      {storageMode === 'firebase'
                        ? 'متصل به گوگل فایربیس (حالت پیش‌فرض)'
                        : storageMode === 'cloudflare'
                          ? 'متصل به کلادفلر (بدون فیلترشکن)'
                          : 'حالت آفلاین محلی (حافظه همین دستگاه)'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>فایربیس: {firebaseReachable ? 'در دسترس' : 'قطع / مسدود'}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        کلادفلر:{' '}
                        {cloudflareStatus.reachable
                          ? cloudflareStatus.relayed
                            ? 'متصل از طریق سرور واسط (بدون فیلترشکن)'
                            : cloudflareStatus.kvConfigured
                              ? `KV فعال${cloudflareStatus.kvBindingName ? ` (${cloudflareStatus.kvBindingName})` : ''}`
                              : 'نیاز به اتصال KV در Bindings'
                          : 'آفلاین'}
                      </span>
                      {connectionHealth === 'degraded' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">در حال بررسی پایداری</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400">وضعیت انتقال به کلادفلر (سایت دوم):</span>
                <span
                  className={
                    cloudflareSyncState === 'synced'
                      ? 'text-emerald-400 font-bold'
                      : cloudflareSyncState === 'syncing'
                        ? 'text-cyan-300 font-bold'
                        : cloudflareSyncState === 'pin_required'
                          ? 'text-amber-300 font-bold'
                          : 'text-rose-300 font-bold'
                  }
                >
                  {cloudflareSyncState === 'synced'
                    ? `همگام (${formatShortTime(lastCloudflareSyncedAt)})`
                    : cloudflareSyncState === 'syncing'
                      ? 'در حال انتقال...'
                      : cloudflareSyncState === 'pin_required'
                        ? 'قفل (نیاز به رمز کلادفلر)'
                        : cloudflareSyncState === 'kv_missing'
                          ? 'KV متصل نیست'
                          : cloudflareSyncState === 'unreachable'
                            ? 'کلادفلر در دسترس نیست'
                            : cloudflareSyncError
                              ? 'خطا در انتقال'
                              : 'در انتظار همگام‌سازی'}
                </span>
              </div>

              {/* 3-Way Selector */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
                {(
                  [
                    { id: 'auto', label: 'خودکار' },
                    { id: 'firebase', label: 'فایربیس' },
                    { id: 'cloudflare', label: 'کلادفلر' },
                  ] as { id: StoragePreference; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeStoragePreference(opt.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                      storagePreference === opt.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={onManualSyncNow}
                disabled={isSyncing}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold text-white transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>
                  {isSyncing
                    ? 'در حال همگام‌سازی دوطرفه...'
                    : 'همگام‌سازی فوری بین فایربیس و کلادفلر'}
                </span>
              </button>
            </div>
          </section>

          {/* Section 2: Manual JSON Backup & Restore */}
          <section className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200">
                ۲. بکاپ‌گیری و بازیابی دستی فایل JSON
              </h3>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {toPersianDigits(products.length)} کالا · {toPersianDigits(totalHistoryRecords)} سابقه
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                این بخش حتی هنگام قطعی کامل اینترنت هم کار می‌کند. می‌توانید کل کالاها، درصد سود (۸٪) و تاریخچه قیمت‌ها را در فایل JSON ذخیره کرده و در سیستم دیگری بازیابی کنید.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onExportJson}
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>دانلود بکاپ JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>بازیابی فایل JSON</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </div>

              {importError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-xs text-rose-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}

              {/* In-the-moment Import Strategy Choice */}
              {pendingImport && (
                <div className="p-4 rounded-xl bg-slate-900 border border-indigo-500/60 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <FileJson className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">
                        {pendingImport.fileName}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 tabular-nums">
                        شامل {toPersianDigits(pendingImport.bundle.products.length)} کالا و{' '}
                        {toPersianDigits(pendingImport.totalHistoryCount)} رکورد تاریخچه قیمت
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    لطفاً روش بازیابی این فایل را انتخاب کنید:
                  </p>

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => handleConfirmImport('merge')}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition text-right flex items-center justify-between"
                    >
                      <span>ادغام هوشمند با لیست فعلی (Merge)</span>
                      <span className="text-[10px] font-normal text-emerald-100">
                        حفظ فعلی + افزودن جدیدها
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => handleConfirmImport('replace')}
                      className="w-full py-2.5 px-3 rounded-xl bg-rose-600/90 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition text-right flex items-center justify-between"
                    >
                      <span>جایگزینی کامل لیست فعلی (Replace)</span>
                      <span className="text-[10px] font-normal text-rose-100">
                        حذف لیست فعلی و بارگذاری فایل
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => setPendingImport(null)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                    >
                      انصراف
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Section 3: Cloudflare Shop PIN & KV Binding Help */}
          <section className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-slate-200">
              ۳. رمز فروشگاه برای حالت کلادفلر (بدون فیلترشکن)
            </h3>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              {hasSavedPin ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>دسترسی کلادفلر روی این سیستم فعال است</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowChangePinForm((v) => !v);
                          setChangePinError(null);
                          setChangePinSuccess(null);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-950/60 text-indigo-300 hover:text-indigo-200 border border-slate-800 text-[11px] font-medium transition"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{showChangePinForm ? 'بستن' : 'تغییر رمز'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onClearPin}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-800 text-[11px] font-medium transition"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>خروج رمز</span>
                      </button>
                    </div>
                  </div>

                  {showChangePinForm && (
                    <form
                      onSubmit={handleChangePinSubmit}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5"
                    >
                      <div className="text-[11px] font-bold text-slate-200">
                        تغییر رمز امنیتی فروشگاه (ذخیره رمزنگاری‌شده در کلادفلر KV)
                      </div>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={currentPinInput}
                        onChange={(e) => setCurrentPinInput(e.target.value)}
                        placeholder="رمز فعلی فروشگاه"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        placeholder="رمز جدید (حداقل ۴ کاراکتر)"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmNewPinInput}
                        onChange={(e) => setConfirmNewPinInput(e.target.value)}
                        placeholder="تکرار رمز جدید"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      {changePinError && (
                        <p className="text-[11px] text-rose-400">{changePinError}</p>
                      )}
                      {changePinSuccess && (
                        <p className="text-[11px] text-emerald-400">{changePinSuccess}</p>
                      )}
                      <button
                        type="submit"
                        disabled={isChangingPin}
                        className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition"
                      >
                        {isChangingPin ? 'در حال ثبت رمز جدید...' : 'ذخیره رمز جدید فروشگاه'}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handlePinSubmit} className="space-y-2.5">
                  <label className="block text-[11px] text-slate-300">
                    برای همگام‌سازی بدون فیلترشکن با کلادفلر، رمز فروشگاه را یک‌بار وارد کنید:
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="w-4 h-4 text-slate-500 absolute top-2.5 right-3" />
                      <input
                        type="password"
                        autoComplete="off"
                        value={pinDraft}
                        onChange={(e) => setPinDraft(e.target.value)}
                        placeholder="رمز فروشگاه را وارد کنید"
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 pr-9 pl-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isCheckingPin || !pinDraft.trim()}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                    >
                      {isCheckingPin ? 'بررسی...' : 'ثبت رمز'}
                    </button>
                  </div>
                  {pinError && <p className="text-[11px] text-rose-400">{pinError}</p>}
                </form>
              )}

              {/* Cloudflare KV Binding Notice if not yet attached */}
              {cloudflareStatus.reachable && !cloudflareStatus.kvConfigured && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/50 space-y-2 text-[11px] text-amber-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-400" />
                      <span>حافظه Cloudflare KV هنوز متصل نشده است</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowKvGuide((v) => !v)}
                      className="underline text-amber-300 hover:text-white shrink-0"
                    >
                      {showKvGuide ? 'بستن راهنما' : 'راهنمای ۳ مرحله‌ای'}
                    </button>
                  </div>
                  {showKvGuide && (
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-300 leading-relaxed pt-1 border-t border-amber-800/40">
                      <li>
                        در پنل Cloudflare وارد بخش <strong>Storage &amp; Databases → KV</strong> شوید و یک Namespace بسازید.
                      </li>
                      <li>
                        در پروژه Pages خود (<strong>estelam-005</strong>) به <strong>Settings → Bindings</strong> بروید، روی <strong>+ Add</strong> کلیک کرده و <strong>KV namespace</strong> را با نام متغیر <code className="font-mono text-emerald-300">SHOP_KV</code> (برای هر دو حالت <strong>Production</strong> و <strong>Preview</strong>) اضافه و ذخیره کنید.
                      </li>
                      <li>
                        پس از ذخیره Binding، یک بار از تب <strong>Deployments</strong> آخرین دیپلوی را <strong>Retry deployment</strong> بزنید تا حافظه KV روی سایت فعال شود و در صفحه ناشناس نیز همگام باشد.
                      </li>
                    </ol>
                  )}
                </div>
              )}

              {/* Shared Cloudflare Server URL + Backup Mirrors (Used by Relay, Windows EXE & Android APK) */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
                <label className="block text-[11px] font-semibold text-slate-300">
                  آدرس سرور کلادفلر یا واسط (رایگان و بدون فیلترشکن):
                </label>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  در مرورگر، سرور داخلی برنامه به‌صورت خودکار نقش واسط کلادفلر را دارد تا بدون فیلترشکن متصل شوید. برای اپ اندروید یا ویندوز می‌توانید آدرس سایت فعلی یا آدرس کلادفلر را وارد کنید.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    dir="ltr"
                    value={originDraft}
                    onChange={(e) => setOriginDraft(e.target.value)}
                    placeholder="https://estelam-005.pages.dev"
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    disabled={isSavingOrigin || !originDraft.trim()}
                    onClick={async () => {
                      setIsSavingOrigin(true);
                      try {
                        await onSaveCloudflareOrigin(originDraft);
                      } finally {
                        setIsSavingOrigin(false);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                  >
                    {isSavingOrigin ? 'اتصال...' : 'ذخیره آدرس'}
                  </button>
                </div>

                {onSaveCloudflareMirrors && (
                  <div className="pt-1 space-y-1.5">
                    <label className="block text-[11px] font-medium text-slate-400">
                      آدرس‌های پشتیبان اختیاری (در هر خط یک آدرس):
                    </label>
                    <textarea
                      dir="ltr"
                      rows={2}
                      value={mirrorsDraft}
                      onChange={(e) => setMirrorsDraft(e.target.value)}
                      placeholder="https://backup-relay.example.com"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={isSavingMirrors}
                      onClick={async () => {
                        setIsSavingMirrors(true);
                        try {
                          await onSaveCloudflareMirrors(mirrorsDraft);
                        } finally {
                          setIsSavingMirrors(false);
                        }
                      }}
                      className="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-[11px] font-semibold transition"
                    >
                      {isSavingMirrors ? 'در حال ذخیره...' : 'ذخیره آدرس‌های پشتیبان'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Section 4: Google Account (Firebase) */}
          <section className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-slate-200">۴. حساب گوگل (گوگل فایربیس)</h3>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              {userEmail ? (
                <>
                  <div className="min-w-0">
                    <span className="text-[11px] text-slate-400 block">حساب متصل:</span>
                    <span className="text-xs font-bold text-white truncate block">{userEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-800 text-xs font-semibold transition shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>خروج</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-400">
                    برای همگام‌سازی لحظه‌ای فایربیس وارد شوید:
                  </span>
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shrink-0"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>ورود گوگل</span>
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Section 5: Offline App / PWA / EXE / APK */}
          <section className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-xs font-bold text-slate-200">
              ۵. نصب برنامه و پایداری در نت ملی (EXE / APK / PWA)
            </h3>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                در زمان قطعی اینترنت بین‌الملل، نسخه ویندوز (EXE) در پس‌زمینه کنار ساعت هر ۳ ساعت قیمت‌ها را می‌گیرد و نسخه اندروید (APK) مستقیماً از دیجی‌کالا استعلام می‌گیرد. پس از بازگشت اینترنت، تمام تغییرات به‌طور خودکار در فایربیس و کلادفلر ادغام می‌شوند.
              </p>
              <PWAInstallButton />
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
