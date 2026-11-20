/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebase.ts';
import firebaseConfig from '../firebase-applet-config.json';
import {
  addBulkProductsToFirestore,
  addProductToFirestore,
  applyBundleToFirestore,
  calculateCustomerQuote,
  deleteProductFromFirestore,
  ensureSharedShopInitialized,
  fetchAllShopHistoriesFromFirestore,
  subscribeToSharedProducts,
  syncProductPriceInFirestore,
  updateProductBarcodesInFirestore,
  updateProductMarginInFirestore,
} from './services/firestoreProducts.ts';
import {
  changeShopPinOnEdge,
  clearSavedShopPin,
  createSeedOfflineBundle,
  downloadBackupJson,
  fetchCloudflareBundle,
  getCloudflareMirrors,
  getCloudflareOrigin,
  getJalaliNowParts,
  getSavedShopPin,
  getStoragePreference,
  loadOfflineBundle,
  mergeBundles,
  normalizeProductItem,
  probeCloudflareStatus,
  probeFirebaseReachable,
  pushCloudflareBundle,
  saveOfflineBundle,
  setCloudflareMirrors as persistCloudflareMirrors,
  setCloudflareOrigin as persistCloudflareOrigin,
  setSavedShopPin,
  setStoragePreference as persistStoragePreference,
  verifyShopPinOnEdge,
} from './services/storageSync.ts';
import { ShopHeader } from './components/ShopHeader.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ProductCard, ViewLayout } from './components/ProductCard.tsx';
import { ProductDetailModal } from './components/ProductDetailModal.tsx';
import { AddProductModal } from './components/AddProductModal.tsx';
import { BarcodeScannerModal } from './components/BarcodeScannerModal.tsx';
import { SchedulerModal } from './components/SchedulerModal.tsx';
import { RightDrawerMenu } from './components/RightDrawerMenu.tsx';
import { BulkPriceInquiryView } from './components/BulkPriceInquiryView.tsx';
import { JalaliDateRangeFilter } from './components/JalaliDateRangeFilter.tsx';
import { ProductSortMenu } from './components/ProductSortMenu.tsx';
import { normalizeBarcodeList } from './utils/barcodeUtils.ts';
import { useOnlineStatus } from './hooks/useOnlineStatus.ts';
import { usePWAInstall } from './hooks/usePWAInstall.ts';
import { useBackNavigation } from './hooks/useBackNavigation.ts';
import {
  fetchLiveDigikalaProductClient,
  markClient3HourSlotDone,
  shouldRunClient3HourAutoSync,
} from './utils/clientDigikalaScraper.ts';
import { FIXED_SCHEDULE_HOURS, getNextScheduledRefresh } from './utils/schedule.ts';
import {
  BackupBundle,
  CloudflareStatus,
  CloudflareSyncState,
  ConnectionHealthState,
  PriceHistoryItem,
  ProductItem,
  SchedulerInfo,
  StorageMode,
  StoragePreference,
} from './types.ts';
import {
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Package,
  Cloud,
  Laptop,
  LogIn,
  Shield,
  ExternalLink,
  KeyRound,
  HardDrive,
  RefreshCw,
  Globe,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';
import { JalaliDate, toPersianDigits } from './utils/jalali.ts';
import { filterAndSortProducts, ProductSortOption } from './utils/productFilterSort.ts';

async function fetchLiveDigikalaPrice(sourceUrl: string) {
  if (!sourceUrl?.trim()) return null;
  const { data } = await fetchLiveDigikalaProductClient({ url: sourceUrl.trim() });
  return data;
}

export default function App() {
  const isBrowserOnline = useOnlineStatus();
  const { isNativeAndroid, isElectronDesktop } = usePWAInstall();

  // Multi-backend connectivity & auth states
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cfProbeDone, setCfProbeDone] = useState(false);
  const [fbProbeDone, setFbProbeDone] = useState(false);
  const probeDone = cfProbeDone && fbProbeDone;
  const [firebaseReachable, setFirebaseReachable] = useState(true);
  const [firebaseDeniedEmail, setFirebaseDeniedEmail] = useState<string | null>(null);
  const [cloudflareStatus, setCloudflareStatus] = useState<CloudflareStatus>({
    reachable: false,
    kvConfigured: false,
  });
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealthState>('healthy');

  const [storagePreference, setStoragePreference] = useState<StoragePreference>(() =>
    getStoragePreference()
  );
  const [cloudflareOrigin, setCloudflareOriginState] = useState<string>(() => getCloudflareOrigin());
  const [cloudflareMirrors, setCloudflareMirrorsState] = useState<string[]>(() =>
    getCloudflareMirrors()
  );
  const [savedPin, setSavedPin] = useState<string>(() => getSavedShopPin());
  const [pinVerified, setPinVerified] = useState<boolean>(false);
  const [offlineEntered, setOfflineEntered] = useState<boolean>(false);

  // Entry screen form states
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<{ message: string; unauthorizedDomain?: string } | null>(
    null
  );
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [showGateServerEditor, setShowGateServerEditor] = useState(false);
  const [gateOriginInput, setGateOriginInput] = useState<string>(() => getCloudflareOrigin());

  // Products, histories & sync states
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [histories, setHistories] = useState<Record<string, PriceHistoryItem[]>>({});
  const [deletedIds, setDeletedIds] = useState<Record<string, string>>(
    () => loadOfflineBundle()?.deletedIds || {}
  );
  const [loading, setLoading] = useState(true);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastCloudflareSyncedAt, setLastCloudflareSyncedAt] = useState<string | null>(null);
  const [cloudflareSyncError, setCloudflareSyncError] = useState<string | null>(null);
  const [isPushingCloudflare, setIsPushingCloudflare] = useState(false);
  const [bannerPinInput, setBannerPinInput] = useState('');
  const [bannerPinError, setBannerPinError] = useState<string | null>(null);
  const [isUnlockingBannerPin, setIsUnlockingBannerPin] = useState(false);

  // View Layout mode: grid-4 | grid-3 | list | compact | large
  const [layout, setLayout] = useState<ViewLayout>(() => {
    const saved = localStorage.getItem('shop_preferred_layout');
    return (saved as ViewLayout) || 'grid-4';
  });

  const handleLayoutChange = (newLayout: ViewLayout) => {
    setLayout(newLayout);
    localStorage.setItem('shop_preferred_layout', newLayout);
  };

  // Filters, Sorting & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [fromDate, setFromDate] = useState<JalaliDate | null>(null);
  const [toDate, setToDate] = useState<JalaliDate | null>(null);
  const [sortBy, setSortBy] = useState<ProductSortOption>(() => {
    const saved = localStorage.getItem('shop_preferred_sort');
    if (saved === 'newest' || saved === 'oldest' || saved === 'price_desc' || saved === 'price_asc') {
      return saved;
    }
    return 'newest';
  });
  const handleSortChange = (nextSort: ProductSortOption) => {
    setSortBy(nextSort);
    try {
      localStorage.setItem('shop_preferred_sort', nextSort);
    } catch {
      // Ignore storage errors
    }
  };
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scheduler Info
  const [schedulerInfo, setSchedulerInfo] = useState<SchedulerInfo | null>(null);

  const CONSECUTIVE_FAIL_THRESHOLD = 3;
  const syncInFlightRef = useRef(false);
  const initialFirebaseReconciledRef = useRef(false);
  const lastServerSyncReportTsRef = useRef<string | null>(null);
  const lastFirebaseInitErrorAtRef = useRef<number>(0);
  const wasBrowserOnlineRef = useRef<boolean>(isBrowserOnline);
  const firebaseReachableRef = useRef<boolean>(firebaseReachable);
  const firebaseDeniedRef = useRef<string | null>(firebaseDeniedEmail);
  const cloudflareStatusRef = useRef<CloudflareStatus>(cloudflareStatus);
  const cloudflareFailCountRef = useRef<number>(0);
  const firebaseFailCountRef = useRef<number>(0);
  const handleRefreshAllRef = useRef<(isAuto?: boolean) => Promise<void>>(async () => {});
  const productsRef = useRef<ProductItem[]>(products);
  const historiesRef = useRef<Record<string, PriceHistoryItem[]>>(histories);
  const deletedIdsRef = useRef<Record<string, string>>(deletedIds);
  const lastCloudflareSyncedAtRef = useRef<string | null>(lastCloudflareSyncedAt);
  const cloudflareSyncPendingRef = useRef<boolean>(false);

  useEffect(() => {
    firebaseReachableRef.current = firebaseReachable;
  }, [firebaseReachable]);
  useEffect(() => {
    firebaseDeniedRef.current = firebaseDeniedEmail;
  }, [firebaseDeniedEmail]);
  useEffect(() => {
    cloudflareStatusRef.current = cloudflareStatus;
  }, [cloudflareStatus]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);
  useEffect(() => {
    historiesRef.current = histories;
  }, [histories]);
  useEffect(() => {
    deletedIdsRef.current = deletedIds;
  }, [deletedIds]);
  useEffect(() => {
    lastCloudflareSyncedAtRef.current = lastCloudflareSyncedAt;
  }, [lastCloudflareSyncedAt]);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const showGateServerEditorRef = useRef(showGateServerEditor);
  useEffect(() => {
    showGateServerEditorRef.current = showGateServerEditor;
  }, [showGateServerEditor]);

  const {
    selectedProductId,
    isBulkInquiryOpen,
    isDrawerOpen,
    isAddModalOpen,
    isBarcodeScannerOpen,
    isSchedulerModalOpen,
    deleteTarget,
    openProductDetail,
    closeProductDetail,
    openBulkInquiry,
    closeBulkInquiry,
    openDrawer,
    closeDrawer,
    openAddModal,
    closeAddModal,
    openBarcodeScanner,
    closeBarcodeScanner,
    openSchedulerModal,
    closeSchedulerModal,
    openDeleteConfirm,
    closeDeleteConfirm,
    closeAfterProductDelete,
  } = useBackNavigation({
    onShowExitConfirmToast: showToast,
    onRootBackFallback: () => {
      if (showGateServerEditorRef.current) {
        setShowGateServerEditor(false);
        return true;
      }
      return false;
    },
  });

  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;

  const recordCloudflareSuccess = useCallback((nextStatus: CloudflareStatus) => {
    cloudflareFailCountRef.current = 0;
    setCloudflareStatus(nextStatus);
    setConnectionHealth('healthy');
  }, []);

  const recordCloudflareFailure = useCallback((forceImmediate = false): boolean => {
    cloudflareFailCountRef.current = forceImmediate
      ? CONSECUTIVE_FAIL_THRESHOLD
      : cloudflareFailCountRef.current + 1;

    if (cloudflareFailCountRef.current < CONSECUTIVE_FAIL_THRESHOLD) {
      setConnectionHealth((prev) => (prev === 'offline' ? 'offline' : 'degraded'));
      return false;
    }

    setCloudflareStatus((prev) => ({ ...prev, reachable: false }));
    setConnectionHealth('offline');
    return true;
  }, []);

  const recordFirebaseSuccess = useCallback(() => {
    firebaseFailCountRef.current = 0;
    setFirebaseReachable(true);
    setConnectionHealth('healthy');
  }, []);

  const recordFirebaseFailure = useCallback((forceImmediate = false): boolean => {
    firebaseFailCountRef.current = forceImmediate
      ? CONSECUTIVE_FAIL_THRESHOLD
      : firebaseFailCountRef.current + 1;

    if (firebaseFailCountRef.current < CONSECUTIVE_FAIL_THRESHOLD) {
      setConnectionHealth((prev) => (prev === 'offline' ? 'offline' : 'degraded'));
      return false;
    }

    setFirebaseReachable(false);
    return true;
  }, []);

  // Resolve active storage mode based on preference + live reachability + permission
  const resolveStorageMode = (): StorageMode => {
    const cloudflareReady =
      cloudflareStatus.reachable && cloudflareStatus.kvConfigured && pinVerified;
    if (storagePreference === 'cloudflare') {
      return cloudflareReady ? 'cloudflare' : 'offline';
    }
    if (storagePreference === 'firebase') {
      if (firebaseReachable && user && !firebaseDeniedEmail) return 'firebase';
      return cloudflareReady ? 'cloudflare' : 'offline';
    }
    // 'auto' mode: default Firebase, auto-failover to Cloudflare KV if Firebase is down/denied, else Offline
    if (firebaseReachable && user && !firebaseDeniedEmail) return 'firebase';
    return cloudflareReady ? 'cloudflare' : 'offline';
  };

  const storageMode: StorageMode = resolveStorageMode();

  const cloudflareSyncState: CloudflareSyncState = (() => {
    if (!cfProbeDone) return 'idle';
    if (isPushingCloudflare || isSyncingCloud) return 'syncing';
    if (!cloudflareStatus.reachable) return 'unreachable';
    if (!cloudflareStatus.kvConfigured) return 'kv_missing';
    if (!savedPin || !pinVerified) return 'pin_required';
    if (cloudflareSyncError) return 'error';
    if (lastCloudflareSyncedAt) return 'synced';
    return 'idle';
  })();

  // Check whether user can view the main dashboard vs entry/PIN gate
  const hasDashboardAccess = (() => {
    if (!authReady || !cfProbeDone) return false;
    if (storagePreference === 'firebase') {
      return Boolean(firebaseReachable && user && !firebaseDeniedEmail) || offlineEntered;
    }
    if (storagePreference === 'cloudflare') {
      if (cloudflareStatus.reachable) return pinVerified || offlineEntered;
      // Offline entry without explicit click only if user previously authenticated with PIN
      return Boolean(savedPin) || offlineEntered;
    }
    // Auto mode:
    if (firebaseReachable && user && !firebaseDeniedEmail) return true;
    if ((!firebaseReachable || firebaseDeniedEmail) && cloudflareStatus.reachable) {
      return pinVerified || offlineEntered;
    }
    if (firebaseReachable && !user && pinVerified && cloudflareStatus.reachable) return true;
    if (!firebaseReachable && !cloudflareStatus.reachable) {
      // Total outage: auto-enter offline dashboard ONLY if the user previously logged in before
      if (savedPin || user) return true;
      return offlineEntered;
    }
    return offlineEntered;
  })();

  // 1. Initial Firebase Auth listener + fallback timer (prevents hang if Google is blocked)
  useEffect(() => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        setAuthReady(true);
      }
    }, 3800);

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      settled = true;
      clearTimeout(timeout);
      setUser(firebaseUser);
      setFirebaseDeniedEmail(null);
      setAuthReady(true);
      if (!firebaseUser) {
        initialFirebaseReconciledRef.current = false;
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  // 2. Independent reachability probes for Firebase and Cloudflare/Relay (+ instant PIN verification)
  useEffect(() => {
    let active = true;
    let cfSettled = false;
    let fbSettled = false;
    let cfOkResult = false;
    let fbOkResult = false;

    const finalizeHealth = () => {
      if (!active || !cfSettled || !fbSettled) return;
      if (!fbOkResult && !cfOkResult) {
        setConnectionHealth('offline');
      } else {
        setConnectionHealth('healthy');
      }
    };

    async function runCloudflareProbe() {
      let cfStatus = await probeCloudflareStatus();
      if (!active) return;

      // Silent warm-up retry on cold DNS/TLS hiccup when device reports online
      if (!cfStatus.reachable && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        setConnectionHealth('degraded');
        await new Promise((r) => setTimeout(r, 700));
        if (!active) return;
        cfStatus = await probeCloudflareStatus();
        if (!active) return;
      }

      cfOkResult = cfStatus.reachable;
      if (cfStatus.reachable) {
        recordCloudflareSuccess(cfStatus);
        const currentSavedPin = getSavedShopPin();
        if (currentSavedPin) {
          const pinCheck = await verifyShopPinOnEdge(currentSavedPin);
          if (!active) return;
          if (pinCheck.valid) {
            setPinVerified(true);
          } else if (pinCheck.unauthorized) {
            clearSavedShopPin();
            setSavedPin('');
            setPinVerified(false);
          }
        }
      } else {
        setCloudflareStatus(cfStatus);
      }

      cfSettled = true;
      setCfProbeDone(true);
      finalizeHealth();
    }

    async function runFirebaseProbe() {
      if (getStoragePreference() === 'cloudflare') {
        fbOkResult = false;
        setFirebaseReachable(false);
        fbSettled = true;
        setFbProbeDone(true);
        finalizeHealth();
        return;
      }

      const fbOk = await probeFirebaseReachable(2800);
      if (!active) return;
      fbOkResult = fbOk;
      if (fbOk) {
        recordFirebaseSuccess();
      } else {
        setFirebaseReachable(false);
      }
      fbSettled = true;
      setFbProbeDone(true);
      finalizeHealth();
    }

    runCloudflareProbe();
    runFirebaseProbe();

    return () => {
      active = false;
    };
  }, [recordCloudflareSuccess, recordFirebaseSuccess]);

  // Helper: persist snapshot to local offline cache + mirror to Cloudflare KV when authorized
  const mirrorBundleToSecondary = useCallback(
    async (
      nextProducts: ProductItem[],
      nextHistories: Record<string, PriceHistoryItem[]>,
      nextDeletedIds: Record<string, string>,
      sourceTag = 'shop-sync'
    ): Promise<boolean> => {
      const bundle: BackupBundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        source: sourceTag,
        products: nextProducts,
        histories: nextHistories,
        deletedIds: nextDeletedIds,
      };

      if (savedPin && pinVerified && cloudflareStatus.reachable && cloudflareStatus.kvConfigured) {
        setIsPushingCloudflare(true);
        try {
          const pushRes = await pushCloudflareBundle(savedPin, {
            ...bundle,
            source:
              sourceTag === 'dual-sync' || sourceTag === 'firebase-live'
                ? 'cloudflare-kv'
                : sourceTag,
          });

          if (pushRes.unauthorized) {
            clearSavedShopPin();
            setSavedPin('');
            setPinVerified(false);
            cloudflareSyncPendingRef.current = true;
            setCloudflareSyncError('رمز فروشگاه کلادفلر منقضی یا نادرست است');
            saveOfflineBundle({ ...bundle, source: 'offline-dirty' });
            setLastSyncedAt(bundle.exportedAt);
            return false;
          }

          if (!pushRes.kvConfigured) {
            setCloudflareStatus((prev) => ({ ...prev, kvConfigured: false, kvBindingName: null }));
            cloudflareSyncPendingRef.current = true;
            setCloudflareSyncError('حافظه KV در Bindings کلادفلر متصل نیست');
            saveOfflineBundle({ ...bundle, source: 'offline-dirty' });
            setLastSyncedAt(bundle.exportedAt);
            return false;
          }

          if (!pushRes.saved) {
            cloudflareSyncPendingRef.current = true;
            setCloudflareSyncError(pushRes.error || 'ارسال تغییرات به کلادفلر ناموفق بود');
            saveOfflineBundle({ ...bundle, source: 'offline-dirty' });
            setLastSyncedAt(bundle.exportedAt);
            if (!pushRes.reachable) {
              recordCloudflareFailure();
            }
            return false;
          }

          const syncedAt = new Date().toISOString();
          cloudflareSyncPendingRef.current = false;
          setCloudflareSyncError(null);
          setLastCloudflareSyncedAt(syncedAt);
          saveOfflineBundle({ ...bundle, exportedAt: syncedAt, source: sourceTag });
          setLastSyncedAt(syncedAt);
          recordCloudflareSuccess({
            ...cloudflareStatus,
            reachable: true,
            kvConfigured: true,
          });
          return true;
        } finally {
          setIsPushingCloudflare(false);
        }
      }

      cloudflareSyncPendingRef.current = true;
      if (cloudflareStatus.reachable && cloudflareStatus.kvConfigured && (!savedPin || !pinVerified)) {
        setCloudflareSyncError('برای انتقال تغییرات به کلادفلر و سایت دوم، رمز فروشگاه لازم است');
      } else if (cloudflareStatus.reachable && !cloudflareStatus.kvConfigured) {
        setCloudflareSyncError('حافظه KV در Bindings کلادفلر متصل نیست');
      } else if (!cloudflareStatus.reachable) {
        setCloudflareSyncError('دسترسی به سرور کلادفلر برقرار نیست');
      }
      saveOfflineBundle({ ...bundle, source: 'offline-dirty' });
      setLastSyncedAt(bundle.exportedAt);
      return false;
    },
    [
      savedPin,
      pinVerified,
      cloudflareStatus,
      recordCloudflareFailure,
      recordCloudflareSuccess,
    ]
  );

  // 3. Reconcile / Bidirectional sync between Firebase & Cloudflare KV
  const reconcileDualClouds = useCallback(
    async (
      firebaseUser: User,
      fbProducts: ProductItem[],
      fbHistories?: Record<string, PriceHistoryItem[]>
    ) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      setIsSyncingCloud(true);

      try {
        const loadedHistories =
          fbHistories || (await fetchAllShopHistoriesFromFirestore(fbProducts));
        setHistories(loadedHistories);

        const fbBundle: BackupBundle = {
          version: 1,
          exportedAt: new Date().toISOString(),
          source: 'firebase',
          products: fbProducts,
          histories: loadedHistories,
          deletedIds: deletedIdsRef.current,
        };

        let unifiedBundle = fbBundle;

        // Check offline pending changes saved while internet or Cloudflare was down
        const offlineCached = loadOfflineBundle();
        if (offlineCached && offlineCached.source === 'offline-dirty') {
          unifiedBundle = mergeBundles(unifiedBundle, offlineCached, false);
        }

        // Check Cloudflare KV if reachable and PIN verified
        if (savedPin && pinVerified && cloudflareStatus.reachable && cloudflareStatus.kvConfigured) {
          const cfRes = await fetchCloudflareBundle(savedPin);
          if (cfRes.unauthorized) {
            clearSavedShopPin();
            setSavedPin('');
            setPinVerified(false);
            setCloudflareSyncError('رمز فروشگاه کلادفلر منقضی یا نادرست است');
          } else if (cfRes.reachable && !cfRes.kvConfigured) {
            setCloudflareStatus((prev) => ({ ...prev, kvConfigured: false, kvBindingName: null }));
            setCloudflareSyncError('حافظه KV در Bindings کلادفلر متصل نیست');
          } else if (cfRes.reachable && cfRes.bundle) {
            unifiedBundle = mergeBundles(unifiedBundle, cfRes.bundle, false);
          }
        }

        // Check if unified bundle differs from current Firestore snapshot
        const fbMap = new Map(fbProducts.map((p) => [p.id, p]));
        const hasDiffForFirebase =
          unifiedBundle.products.length !== fbProducts.length ||
          unifiedBundle.products.some((up) => {
            const fp = fbMap.get(up.id);
            if (!fp) return true;
            return (
              fp.currentPriceToman !== up.currentPriceToman ||
              fp.customerQuoteToman !== up.customerQuoteToman ||
              fp.marginPercent !== up.marginPercent ||
              fp.notes !== up.notes ||
              fp.name !== up.name ||
              fp.category !== up.category ||
              fp.sourceUrl !== up.sourceUrl ||
              fp.imageUrl !== up.imageUrl ||
              fp.warranty !== up.warranty ||
              fp.stockStatus !== up.stockStatus ||
              JSON.stringify(fp.barcodes || []) !== JSON.stringify(up.barcodes || [])
            );
          }) ||
          fbProducts.some((fp) => {
            const delIso = unifiedBundle.deletedIds?.[fp.id];
            const delTime = delIso ? new Date(delIso).getTime() : 0;
            const fpRawTime = new Date(
              fp.updatedAt || fp.lastRefreshedAt || fp.createdAt
            ).getTime();
            const fpTime = Number.isFinite(fpRawTime) ? fpRawTime : 0;
            return Number.isFinite(delTime) && delTime > fpTime;
          });

        if (hasDiffForFirebase) {
          await applyBundleToFirestore(firebaseUser.uid, unifiedBundle, 'replace');
        }

        deletedIdsRef.current = unifiedBundle.deletedIds || {};
        setDeletedIds(unifiedBundle.deletedIds || {});
        setHistories(unifiedBundle.histories || {});
        await mirrorBundleToSecondary(
          unifiedBundle.products,
          unifiedBundle.histories || {},
          unifiedBundle.deletedIds || {},
          'dual-sync'
        );
      } catch (err) {
        console.error('Dual cloud reconciliation warning:', err);
      } finally {
        setIsSyncingCloud(false);
        syncInFlightRef.current = false;
      }
    },
    [
      savedPin,
      pinVerified,
      cloudflareStatus.reachable,
      cloudflareStatus.kvConfigured,
      mirrorBundleToSecondary,
    ]
  );

  // 4. Primary Data Loader Effect based on active storageMode
  useEffect(() => {
    if (!cfProbeDone) return;

    // Mode A: Firebase Primary
    if (storageMode === 'firebase' && user) {
      if (!fbProbeDone) {
        if (productsRef.current.length === 0) {
          const cached = loadOfflineBundle();
          if (cached && cached.products.length > 0) {
            setProducts(cached.products);
            setHistories(cached.histories || {});
            setDeletedIds(cached.deletedIds || {});
          }
        }
        return;
      }
      let isActive = true;
      let unsubscribeProducts: (() => void) | undefined;

      async function initFirebaseSync() {
        if (!user) return;
        try {
          setLoading(true);
          await Promise.race([
            ensureSharedShopInitialized(user),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('firebase-timeout')), 15000)
            ),
          ]);
          if (!isActive) return;

          unsubscribeProducts = subscribeToSharedProducts(
            async (cloudProducts) => {
              if (!isActive) return;
              recordFirebaseSuccess();
              setProducts(cloudProducts);
              setLoading(false);

              if (!initialFirebaseReconciledRef.current) {
                initialFirebaseReconciledRef.current = true;
                await reconcileDualClouds(user, cloudProducts);
              } else {
                const updatedHist = await fetchAllShopHistoriesFromFirestore(cloudProducts).catch(
                  () => historiesRef.current
                );
                if (isActive) {
                  setHistories(updatedHist);
                  mirrorBundleToSecondary(
                    cloudProducts,
                    updatedHist,
                    deletedIdsRef.current,
                    'firebase-live'
                  );
                }
              }
            },
            (err: any) => {
              if (!isActive) return;
              const msg = String(err?.message || '').toLowerCase();
              const isPerm =
                err?.code === 'permission-denied' || msg.includes('insufficient permissions');
              setLoading(false);
              if (isPerm) {
                setFirebaseDeniedEmail(user.email || 'حساب فعلی');
                showToast(
                  `ایمیل ${user.email || ''} در قوانین Firestore مجاز نیست؛ لطفاً با ایمیل مجاز یا کلادفلر وارد شوید`
                );
              } else {
                lastFirebaseInitErrorAtRef.current = Date.now();
                const confirmedDown = recordFirebaseFailure();
                if (confirmedDown) {
                  showToast('اختلال پایدار در اتصال فایربیس؛ انتقال خودکار به کلادفلر / کش محلی');
                }
              }
            }
          );
        } catch (err: any) {
          console.warn('Firebase init fallback:', err?.message);
          if (isActive) {
            const msg = String(err?.message || '').toLowerCase();
            const isPerm =
              err?.code === 'permission-denied' || msg.includes('insufficient permissions');
            setLoading(false);
            if (isPerm) {
              setFirebaseDeniedEmail(user.email || 'حساب فعلی');
              showToast(
                `ایمیل ${user.email || ''} هنوز در قوانین Firestore مجاز نشده است`
              );
            } else {
              lastFirebaseInitErrorAtRef.current = Date.now();
              recordFirebaseFailure();
            }
          }
        }
      }

      initFirebaseSync();

      return () => {
        isActive = false;
        if (unsubscribeProducts) unsubscribeProducts();
      };
    }

    // Mode B: Cloudflare KV / Relay (No VPN needed)
    if (storageMode === 'cloudflare' && savedPin && pinVerified) {
      let isActive = true;
      async function initCloudflareSync() {
        if (productsRef.current.length === 0) {
          setLoading(true);
        }
        const cfRes = await fetchCloudflareBundle(savedPin);
        if (!isActive) return;

        if (cfRes.unauthorized) {
          clearSavedShopPin();
          setSavedPin('');
          setPinVerified(false);
          setLoading(false);
          showToast('رمز فروشگاه منقضی یا تغییر کرده است؛ لطفاً دوباره وارد کنید');
          return;
        }

        if (!cfRes.reachable) {
          // Transient fetch failure: keep current UI products intact and mark degraded for background retry
          recordCloudflareFailure();
          if (productsRef.current.length === 0) {
            const fallbackCached = loadOfflineBundle() || createSeedOfflineBundle();
            setProducts(fallbackCached.products);
            setHistories(fallbackCached.histories || {});
            setDeletedIds(fallbackCached.deletedIds || {});
          }
          setLoading(false);
          return;
        }

        const offlineCached = loadOfflineBundle();
        let activeBundle: BackupBundle;
        let cfPushSucceeded = true;

        if (cfRes.kvConfigured && cfRes.bundle) {
          activeBundle =
            offlineCached && offlineCached.source === 'offline-dirty'
              ? mergeBundles(cfRes.bundle, offlineCached, false)
              : cfRes.bundle;

          if (offlineCached && offlineCached.source === 'offline-dirty') {
            const pushRes = await pushCloudflareBundle(savedPin, activeBundle);
            cfPushSucceeded = pushRes.saved;
          }
        } else if (offlineCached) {
          activeBundle = offlineCached;
          if (cfRes.kvConfigured) {
            const pushRes = await pushCloudflareBundle(savedPin, activeBundle);
            cfPushSucceeded = pushRes.saved;
          } else {
            cfPushSucceeded = false;
          }
        } else {
          activeBundle = createSeedOfflineBundle();
          if (cfRes.kvConfigured) {
            const pushRes = await pushCloudflareBundle(savedPin, activeBundle);
            cfPushSucceeded = pushRes.saved;
          } else {
            cfPushSucceeded = false;
          }
        }

        if (!isActive) return;
        const nowSyncIso = new Date().toISOString();
        deletedIdsRef.current = activeBundle.deletedIds || {};
        setProducts(activeBundle.products);
        setHistories(activeBundle.histories || {});
        setDeletedIds(activeBundle.deletedIds || {});
        saveOfflineBundle({
          ...activeBundle,
          source: cfPushSucceeded ? 'cloudflare-kv' : 'offline-dirty',
        });
        setLastSyncedAt(nowSyncIso);
        if (cfPushSucceeded && cfRes.kvConfigured) {
          cloudflareSyncPendingRef.current = false;
          setCloudflareSyncError(null);
          setLastCloudflareSyncedAt(nowSyncIso);
        } else {
          cloudflareSyncPendingRef.current = true;
          setCloudflareSyncError(
            cfRes.kvConfigured
              ? 'همگام‌سازی کامل با کلادفلر انجام نشد'
              : 'حافظه KV در Bindings کلادفلر متصل نیست'
          );
        }
        setLoading(false);
      }

      initCloudflareSync();
      return () => {
        isActive = false;
      };
    }

    // Mode C: Offline Local Cache (Non-destructive: never clobber already loaded in-memory products)
    if (hasDashboardAccess && storageMode === 'offline' && (probeDone || offlineEntered)) {
      if (productsRef.current.length === 0) {
        const cached = loadOfflineBundle() || createSeedOfflineBundle();
        setProducts(cached.products);
        setHistories(cached.histories || {});
        setDeletedIds(cached.deletedIds || {});
        saveOfflineBundle(cached);
      }
      setLoading(false);
    } else if (probeDone && !hasDashboardAccess) {
      setLoading(false);
    }
  }, [
    probeDone,
    cfProbeDone,
    fbProbeDone,
    offlineEntered,
    storageMode,
    user,
    savedPin,
    pinVerified,
    hasDashboardAccess,
    reconcileDualClouds,
    mirrorBundleToSecondary,
    recordCloudflareFailure,
    recordFirebaseFailure,
    recordFirebaseSuccess,
    showToast,
  ]);

  // Fetch scheduler info (with local offline 3-hour fallback + Electron background sync detection)
  const fetchScheduler = useCallback(async () => {
    const applyLocalFallback = () => {
      const next = getNextScheduledRefresh();
      setSchedulerInfo((prev) => ({
        nextScheduledTime: next.formattedTargetTime,
        remainingMinutes: next.remainingMinutes,
        lastAutoSyncTime: prev?.lastAutoSyncTime || null,
        fixedScheduleHours: FIXED_SCHEDULE_HOURS,
      }));
    };

    if (isNativeAndroid) {
      applyLocalFallback();
      return;
    }

    try {
      const res = await fetch('/api/scheduler/status');
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success) {
          setSchedulerInfo(json);

          // If local Node/Electron tray daemon ran a newer 3-hour sync while minimized, reload & push to clouds
          const reportTs = json?.lastSyncReport?.timestamp;
          if (
            reportTs &&
            lastServerSyncReportTsRef.current !== null &&
            reportTs !== lastServerSyncReportTsRef.current &&
            savedPin
          ) {
            const localRes = await fetchCloudflareBundle(savedPin);
            if (localRes.reachable && !localRes.unauthorized && localRes.bundle) {
              const currentBundle: BackupBundle = {
                version: 1,
                exportedAt: new Date().toISOString(),
                source: 'ui-state',
                products: productsRef.current,
                histories: historiesRef.current,
                deletedIds: deletedIdsRef.current,
              };
              const merged = mergeBundles(currentBundle, localRes.bundle, false);
              const changedComparedToUi =
                merged.products.length !== productsRef.current.length ||
                JSON.stringify(merged.products) !== JSON.stringify(productsRef.current);

              if (changedComparedToUi) {
                setProducts(merged.products);
                setHistories(merged.histories);
                setDeletedIds(merged.deletedIds || {});
                saveOfflineBundle({ ...merged, source: 'offline-dirty' });

                if (user && firebaseReachable) {
                  await reconcileDualClouds(user, merged.products, merged.histories);
                }
              }
            }
          }
          if (reportTs) {
            lastServerSyncReportTsRef.current = reportTs;
          }
          return;
        }
      }
      applyLocalFallback();
    } catch {
      applyLocalFallback();
    }
  }, [isNativeAndroid, savedPin, user, firebaseReachable, reconcileDualClouds]);

  useEffect(() => {
    fetchScheduler();
    const interval = setInterval(fetchScheduler, 60000);
    return () => clearInterval(interval);
  }, [fetchScheduler]);

  // Multi-step health verification + silent background sync & anti-flicker Net-Melli recovery
  useEffect(() => {
    if (!probeDone) return;

    let cancelled = false;
    const checkAndAutoMergeOnRecovery = async () => {
      if (cancelled || syncInFlightRef.current) return;
      const offlineCached = loadOfflineBundle();
      const hasDirtyOfflineChanges = offlineCached?.source === 'offline-dirty';
      const fbUp = firebaseReachableRef.current;
      const cfUp = cloudflareStatusRef.current.reachable;
      const isDenied = Boolean(firebaseDeniedRef.current);

      const inFirebaseCooldown = Date.now() - lastFirebaseInitErrorAtRef.current < 25000;
      const shouldProbeFb =
        (!fbUp || connectionHealth === 'degraded') && !isDenied && !inFirebaseCooldown;
      const shouldProbeCf =
        !cfUp ||
        connectionHealth !== 'healthy' ||
        hasDirtyOfflineChanges ||
        cloudflareSyncPendingRef.current ||
        !lastCloudflareSyncedAtRef.current ||
        storagePreference !== 'firebase';

      if (!shouldProbeFb && !shouldProbeCf) return;

      const [fbOk, cfStatus] = await Promise.all([
        shouldProbeFb ? probeFirebaseReachable(3800) : Promise.resolve(fbUp),
        shouldProbeCf ? probeCloudflareStatus() : Promise.resolve(cloudflareStatusRef.current),
      ]);
      if (cancelled) return;

      if (shouldProbeFb) {
        if (fbOk) {
          recordFirebaseSuccess();
        } else if (fbUp) {
          recordFirebaseFailure();
        }
      }

      if (shouldProbeCf) {
        if (cfStatus.reachable) {
          recordCloudflareSuccess(cfStatus);
        } else {
          // Only mark degraded/offline via 3-strike hysteresis when previously connected,
          // or keep offline if never connected yet
          if (cfUp) {
            recordCloudflareFailure();
          } else {
            setCloudflareStatus(cfStatus);
          }
        }
      }

      // If Cloudflare/Relay recovered and user has a stored PIN, verify automatically
      let isPinOk = pinVerified;
      if (cfStatus.reachable && savedPin && !isPinOk) {
        const pinCheck = await verifyShopPinOnEdge(savedPin);
        if (cancelled) return;
        if (pinCheck.valid) {
          setPinVerified(true);
          isPinOk = true;
        } else if (pinCheck.unauthorized) {
          clearSavedShopPin();
          setSavedPin('');
          setPinVerified(false);
          setCloudflareSyncError('رمز فروشگاه کلادفلر منقضی یا نادرست است');
        }
      }

      // If Firebase is reachable & user is signed in, reconcile with both Firebase & Cloudflare KV
      if (fbOk && !isDenied && user && storagePreference !== 'cloudflare') {
        const wasFbOffline = !fbUp;
        const needsCfReconcile =
          cfStatus.reachable &&
          cfStatus.kvConfigured &&
          savedPin &&
          isPinOk &&
          (cloudflareSyncPendingRef.current || !lastCloudflareSyncedAtRef.current || !cfUp);
        if (wasFbOffline || hasDirtyOfflineChanges || needsCfReconcile) {
          await reconcileDualClouds(user, productsRef.current, historiesRef.current);
          if (wasFbOffline) {
            showToast('اتصال اینترنت برقرار شد؛ تغییرات زمان نت ملی به فایربیس و کلادفلر ادغام شد');
          }
        }
        return;
      }

      // Silent background sync of pending offline-dirty changes once Cloudflare/Relay is healthy
      if (
        cfStatus.reachable &&
        cfStatus.kvConfigured &&
        savedPin &&
        isPinOk &&
        hasDirtyOfflineChanges &&
        offlineCached
      ) {
        const wasOffline = !cfUp;
        const remote = await fetchCloudflareBundle(savedPin);
        if (cancelled || !remote.reachable) return;
        const merged = remote.bundle
          ? mergeBundles(remote.bundle, offlineCached, false)
          : offlineCached;
        const cleanBundle: BackupBundle = {
          ...merged,
          exportedAt: new Date().toISOString(),
          source: 'cloudflare-kv',
        };
        const pushRes = await pushCloudflareBundle(savedPin, cleanBundle);
        if (cancelled || !pushRes.saved) return;

        if (
          merged.products.length !== productsRef.current.length ||
          JSON.stringify(merged.products) !== JSON.stringify(productsRef.current)
        ) {
          deletedIdsRef.current = cleanBundle.deletedIds || {};
          setProducts(cleanBundle.products);
          setHistories(cleanBundle.histories);
          setDeletedIds(cleanBundle.deletedIds || {});
        }
        saveOfflineBundle(cleanBundle);
        setLastSyncedAt(cleanBundle.exportedAt);
        setLastCloudflareSyncedAt(cleanBundle.exportedAt);
        setCloudflareSyncError(null);
        cloudflareSyncPendingRef.current = false;
        if (wasOffline) {
          showToast('تغییرات آفلاین به‌صورت خودکار در کلادفلر همگام شد');
        }
      }
    };

    // Trigger check when browser transitions from offline -> online
    if (!wasBrowserOnlineRef.current && isBrowserOnline) {
      checkAndAutoMergeOnRecovery();
    }
    wasBrowserOnlineRef.current = isBrowserOnline;

    const intervalMs = connectionHealth === 'healthy' ? 45000 : 18000;
    const recoveryInterval = setInterval(checkAndAutoMergeOnRecovery, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(recoveryInterval);
    };
  }, [
    probeDone,
    isBrowserOnline,
    connectionHealth,
    user,
    storagePreference,
    savedPin,
    pinVerified,
    reconcileDualClouds,
    recordCloudflareFailure,
    recordCloudflareSuccess,
    recordFirebaseFailure,
    recordFirebaseSuccess,
    showToast,
  ]);

  // Standalone 3-hour automatic check on Android APK & offline PWA when not hosted by Electron/Local server
  useEffect(() => {
    if (!hasDashboardAccess) return;
    if (isElectronDesktop) return; // Electron's embedded local server runs the 3-hour cron even with window closed

    const checkClientSchedule = () => {
      if (productsRef.current.length === 0) return;
      if (!shouldRunClient3HourAutoSync()) return;
      if (isNativeAndroid || storageMode === 'offline') {
        handleRefreshAllRef.current(true);
      }
    };

    const initialTimer = setTimeout(checkClientSchedule, 5000);
    const interval = setInterval(checkClientSchedule, 60000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [hasDashboardAccess, isElectronDesktop, isNativeAndroid, storageMode]);

  // Google Sign-In Handler
  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      setAuthError(null);
      setFirebaseDeniedEmail(null);
      await signInWithPopup(auth, googleProvider);
      setFirebaseReachable(true);
      persistStoragePreference('auto');
      setStoragePreference('auto');
      showToast('ورود به گوگل فایربیس انجام شد؛ همگام‌سازی خودکار فعال است');
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        setAuthError({
          message: `دامنه فعلی (${window.location.hostname}) هنوز در لیست دامنه‌های مجاز Firebase ثبت نشده است.`,
          unauthorizedDomain: window.location.hostname,
        });
      } else if (code === 'auth/network-request-failed') {
        setFirebaseReachable(false);
        setAuthError({
          message:
            'دسترسی به سرور گوگل برقرار نشد (احتمالاً فیلترشکن خاموش است). می‌توانید از بخش کلادفلر با رمز فروشگاه وارد شوید.',
        });
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError({ message: 'پنجره ورود بسته شد. دوباره تلاش کنید یا با رمز کلادفلر وارد شوید.' });
      } else if (code === 'auth/popup-blocked') {
        setAuthError({
          message: 'مرورگر پنجره پاپ‌آپ را مسدود کرده است. لطفاً اجازه باز شدن پنجره ورود را بدهید.',
        });
      } else {
        setAuthError({ message: `خطا در ورود با حساب گوگل: ${err?.message || code || 'نامشخص'}` });
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // Sign Out Handler
  const handleGoogleSignOut = async () => {
    try {
      setFirebaseDeniedEmail(null);
      await signOut(auth);
      showToast('از حساب گوگل خارج شدید');
    } catch (err) {
      console.error('Sign out error', err);
    }
  };

  // Verify & Save Shop PIN for Cloudflare KV
  const handleVerifyAndSavePin = async (
    rawPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await verifyShopPinOnEdge(rawPin);
    if (res.valid) {
      setSavedShopPin(rawPin);
      setSavedPin(rawPin);
      setPinVerified(true);
      setCloudflareSyncError(null);
      cloudflareSyncPendingRef.current = true;
      initialFirebaseReconciledRef.current = false;
      setCloudflareStatus((prev) => ({
        ...prev,
        reachable: true,
        kvConfigured: res.kvConfigured,
      }));
      showToast('رمز فروشگاه تایید و همگام‌سازی با کلادفلر فعال شد');
      return { ok: true };
    }
    return { ok: false, error: res.error || 'رمز فروشگاه نادرست است' };
  };

  const handleChangeShopPin = async (
    currentPin: string,
    newPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await changeShopPinOnEdge(currentPin, newPin);
    if (res.ok) {
      setSavedShopPin(newPin);
      setSavedPin(newPin);
      setPinVerified(true);
      setCloudflareSyncError(null);
      showToast('رمز امنیتی فروشگاه با موفقیت تغییر یافت');
      return { ok: true };
    }
    return { ok: false, error: res.error || 'خطا در تغییر رمز فروشگاه' };
  };

  const handleEntryPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinInput.trim()) return;
    setPinError(null);
    setIsVerifyingPin(true);
    try {
      const result = await handleVerifyAndSavePin(pinInput.trim());
      if (result.ok) {
        setPinInput('');
        persistStoragePreference('cloudflare');
        setStoragePreference('cloudflare');
      } else {
        setPinError(result.error || 'رمز فروشگاه نادرست است');
      }
    } finally {
      setIsVerifyingPin(false);
    }
  };

  const handleBannerPinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerPinInput.trim()) return;
    setBannerPinError(null);
    setIsUnlockingBannerPin(true);
    try {
      const result = await handleVerifyAndSavePin(bannerPinInput.trim());
      if (result.ok) {
        setBannerPinInput('');
      } else {
        setBannerPinError(result.error || 'رمز فروشگاه نادرست است');
      }
    } finally {
      setIsUnlockingBannerPin(false);
    }
  };

  const handleClearPin = () => {
    clearSavedShopPin();
    setSavedPin('');
    setPinVerified(false);
    setLastCloudflareSyncedAt(null);
    setCloudflareSyncError(null);
    showToast('رمز ذخیره‌شده کلادفلر از این دستگاه پاک شد');
  };

  const handleSaveCloudflareOrigin = async (rawUrl: string) => {
    const updated = persistCloudflareOrigin(rawUrl);
    setCloudflareOriginState(updated);
    setGateOriginInput(updated);
    const cfStatus = await probeCloudflareStatus();
    if (cfStatus.reachable) {
      recordCloudflareSuccess(cfStatus);
      if (savedPin) {
        const pinCheck = await verifyShopPinOnEdge(savedPin);
        if (pinCheck.valid) {
          setPinVerified(true);
        } else if (pinCheck.unauthorized) {
          clearSavedShopPin();
          setSavedPin('');
          setPinVerified(false);
        }
      }
      showToast(`آدرس سرور کلادفلر روی ${updated} ذخیره و متصل شد`);
    } else {
      setCloudflareStatus(cfStatus);
      showToast(`آدرس ${updated} ذخیره شد (در حال حاضر به کلادفلر دسترسی برقرار نشد)`);
    }
  };

  const handleSaveCloudflareMirrors = async (urlsText: string) => {
    const updated = persistCloudflareMirrors(urlsText);
    setCloudflareMirrorsState(updated);
    const cfStatus = await probeCloudflareStatus();
    if (cfStatus.reachable) {
      recordCloudflareSuccess(cfStatus);
      showToast(
        updated.length > 0
          ? `${toPersianDigits(updated.length)} آدرس پشتیبان ذخیره و اتصال برقرار شد`
          : 'لیست آدرس‌های پشتیبان پاک شد'
      );
    } else {
      showToast('آدرس‌های پشتیبان ذخیره شد؛ با اولین اتصال استفاده می‌شوند');
    }
  };

  const handleRetryGateConnection = async () => {
    setIsRetryingConnection(true);
    setPinError(null);
    cloudflareFailCountRef.current = 0;
    firebaseFailCountRef.current = 0;
    try {
      const [fbOk, cfStatus] = await Promise.all([
        probeFirebaseReachable(4500),
        probeCloudflareStatus(),
      ]);
      if (fbOk) {
        recordFirebaseSuccess();
      } else {
        setFirebaseReachable(false);
      }
      if (cfStatus.reachable) {
        recordCloudflareSuccess(cfStatus);
      } else {
        setCloudflareStatus(cfStatus);
      }

      if (cfStatus.reachable && savedPin) {
        const pinCheck = await verifyShopPinOnEdge(savedPin);
        if (pinCheck.valid) {
          setPinVerified(true);
        } else if (pinCheck.unauthorized) {
          clearSavedShopPin();
          setSavedPin('');
          setPinVerified(false);
        }
      }

      if (cfStatus.reachable || fbOk) {
        showToast('ارتباط با سرور برقرار شد');
      } else {
        setConnectionHealth('offline');
        showToast('هنوز پاسخی از سرور دریافت نشد؛ اینترنت یا آدرس سرور را بررسی کنید');
      }
    } finally {
      setCfProbeDone(true);
      setFbProbeDone(true);
      setIsRetryingConnection(false);
    }
  };

  const handleChangeStoragePreference = async (pref: StoragePreference) => {
    persistStoragePreference(pref);
    setStoragePreference(pref);
    if (pref === 'firebase') {
      const fbOk = await probeFirebaseReachable(3200);
      setFirebaseReachable(fbOk);
      if (!fbOk) {
        showToast('فایربیس در حال حاضر در دسترس نیست (نیاز به فیلترشکن)');
      } else {
        showToast('اولویت ذخیره‌سازی روی گوگل فایربیس قرار گرفت');
      }
    } else if (pref === 'cloudflare') {
      showToast('حالت ذخیره‌سازی روی کلادفلر (بدون فیلترشکن) قرار گرفت');
    } else {
      if (!firebaseReachable) {
        probeFirebaseReachable(2800).then((ok) => {
          if (ok) recordFirebaseSuccess();
        });
      }
      showToast('حالت خودکار فعال شد (پیش‌فرض فایربیس با سوئیچ خودکار به کلادفلر)');
    }
  };

  const handleManualSyncNow = async () => {
    const [fbOk, cfStatus] = await Promise.all([
      probeFirebaseReachable(3500),
      probeCloudflareStatus(),
    ]);
    setFirebaseReachable(fbOk);
    if (cfStatus.reachable) {
      recordCloudflareSuccess(cfStatus);
    } else {
      setCloudflareStatus(cfStatus);
    }

    let isPinOk = pinVerified;
    if (cfStatus.reachable && savedPin && !isPinOk) {
      const pinCheck = await verifyShopPinOnEdge(savedPin);
      if (pinCheck.valid) {
        setPinVerified(true);
        isPinOk = true;
      } else if (pinCheck.unauthorized) {
        clearSavedShopPin();
        setSavedPin('');
        setPinVerified(false);
        setCloudflareSyncError('رمز فروشگاه کلادفلر منقضی یا نادرست است');
      }
    }

    if (fbOk && user) {
      await reconcileDualClouds(user, productsRef.current, historiesRef.current);
      if (!cfStatus.reachable) {
        showToast('فایربیس همگام شد، اما سرور کلادفلر در دسترس نیست (سایت دوم هنوز بروزرسانی نشد)');
      } else if (!cfStatus.kvConfigured) {
        showToast('فایربیس همگام شد، اما حافظه KV کلادفلر متصل نیست');
      } else if (!savedPin || !isPinOk) {
        showToast('فایربیس همگام شد؛ برای ارسال تغییرات به کلادفلر و سایت دوم رمز فروشگاه را وارد کنید');
      } else if (cloudflareSyncPendingRef.current) {
        showToast('فایربیس همگام شد، اما انتقال به کلادفلر با خطا مواجه شد');
      } else {
        showToast('همگام‌سازی دوطرفه بین فایربیس، کلادفلر و حافظه محلی انجام شد');
      }
      return;
    }

    if (cfStatus.reachable && savedPin && isPinOk && cfStatus.kvConfigured) {
      setIsSyncingCloud(true);
      try {
        const currentBundle: BackupBundle = {
          version: 1,
          exportedAt: new Date().toISOString(),
          source: 'cloudflare-sync',
          products: productsRef.current,
          histories: historiesRef.current,
          deletedIds: deletedIdsRef.current,
        };
        const remote = await fetchCloudflareBundle(savedPin);
        const merged =
          remote.bundle ? mergeBundles(currentBundle, remote.bundle, false) : currentBundle;
        const pushRes = await pushCloudflareBundle(savedPin, merged);
        if (!pushRes.saved) {
          cloudflareSyncPendingRef.current = true;
          setCloudflareSyncError(pushRes.error || 'خطا در ذخیره‌سازی در Cloudflare KV');
          saveOfflineBundle({ ...merged, source: 'offline-dirty' });
          showToast(pushRes.error || 'خطا در ذخیره‌سازی در Cloudflare KV');
          return;
        }
        const syncedIso = new Date().toISOString();
        deletedIdsRef.current = merged.deletedIds || {};
        setProducts(merged.products);
        setHistories(merged.histories);
        setDeletedIds(merged.deletedIds || {});
        saveOfflineBundle({ ...merged, exportedAt: syncedIso, source: 'cloudflare-kv' });
        setLastSyncedAt(syncedIso);
        setLastCloudflareSyncedAt(syncedIso);
        setCloudflareSyncError(null);
        cloudflareSyncPendingRef.current = false;
        showToast('همگام‌سازی ابری با کلادفلر KV با موفقیت انجام شد');
      } finally {
        setIsSyncingCloud(false);
      }
      return;
    }

    cloudflareSyncPendingRef.current = true;
    saveOfflineBundle({
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'offline-dirty',
      products: productsRef.current,
      histories: historiesRef.current,
      deletedIds: deletedIdsRef.current,
    });
    showToast(
      cfStatus.reachable && !cfStatus.kvConfigured
        ? 'حافظه Cloudflare KV در Bindings متصل نیست؛ تغییرات فعلاً فقط در همین مرورگر ذخیره شد'
        : cfStatus.reachable && (!savedPin || !isPinOk)
          ? 'برای ارسال تغییرات به کلادفلر و سایت دوم، لطفاً رمز فروشگاه کلادفلر را وارد کنید'
          : 'تغییرات در حافظه محلی ذخیره شد (برای سینک ابری، به فایربیس یا کلادفلر متصل شوید)'
    );
  };

  // Persist non-Firebase mutations cleanly to state + offline cache + Cloudflare KV
  const commitLocalOrCloudflareBundle = async (
    nextProducts: ProductItem[],
    nextHistories: Record<string, PriceHistoryItem[]>,
    nextDeletedIds: Record<string, string>
  ): Promise<{ cloudSaved: boolean; reason?: 'kv_not_configured' | 'unauthorized' | 'network_error' }> => {
    deletedIdsRef.current = nextDeletedIds;
    setProducts(nextProducts);
    setHistories(nextHistories);
    setDeletedIds(nextDeletedIds);

    const bundle: BackupBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: 'offline-dirty',
      products: nextProducts,
      histories: nextHistories,
      deletedIds: nextDeletedIds,
    };

    if (savedPin && pinVerified && cloudflareStatus.reachable && cloudflareStatus.kvConfigured) {
      setIsPushingCloudflare(true);
      try {
        const pushRes = await pushCloudflareBundle(savedPin, {
          ...bundle,
          source: 'cloudflare-kv',
        });

        if (pushRes.unauthorized) {
          clearSavedShopPin();
          setSavedPin('');
          setPinVerified(false);
          cloudflareSyncPendingRef.current = true;
          setCloudflareSyncError('رمز فروشگاه کلادفلر منقضی یا نادرست است');
          saveOfflineBundle(bundle);
          setLastSyncedAt(bundle.exportedAt);
          return { cloudSaved: false, reason: 'unauthorized' };
        }

        if (!pushRes.kvConfigured) {
          setCloudflareStatus((prev) => ({ ...prev, kvConfigured: false, kvBindingName: null }));
          cloudflareSyncPendingRef.current = true;
          setCloudflareSyncError('حافظه KV در Bindings کلادفلر متصل نیست');
          saveOfflineBundle(bundle);
          setLastSyncedAt(bundle.exportedAt);
          return { cloudSaved: false, reason: 'kv_not_configured' };
        }

        if (!pushRes.saved) {
          cloudflareSyncPendingRef.current = true;
          setCloudflareSyncError(pushRes.error || 'ارسال تغییرات به کلادفلر ناموفق بود');
          saveOfflineBundle(bundle);
          setLastSyncedAt(bundle.exportedAt);
          recordCloudflareFailure();
          return { cloudSaved: false, reason: 'network_error' };
        }

        const syncedBundle: BackupBundle = {
          ...bundle,
          source: 'cloudflare-kv',
        };
        saveOfflineBundle(syncedBundle);
        setLastSyncedAt(syncedBundle.exportedAt);
        setLastCloudflareSyncedAt(syncedBundle.exportedAt);
        setCloudflareSyncError(null);
        cloudflareSyncPendingRef.current = false;
        recordCloudflareSuccess({
          ...cloudflareStatus,
          reachable: true,
          kvConfigured: true,
        });
        return { cloudSaved: true };
      } finally {
        setIsPushingCloudflare(false);
      }
    }

    cloudflareSyncPendingRef.current = true;
    saveOfflineBundle(bundle);
    setLastSyncedAt(bundle.exportedAt);
    return {
      cloudSaved: false,
      reason:
        cloudflareStatus.reachable && !cloudflareStatus.kvConfigured
          ? 'kv_not_configured'
          : 'network_error',
    };
  };

  // Handle Refresh All Prices (manual or 3-hour client fallback)
  const handleRefreshAll = async (isAutoSchedule = false) => {
    if (products.length === 0) return;

    try {
      setIsRefreshing(true);
      let checkedCount = 0;
      let changedCount = 0;

      if (storageMode === 'firebase' && user) {
        for (const prod of products) {
          if (!prod.sourceUrl) continue;
          const live = await fetchLiveDigikalaPrice(prod.sourceUrl);
          if (live && (live.priceToman > 0 || live.stockStatus === 'out_of_stock')) {
            checkedCount++;
            const res = await syncProductPriceInFirestore(user.uid, prod, live);
            if (res.priceChanged) changedCount++;
          }
        }
      } else {
        const nextProducts = [...products];
        const nextHistories = { ...histories };
        const { jalaliDate, jalaliTime } = getJalaliNowParts();

        for (let i = 0; i < nextProducts.length; i++) {
          const prod = nextProducts[i];
          if (!prod.sourceUrl) continue;
          const live = await fetchLiveDigikalaPrice(prod.sourceUrl);
          if (live && (live.priceToman > 0 || live.stockStatus === 'out_of_stock')) {
            checkedCount++;
            const oldPrice = prod.currentPriceToman;
            const newPrice = live.priceToman > 0 ? live.priceToman : oldPrice;
            const priceChanged = newPrice !== oldPrice && newPrice > 0;
            if (priceChanged) changedCount++;

            const margin = prod.marginPercent ?? 8;
            const newQuote = calculateCustomerQuote(newPrice, margin);
            const nowIso = new Date().toISOString();

            nextProducts[i] = {
              ...prod,
              name: live.name || prod.name,
              category: live.category || prod.category,
              imageUrl:
                live.imageUrl && prod.imageUrl.includes('unsplash')
                  ? live.imageUrl
                  : prod.imageUrl || live.imageUrl,
              currentPriceToman: newPrice,
              lastPriceToman: priceChanged ? oldPrice : newPrice,
              customerQuoteToman: newQuote,
              stockStatus: live.stockStatus || 'in_stock',
              lastRefreshedAt: nowIso,
              updatedAt: nowIso,
            };

            if (priceChanged) {
              const changePercent =
                oldPrice > 0 ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1)) : 0;
              const entry: PriceHistoryItem = {
                timestamp: nowIso,
                jalaliDate,
                jalaliTime,
                priceToman: newPrice,
                customerQuoteToman: newQuote,
                source: isAutoSchedule
                  ? 'پایش خودکار ۳ ساعته (مستقیم)'
                  : live.source || 'بروزرسانی زنده دیجی‌کالا',
                changePercent,
              };
              nextHistories[prod.id] = [...(nextHistories[prod.id] || []), entry];
            }
          }
        }

        await commitLocalOrCloudflareBundle(nextProducts, nextHistories, deletedIds);
      }

      markClient3HourSlotDone();

      if (checkedCount === 0 && !isAutoSchedule) {
        showToast('کالایی با لینک دیجی‌کالا برای بروزرسانی یافت نشد');
      } else if (changedCount > 0) {
        showToast(
          `${toPersianDigits(checkedCount)} کالا استعلام شد (${toPersianDigits(changedCount)} تغییر قیمت ثبت گردید)`
        );
      } else if (!isAutoSchedule) {
        showToast(`${toPersianDigits(checkedCount)} کالا استعلام شد؛ قیمت‌ها با دیجی‌کالا مطابق است`);
      }
    } catch (err) {
      console.error('Refresh failed', err);
      if (!isAutoSchedule) {
        showToast('خطا در استعلام گروهی قیمت‌ها');
      }
    } finally {
      setIsRefreshing(false);
    }
  };
  handleRefreshAllRef.current = handleRefreshAll;

  // Handle Refresh Single Product
  const handleRefreshSingle = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;

    try {
      setIsRefreshing(true);
      if (!target.sourceUrl) {
        showToast('این کالا لینک مرجع دیجی‌کالا ندارد');
        return;
      }
      const { data: live, diagnosticError } = await fetchLiveDigikalaProductClient({
        url: target.sourceUrl.trim(),
      });
      if (live && (live.priceToman > 0 || live.stockStatus === 'out_of_stock')) {
        if (storageMode === 'firebase' && user) {
          const res = await syncProductPriceInFirestore(user.uid, target, live);
          showToast(
            res.priceChanged
              ? `قیمت کالا به ${toPersianDigits(res.newPrice.toLocaleString())} تومان بروزرسانی شد`
              : 'قیمت روز بررسی شد؛ قیمت بدون تغییر است'
          );
        } else {
          const oldPrice = target.currentPriceToman;
          const newPrice = live.priceToman > 0 ? live.priceToman : oldPrice;
          const priceChanged = newPrice !== oldPrice && newPrice > 0;
          const margin = target.marginPercent ?? 8;
          const newQuote = calculateCustomerQuote(newPrice, margin);
          const nowIso = new Date().toISOString();
          const { jalaliDate, jalaliTime } = getJalaliNowParts();

          const nextProducts = products.map((p) =>
            p.id === productId
              ? {
                  ...p,
                  name: live.name || p.name,
                  category: live.category || p.category,
                  currentPriceToman: newPrice,
                  lastPriceToman: priceChanged ? oldPrice : newPrice,
                  customerQuoteToman: newQuote,
                  stockStatus: live.stockStatus || 'in_stock',
                  lastRefreshedAt: nowIso,
                  updatedAt: nowIso,
                }
              : p
          );

          const nextHistories = { ...histories };
          if (priceChanged) {
            const changePercent =
              oldPrice > 0 ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(1)) : 0;
            nextHistories[productId] = [
              ...(nextHistories[productId] || []),
              {
                timestamp: nowIso,
                jalaliDate,
                jalaliTime,
                priceToman: newPrice,
                customerQuoteToman: newQuote,
                source: live.source || 'بروزرسانی زنده دیجی‌کالا',
                changePercent,
              },
            ];
          }

          await commitLocalOrCloudflareBundle(nextProducts, nextHistories, deletedIds);
          showToast(
            priceChanged
              ? `قیمت کالا به ${toPersianDigits(newPrice.toLocaleString())} تومان بروزرسانی شد`
              : 'قیمت روز بررسی شد؛ قیمت بدون تغییر است'
          );
        }
      } else {
        showToast(diagnosticError || 'امکان دریافت قیمت جدید از دیجی‌کالا فراهم نشد');
      }
    } catch (err) {
      console.error('Single refresh failed', err);
      showToast('خطا در استعلام قیمت کالا');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Update Profit Margin %
  const handleUpdateMargin = async (productId: string, newMargin: number) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;

    try {
      if (storageMode === 'firebase' && user) {
        await updateProductMarginInFirestore(user.uid, target, newMargin);
      } else {
        const newQuote = calculateCustomerQuote(target.currentPriceToman, newMargin);
        const nowIso = new Date().toISOString();
        const nextProducts = products.map((p) =>
          p.id === productId
            ? {
                ...p,
                marginPercent: newMargin,
                customerQuoteToman: newQuote,
                updatedAt: nowIso,
              }
            : p
        );
        await commitLocalOrCloudflareBundle(nextProducts, histories, deletedIds);
      }
      showToast(`درصد سود کالا روی ${toPersianDigits(newMargin)}٪ تنظیم و ذخیره شد`);
    } catch (err) {
      console.error('Failed to update margin', err);
      showToast('خطا در ذخیره درصد سود جدید');
    }
  };

  // Update Product Barcodes
  const handleUpdateBarcodes = async (productId: string, nextBarcodes: string[]) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;
    const normalized = normalizeBarcodeList(nextBarcodes);

    try {
      if (storageMode === 'firebase' && user) {
        await updateProductBarcodesInFirestore(user.uid, target, normalized);
      } else {
        const nowIso = new Date().toISOString();
        const nextProducts = products.map((p) =>
          p.id === productId
            ? {
                ...p,
                barcodes: normalized,
                updatedAt: nowIso,
              }
            : p
        );
        await commitLocalOrCloudflareBundle(nextProducts, histories, deletedIds);
      }
      showToast('بارکدهای کالا با موفقیت بروزرسانی و ذخیره شد');
    } catch (err) {
      console.error('Failed to update barcodes', err);
      showToast('خطا در ذخیره‌سازی بارکدهای کالا');
      throw err;
    }
  };

  // Delete product
  const handleDeleteProduct = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    closeAfterProductDelete(target.id);

    try {
      const nextDeletedIds = {
        ...deletedIds,
        [target.id]: new Date().toISOString(),
      };
      deletedIdsRef.current = nextDeletedIds;
      setDeletedIds(nextDeletedIds);

      if (storageMode === 'firebase' && user) {
        await deleteProductFromFirestore(target.id);
      } else {
        const nextProducts = products.filter((p) => p.id !== target.id);
        const nextHistories = { ...histories };
        delete nextHistories[target.id];
        await commitLocalOrCloudflareBundle(nextProducts, nextHistories, nextDeletedIds);
      }

      showToast(`کالای «${target.name}» با موفقیت حذف شد`);
    } catch (err) {
      console.error('Failed to delete product', err);
      showToast('خطا در حذف کالا');
    }
  };

  // Add Product
  const handleProductAdded = async (newProduct: ProductItem) => {
    const normalized = normalizeProductItem(newProduct);
    if (storageMode === 'firebase' && user) {
      await addProductToFirestore(user.uid, normalized);
      showToast(
        `کالای جدید با سود ${toPersianDigits(normalized.marginPercent ?? 8)}٪ در فایربیس ثبت شد`
      );
      return;
    }

    const { jalaliDate, jalaliTime } = getJalaliNowParts();
    const nextProducts = [normalized, ...products];
    const nextHistories = {
      ...histories,
      [normalized.id]: [
        {
          timestamp: normalized.createdAt,
          jalaliDate,
          jalaliTime,
          priceToman: normalized.currentPriceToman,
          customerQuoteToman: normalized.customerQuoteToman,
          source:
            storageMode === 'cloudflare'
              ? 'ثبت اولیه در کلادفلر KV'
              : 'ثبت اولیه در حافظه محلی',
          changePercent: 0,
        },
      ],
    };
    const syncRes = await commitLocalOrCloudflareBundle(nextProducts, nextHistories, deletedIds);
    if (syncRes.cloudSaved) {
      showToast(
        `کالای جدید با سود ${toPersianDigits(normalized.marginPercent ?? 8)}٪ در کلادفلر KV ثبت و همگام شد`
      );
    } else if (syncRes.reason === 'kv_not_configured') {
      showToast(
        'کالا فقط در همین مرورگر ذخیره شد؛ برای نمایش در صفحه ناشناس، KV را در Bindings کلادفلر متصل و Retry deploy کنید'
      );
    } else if (syncRes.reason === 'unauthorized') {
      showToast('رمز کلادفلر منقضی شده؛ کالا موقتاً در حافظه محلی ذخیره شد');
    } else {
      showToast(
        `کالای جدید با سود ${toPersianDigits(normalized.marginPercent ?? 8)}٪ در حافظه محلی ذخیره شد`
      );
    }
  };

  // Bulk Add Products from Bulk TXT Inquiry
  const handleBulkProductsAdded = async (newProducts: ProductItem[]) => {
    if (newProducts.length === 0) return;
    const normalizedList = newProducts.map((p) => normalizeProductItem(p));

    if (storageMode === 'firebase' && user) {
      await addBulkProductsToFirestore(user.uid, normalizedList);
      return;
    }

    const { jalaliDate, jalaliTime } = getJalaliNowParts();
    const nextProducts = [...normalizedList, ...productsRef.current];
    const nextHistories = { ...historiesRef.current };

    for (const item of normalizedList) {
      nextHistories[item.id] = [
        {
          timestamp: item.createdAt,
          jalaliDate,
          jalaliTime,
          priceToman: item.currentPriceToman,
          customerQuoteToman: item.customerQuoteToman,
          source:
            storageMode === 'cloudflare'
              ? 'ثبت گروهی در کلادفلر KV'
              : 'ثبت گروهی در حافظه محلی',
          changePercent: 0,
        },
      ];
    }

    await commitLocalOrCloudflareBundle(nextProducts, nextHistories, deletedIdsRef.current);
  };

  // Export JSON Backup manually from Right Drawer
  const handleExportJson = () => {
    downloadBackupJson({
      version: 1,
      exportedAt: new Date().toISOString(),
      source: storageMode,
      products,
      histories,
      deletedIds,
    });
    showToast(`فایل بکاپ JSON شامل ${toPersianDigits(products.length)} کالا دانلود شد`);
  };

  // Import JSON Backup manually from Right Drawer (Merge or Replace)
  const handleImportJson = async (incomingBundle: BackupBundle, mode: 'merge' | 'replace') => {
    const currentBundle: BackupBundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      source: storageMode,
      products,
      histories,
      deletedIds,
    };

    const resultBundle =
      mode === 'replace'
        ? {
            ...incomingBundle,
            exportedAt: new Date().toISOString(),
            deletedIds: {},
          }
        : mergeBundles(currentBundle, incomingBundle, true);

    setProducts(resultBundle.products);
    setHistories(resultBundle.histories);
    setDeletedIds(resultBundle.deletedIds || {});

    if (storageMode === 'firebase' && user) {
      await applyBundleToFirestore(user.uid, resultBundle, mode);
    }

    await mirrorBundleToSecondary(
      resultBundle.products,
      resultBundle.histories,
      resultBundle.deletedIds || {},
      storageMode === 'offline' ? 'offline-dirty' : 'json-import'
    );

    showToast(
      mode === 'replace'
        ? `لیست با موفقیت جایگزین شد (${toPersianDigits(resultBundle.products.length)} کالا)`
        : `بکاپ با موفقیت ادغام شد (مجموع ${toPersianDigits(resultBundle.products.length)} کالا)`
    );
  };

  // Categories list
  const categories = [
    { id: 'all', label: 'همه محصولات' },
    { id: 'لپ‌تاپ و اولترابوک', label: 'لپ‌تاپ و اولترابوک' },
    { id: 'لوازم جانبی و گیمینگ', label: 'لوازم جانبی و ماوس' },
    { id: 'قطعات و ارتقا سیستم', label: 'قطعات و SSD' },
    { id: 'مانیتور و نمایشگر', label: 'مانیتور' },
  ];

  // Combined Filtered & Sorted Products
  const filteredProducts = useMemo(
    () =>
      filterAndSortProducts(products, {
        searchTerm,
        selectedCategory,
        fromDate,
        toDate,
        sortBy,
      }),
    [products, searchTerm, selectedCategory, fromDate, toDate, sortBy]
  );

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedCategory !== 'all' || fromDate || toDate
  );

  const handleClearAllFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setFromDate(null);
    setToDate(null);
  };

  const getGridContainerClass = (currentLayout: ViewLayout) => {
    switch (currentLayout) {
      case 'grid-4':
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4';
      case 'grid-3':
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5';
      case 'list':
        return 'flex flex-col gap-3';
      case 'compact':
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3';
      case 'large':
        return 'grid grid-cols-1 md:grid-cols-2 gap-6';
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4';
    }
  };

  // Wait briefly for auth + fast Cloudflare/Relay connectivity probe
  if (!authReady || !cfProbeDone) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col items-center justify-center gap-3 font-sans">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Cloud className="w-6 h-6 text-indigo-400 animate-pulse" />
        </div>
        <span className="text-sm font-medium">در حال بررسی و برقراری اتصال با سرور...</span>
      </div>
    );
  }

  // Dual Access Gate (Google Firebase OR Cloudflare Shop PIN OR Offline JSON mode)
  if (!hasDashboardAccess) {
    const isFailoverToCloudflare = !firebaseReachable && cloudflareStatus.reachable;
    const isBothUnreachable = probeDone && !firebaseReachable && !cloudflareStatus.reachable;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-slate-800 p-7 sm:p-9 shadow-2xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 mx-auto">
              <Laptop className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-white">
              سیستم استعلام و پایش قیمت فروشگاه
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              زیرساخت دوگانه فعال است: در حالت عادی با حساب گوگل (فایربیس) و در صورت نبود فیلترشکن با رمز فروشگاه روی کلادفلر متصل شوید.
            </p>
          </div>

          {isFailoverToCloudflare && (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/50 text-xs text-amber-200 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                ارتباط با گوگل فایربیس برقرار نشد (احتمالاً فیلترشکن خاموش است)؛ سیستم به‌صورت خودکار به <strong>کلادفلر</strong> سوئیچ شد. رمز فروشگاه را یک‌بار وارد کنید.
              </span>
            </div>
          )}

          {isBothUnreachable && (
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-200 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <p className="font-semibold">
                    ارتباط اولیه با سرور کلادفلر برقرار نشد.
                  </p>
                  <p className="text-[11px] text-rose-200/80 leading-relaxed">
                    مطمئن شوید اینترنت گوشی روشن است، یا آدرس سرور را بررسی و دوباره تلاش کنید، یا رمز فروشگاه را وارد نمایید.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRetryGateConnection}
                  disabled={isRetryingConnection}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-bold inline-flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetryingConnection ? 'animate-spin' : ''}`} />
                  <span>{isRetryingConnection ? 'در حال بررسی...' : 'تلاش مجدد اتصال'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowGateServerEditor((v) => !v)}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium inline-flex items-center gap-1.5 transition"
                >
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <span>تنظیم آدرس سرور</span>
                </button>
              </div>
            </div>
          )}

          {showGateServerEditor && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <label className="block text-[11px] font-semibold text-slate-300">
                آدرس سایت کلادفلر پیجز
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  dir="ltr"
                  value={gateOriginInput}
                  onChange={(e) => setGateOriginInput(e.target.value)}
                  placeholder="https://estelam-005.pages.dev"
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    setIsRetryingConnection(true);
                    try {
                      await handleSaveCloudflareOrigin(gateOriginInput);
                      setShowGateServerEditor(false);
                    } finally {
                      setIsRetryingConnection(false);
                    }
                  }}
                  disabled={isRetryingConnection || !gateOriginInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  ذخیره و اتصال
                </button>
              </div>
            </div>
          )}

          {/* Option 1: Google Sign-In (Default Firebase) */}
          {firebaseReachable && storagePreference !== 'cloudflare' && (
            <div className="space-y-3">
              {firebaseDeniedEmail && (
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-right text-xs text-rose-200 space-y-2">
                  <p className="font-semibold">
                    ایمیل <span dir="ltr" className="font-mono text-white">{firebaseDeniedEmail}</span>{' '}
                    هنوز در لیست ایمیل‌های مجاز فایربیس (`firestore.rules`) ثبت نشده است.
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    یا با ایمیل مجاز قبلی وارد شوید، یا این ایمیل را به لیست مجاز در قوانین فایربیس اضافه کنید، یا از بخش کلادفلر با رمز فروشگاه وارد شوید.
                  </p>
                </div>
              )}

              {authError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-800/60 text-right text-xs text-rose-200 space-y-2">
                  <p className="font-semibold">{authError.message}</p>
                  {authError.unauthorizedDomain && (
                    <div className="text-[11px] text-slate-300 space-y-1.5 pt-1 border-t border-rose-800/40">
                      <p>
                        در بخش <strong>Authorized domains</strong> دامنه{' '}
                        <code className="px-1.5 py-0.5 rounded bg-slate-950 text-indigo-300 font-mono">
                          {authError.unauthorizedDomain}
                        </code>{' '}
                        را اضافه کنید:
                      </p>
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 underline font-medium"
                      >
                        <span>باز کردن تنظیمات دامنه‌های مجاز Firebase</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-indigo-950/40 transition active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {isSigningIn
                    ? 'در حال اتصال به گوگل...'
                    : firebaseDeniedEmail
                      ? 'ورود با ایمیل دیگر گوگل'
                      : 'ورود با حساب گوگل (حالت پیش‌فرض فایربیس)'}
                </span>
              </button>
            </div>
          )}

          {/* Option 2: Cloudflare Shop PIN (Always accessible unless strictly Firebase-only) */}
          {storagePreference !== 'firebase' && (
            <form
              onSubmit={handleEntryPinSubmit}
              className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>ورود بدون فیلترشکن با کلادفلر</span>
                </span>
                <span className="text-[10px] text-slate-400">ذخیره دائمی روی این دستگاه</span>
              </div>

              {(isNativeAndroid || isElectronDesktop) && (
                <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/70 rounded-xl px-2.5 py-1.5 border border-slate-800/80">
                  <span>سرور:</span>
                  <span dir="ltr" className="font-mono text-slate-300 truncate max-w-[230px]">
                    {cloudflareOrigin}
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute top-3 right-3" />
                  <input
                    type="password"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="رمز فروشگاه را وارد کنید"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 pr-9 pl-3 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isVerifyingPin || !pinInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                >
                  {isVerifyingPin ? 'بررسی...' : 'ورود با کلادفلر'}
                </button>
              </div>
              {cloudflareStatus.reachable && !cloudflareStatus.kvConfigured && (
                <p className="text-[11px] text-amber-300 leading-relaxed bg-amber-950/40 border border-amber-800/50 rounded-xl px-3 py-2">
                  توجه: حافظه KV هنوز در بخش Bindings پروژه کلادفلر (Production / Preview) متصل و ری‌دیپلوی نشده است؛ تا پیش از اتصال KV، کالاها فقط در مرورگر فعلی ذخیره می‌شوند.
                </p>
              )}
              {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
            </form>
          )}

          {/* Option 3: Offline Local / JSON Backup entry */}
          <div className="pt-2 border-t border-slate-800/80 text-center">
            <button
              type="button"
              onClick={() => setOfflineEntered(true)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>ورود آفلاین با حافظه دستگاه و بازیابی فایل بکاپ JSON</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Header */}
      <ShopHeader
        schedulerInfo={schedulerInfo}
        onRefreshAll={() => handleRefreshAll(false)}
        isRefreshing={isRefreshing}
        onOpenAddModal={openAddModal}
        onOpenBulkInquiry={openBulkInquiry}
        isBulkInquiryOpen={isBulkInquiryOpen}
        onOpenBarcodeScanner={openBarcodeScanner}
        onOpenSchedulerModal={openSchedulerModal}
        onOpenDrawer={openDrawer}
        productsCount={products.length}
        storageMode={storageMode}
        connectionHealth={connectionHealth}
        userEmail={user?.email}
        isSyncingCloud={isSyncingCloud}
        cloudflareSyncState={cloudflareSyncState}
      />

      {/* Net-Melli / Offline Status Banner (hidden during startup probes, healthy state & transient degraded retries) */}
      <OfflineIndicator
        isBrowserOnline={isBrowserOnline}
        storageMode={storageMode}
        connectionHealth={connectionHealth}
        isInitialChecking={!cfProbeDone || (!fbProbeDone && storageMode === 'offline')}
        isNativeAndroid={isNativeAndroid}
        isElectronDesktop={isElectronDesktop}
        cloudflareKvMissing={cloudflareStatus.reachable && !cloudflareStatus.kvConfigured}
        onRetryConnection={handleRetryGateConnection}
        isRetrying={isRetryingConnection}
      />

      {/* Cloudflare / Storefront Sync Warning Banner */}
      {isBrowserOnline &&
        storageMode !== 'offline' &&
        cfProbeDone &&
        (cloudflareSyncState === 'pin_required' ||
          cloudflareSyncState === 'kv_missing' ||
          cloudflareSyncState === 'unreachable' ||
          cloudflareSyncState === 'error') && (
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-3">
            {cloudflareSyncState === 'pin_required' ? (
              <div className="rounded-2xl bg-amber-950/50 border border-amber-700/60 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-start gap-2.5 text-xs text-amber-100 leading-relaxed">
                  <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-200">
                      تغییرات هنوز به کلادفلر (و سایت فروشگاهی دوم) منتقل نمی‌شوند:
                    </span>{' '}
                    شما فقط با حساب گوگل وارد شده‌اید و رمز کلادفلر روی این مرورگر ثبت نشده است. برای همگام‌سازی خودکار قیمت‌ها و کالاها با کلادفلر، رمز فروشگاه را وارد کنید.
                    {bannerPinError && (
                      <p className="text-[11px] text-rose-300 font-semibold mt-1">
                        {bannerPinError}
                      </p>
                    )}
                  </div>
                </div>
                <form
                  onSubmit={handleBannerPinUnlock}
                  className="flex items-center gap-2 shrink-0"
                >
                  <input
                    type="password"
                    value={bannerPinInput}
                    onChange={(e) => setBannerPinInput(e.target.value)}
                    placeholder="رمز کلادفلر..."
                    className="w-36 sm:w-44 rounded-xl border border-amber-700/70 bg-slate-950/90 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isUnlockingBannerPin || !bannerPinInput.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold transition whitespace-nowrap"
                  >
                    {isUnlockingBannerPin ? 'بررسی...' : 'فعال‌سازی کلادفلر'}
                  </button>
                </form>
              </div>
            ) : cloudflareSyncState === 'kv_missing' ? (
              <div className="rounded-2xl bg-amber-950/50 border border-amber-700/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-100">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    حافظه <strong>Cloudflare KV</strong> متصل نیست؛ تغییرات در فایربیس ثبت می‌شوند اما به کلادفلر و سایت دوم منتقل نمی‌شوند.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="px-3 py-1.5 rounded-xl bg-amber-700/60 hover:bg-amber-600/80 text-white text-[11px] font-bold transition shrink-0"
                >
                  مشاهده راهنمای KV
                </button>
              </div>
            ) : (
              <div className="rounded-2xl bg-rose-950/45 border border-rose-700/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-100">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    انتقال تغییرات به کلادفلر (سایت دوم) با خطا مواجه شد
                    {cloudflareSyncError ? `: ${cloudflareSyncError}` : '.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleManualSyncNow}
                  disabled={isSyncingCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-bold transition shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  <span>تلاش مجدد همگام‌سازی</span>
                </button>
              </div>
            )}
          </div>
        )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isBulkInquiryOpen ? (
          /* Dedicated Bulk .txt Price Inquiry Page */
          <BulkPriceInquiryView
            existingProducts={products}
            onProductAdded={handleProductAdded}
            onBulkProductsAdded={handleBulkProductsAdded}
            onBack={closeBulkInquiry}
            onShowToast={showToast}
          />
        ) : selectedProduct ? (
          /* Dedicated Product Detailed Page */
          <ProductDetailModal
            userId={user?.uid}
            storageMode={storageMode}
            fallbackHistory={histories[selectedProduct.id] || []}
            product={selectedProduct}
            allProducts={products}
            onBack={closeProductDetail}
            onUpdateMargin={handleUpdateMargin}
            onUpdateBarcodes={handleUpdateBarcodes}
            onRefreshSingle={handleRefreshSingle}
            isRefreshingSingle={isRefreshing}
          />
        ) : (
          /* Dashboard & Product Grid View */
          <div className="space-y-5">
            {/* Search, Category, Sort & Jalali Date Range Bar */}
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-md space-y-3">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute top-3.5 right-3.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="جستجو در میان کالاها، لپ‌تاپ‌ها، قطعات، ماوس و مانیتور..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 pr-10 pl-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Category Filter Buttons & Collapsible Sort/Date Toggle */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none flex-1 md:flex-initial">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCategory(c.id)}
                        className={`whitespace-nowrap px-3 py-2 rounded-xl text-xs font-semibold transition ${
                          selectedCategory === c.id
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsFilterPanelOpen((prev) => !prev)}
                    aria-expanded={isFilterPanelOpen}
                    className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      isFilterPanelOpen
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : fromDate || toDate || sortBy !== 'newest'
                          ? 'bg-indigo-950/50 text-indigo-300 border-indigo-500/60 hover:bg-indigo-950/80'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span>مرتب‌سازی و تاریخ</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                        isFilterPanelOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Collapsible Sorting & Jalali Date Range Row */}
              {isFilterPanelOpen && (
                <div className="pt-3 border-t border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <ProductSortMenu value={sortBy} onChange={handleSortChange} />

                  <JalaliDateRangeFilter
                    fromDate={fromDate}
                    toDate={toDate}
                    onChangeFromDate={setFromDate}
                    onChangeToDate={setToDate}
                    onClear={() => {
                      setFromDate(null);
                      setToDate(null);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Product Cards Container */}
            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">
                در حال همگام‌سازی لیست کالاها...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center rounded-3xl bg-slate-900 border border-slate-800 p-8 space-y-3">
                <Package className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">کالایی یافت نشد</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {products.length > 0 && hasActiveFilters
                    ? 'هیچ کالایی با فیلترهای جستجو، دسته‌بندی یا بازه تاریخ انتخاب‌شده مطابقت ندارد.'
                    : 'با استفاده از دکمه «افزودن کالا» کالای جدید ثبت کنید یا از منوی همبرگری بالا فایل بکاپ JSON را بازیابی نمایید.'}
                </p>
                {products.length > 0 && hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>پاک کردن همه فیلترها</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>معرفی کالای اول</span>
                  </button>
                )}
              </div>
            ) : (
              <div className={getGridContainerClass(layout)}>
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    layout={layout}
                    onSelect={(p) => openProductDetail(p.id)}
                    onDelete={(id, name) => openDeleteConfirm(id, name)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/60 bg-slate-950 py-4 text-center text-xs text-slate-500">
        سیستم هوشمند پایش قیمت دیجی‌کالا · پشتیبانی هم‌زمان از گوگل فایربیس، کلادفلر KV و بکاپ JSON آفلاین
      </footer>

      {/* RIGHT-SIDE HAMBURGER DRAWER MENU */}
      <RightDrawerMenu
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        storageMode={storageMode}
        storagePreference={storagePreference}
        connectionHealth={connectionHealth}
        onChangeStoragePreference={handleChangeStoragePreference}
        cloudflareStatus={cloudflareStatus}
        firebaseReachable={firebaseReachable}
        hasSavedPin={Boolean(savedPin && pinVerified)}
        onVerifyAndSavePin={handleVerifyAndSavePin}
        onChangeShopPin={handleChangeShopPin}
        onClearPin={handleClearPin}
        userEmail={user?.email}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onManualSyncNow={handleManualSyncNow}
        isSyncing={isSyncingCloud}
        lastSyncedAt={lastSyncedAt}
        products={products}
        histories={histories}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        cloudflareOrigin={cloudflareOrigin}
        onSaveCloudflareOrigin={handleSaveCloudflareOrigin}
        cloudflareMirrors={cloudflareMirrors}
        onSaveCloudflareMirrors={handleSaveCloudflareMirrors}
        layout={layout}
        onChangeLayout={handleLayoutChange}
        filteredProductsCount={filteredProducts.length}
        cloudflareSyncState={cloudflareSyncState}
        lastCloudflareSyncedAt={lastCloudflareSyncedAt}
        cloudflareSyncError={cloudflareSyncError}
      />

      {/* MODALS */}
      {isAddModalOpen && (
        <AddProductModal
          onClose={closeAddModal}
          onProductAdded={handleProductAdded}
          existingProducts={products}
        />
      )}

      {isBarcodeScannerOpen && (
        <BarcodeScannerModal
          products={products}
          onClose={closeBarcodeScanner}
        />
      )}

      {isSchedulerModalOpen && (
        <SchedulerModal
          schedulerInfo={schedulerInfo}
          onRefreshAll={() => handleRefreshAll(false)}
          isRefreshing={isRefreshing}
          onClose={closeSchedulerModal}
        />
      )}

      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeDeleteConfirm}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-rose-900/60 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-950 text-rose-400 flex items-center justify-center border border-rose-800/60">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-white text-base">
              حذف دائمی کالا و تاریخچه نوسانات قیمتی؟
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              آیا از حذف کامل کالای «<strong>{deleteTarget.name}</strong>» اطمینان دارید؟
              <br />
              این کالا و تمامی سوابق قیمتی آن از فضای ذخیره‌سازی شما پاک خواهد شد.
            </p>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleDeleteProduct}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-950/40 transition active:scale-95"
              >
                بله، برای همیشه حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 border border-indigo-500 text-white text-xs font-semibold shadow-2xl animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
