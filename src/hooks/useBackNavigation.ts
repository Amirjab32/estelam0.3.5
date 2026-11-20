import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

export type NavLayer =
  | { kind: 'detail'; productId: string }
  | { kind: 'bulk-inquiry' }
  | { kind: 'drawer' }
  | { kind: 'add-product' }
  | { kind: 'barcode-scanner' }
  | { kind: 'scheduler' }
  | { kind: 'delete-confirm'; id: string; name: string };

interface HistoryNavState {
  __estelamNav: true;
  depth: number;
  stack: NavLayer[];
  sentinel?: boolean;
}

interface UseBackNavigationOptions {
  onShowExitConfirmToast: (message: string) => void;
  onRootBackFallback?: () => boolean;
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = Boolean(
    (window.navigator as unknown as { standalone?: boolean }).standalone
  );
  return displayStandalone || iosStandalone;
}

function getBaseDepth(): number {
  return !Capacitor.isNativePlatform() && isStandalonePwa() ? 1 : 0;
}

export function useBackNavigation({
  onShowExitConfirmToast,
  onRootBackFallback,
}: UseBackNavigationOptions) {
  const [navStack, setNavStack] = useState<NavLayer[]>([]);
  const navStackRef = useRef<NavLayer[]>([]);
  const savedListScrollYRef = useRef<number>(0);
  const prevWasSubViewRef = useRef<boolean>(false);
  const pendingHistoryPopRef = useRef<boolean>(false);
  const lastBackExitTapRef = useRef<number>(0);

  const toastRef = useRef(onShowExitConfirmToast);
  const rootFallbackRef = useRef(onRootBackFallback);

  useEffect(() => {
    toastRef.current = onShowExitConfirmToast;
  }, [onShowExitConfirmToast]);

  useEffect(() => {
    rootFallbackRef.current = onRootBackFallback;
  }, [onRootBackFallback]);

  useEffect(() => {
    navStackRef.current = navStack;
  }, [navStack]);

  // Derived view states (single source of truth)
  const mainSubLayer = [...navStack]
    .reverse()
    .find(
      (entry): entry is Extract<NavLayer, { kind: 'detail' | 'bulk-inquiry' }> =>
        entry.kind === 'detail' || entry.kind === 'bulk-inquiry'
    );
  const selectedProductId = mainSubLayer?.kind === 'detail' ? mainSubLayer.productId : null;
  const isBulkInquiryOpen = mainSubLayer?.kind === 'bulk-inquiry';
  const isDrawerOpen = navStack.some((e) => e.kind === 'drawer');
  const isAddModalOpen = navStack.some((e) => e.kind === 'add-product');
  const isBarcodeScannerOpen = navStack.some((e) => e.kind === 'barcode-scanner');
  const isSchedulerModalOpen = navStack.some((e) => e.kind === 'scheduler');
  const deleteLayer = [...navStack]
    .reverse()
    .find(
      (entry): entry is Extract<NavLayer, { kind: 'delete-confirm' }> =>
        entry.kind === 'delete-confirm'
    );
  const deleteTarget = deleteLayer ? { id: deleteLayer.id, name: deleteLayer.name } : null;

  // Scroll to top when entering detail or bulk-inquiry; restore exact list scrollY when returning to list
  const isInSubView = selectedProductId !== null || isBulkInquiryOpen;
  useLayoutEffect(() => {
    const prevSubView = prevWasSubViewRef.current;
    if (!prevSubView && isInSubView) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else if (prevSubView && !isInSubView) {
      const targetY = savedListScrollYRef.current;
      window.scrollTo({ top: targetY, behavior: 'auto' });
      const raf1 = window.requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: targetY, behavior: 'auto' });
        });
      });
      prevWasSubViewRef.current = isInSubView;
      return () => window.cancelAnimationFrame(raf1);
    }
    prevWasSubViewRef.current = isInSubView;
  }, [isInSubView]);

  // Initialize root browser history state & standalone PWA double-back guard
  useEffect(() => {
    const baseState: HistoryNavState = {
      __estelamNav: true,
      depth: 0,
      stack: [],
    };
    window.history.replaceState(baseState, '');

    if (getBaseDepth() === 1) {
      const sentinelState: HistoryNavState = {
        __estelamNav: true,
        depth: 1,
        stack: [],
        sentinel: true,
      };
      window.history.pushState(sentinelState, '');
    }

    const onPopState = (event: PopStateEvent) => {
      pendingHistoryPopRef.current = false;
      const incoming = event.state as HistoryNavState | null;
      const prevStack = navStackRef.current;

      if (incoming && incoming.__estelamNav) {
        // Standalone PWA hit root (depth 0 after popping sentinel)
        if (!Capacitor.isNativePlatform() && isStandalonePwa() && incoming.depth === 0) {
          if (prevStack.length > 0) {
            navStackRef.current = [];
            setNavStack([]);
            window.history.pushState(
              { __estelamNav: true, depth: 1, stack: [], sentinel: true } satisfies HistoryNavState,
              ''
            );
            return;
          }

          if (rootFallbackRef.current?.()) {
            window.history.pushState(
              { __estelamNav: true, depth: 1, stack: [], sentinel: true } satisfies HistoryNavState,
              ''
            );
            return;
          }

          const now = Date.now();
          if (now - lastBackExitTapRef.current < 2200) {
            // Second tap inside 2.2s: exit standalone PWA naturally
            window.history.back();
            return;
          }

          lastBackExitTapRef.current = now;
          toastRef.current('برای خروج از برنامه، دکمه بازگشت را دوباره بزنید');
          window.history.pushState(
            { __estelamNav: true, depth: 1, stack: [], sentinel: true } satisfies HistoryNavState,
            ''
          );
          return;
        }

        const nextStack = Array.isArray(incoming.stack) ? incoming.stack : [];
        navStackRef.current = nextStack;
        setNavStack(nextStack);
        return;
      }

      // Unrecognized browser state fallback: cleanly return to root UI
      navStackRef.current = [];
      setNavStack([]);
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // Native Android Capacitor hardware/gesture back button listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;

    CapacitorApp.addListener('backButton', () => {
      if (removed) return;
      const currentStack = navStackRef.current;

      if (currentStack.length > 0) {
        if (!pendingHistoryPopRef.current) {
          pendingHistoryPopRef.current = true;
          window.history.back();
          // Defensive release in case WebView has no native history entry synced
          window.setTimeout(() => {
            if (pendingHistoryPopRef.current) {
              pendingHistoryPopRef.current = false;
              const trimmed = navStackRef.current.slice(0, -1);
              navStackRef.current = trimmed;
              setNavStack(trimmed);
            }
          }, 120);
        }
        return;
      }

      // Optional root gate fallback (e.g. closing inline server URL editor)
      if (rootFallbackRef.current?.()) {
        return;
      }

      const now = Date.now();
      if (now - lastBackExitTapRef.current < 2200) {
        CapacitorApp.exitApp().catch(() => {});
        return;
      }

      lastBackExitTapRef.current = now;
      toastRef.current('برای خروج از برنامه، دکمه بازگشت را دوباره بزنید');
    })
      .then((listener) => {
        if (removed) {
          listener.remove().catch(() => {});
        } else {
          handle = listener;
        }
      })
      .catch(() => {});

    return () => {
      removed = true;
      if (handle) {
        handle.remove().catch(() => {});
      }
    };
  }, []);

  const pushLayer = useCallback((entry: NavLayer) => {
    const current = navStackRef.current;

    // Avoid duplicating the same open modal/drawer or detail/bulk-inquiry view
    const wasInSubView = current.some(
      (e) => e.kind === 'detail' || e.kind === 'bulk-inquiry'
    );
    if (entry.kind === 'detail' || entry.kind === 'bulk-inquiry') {
      if (!wasInSubView) {
        savedListScrollYRef.current =
          window.scrollY || document.documentElement.scrollTop || 0;
      }
      if (entry.kind === 'detail') {
        const alreadyDetail = current.find((e) => e.kind === 'detail');
        if (
          alreadyDetail &&
          alreadyDetail.kind === 'detail' &&
          alreadyDetail.productId === entry.productId
        ) {
          return;
        }
      } else {
        const topSub = [...current]
          .reverse()
          .find((e) => e.kind === 'detail' || e.kind === 'bulk-inquiry');
        if (topSub?.kind === 'bulk-inquiry') {
          return;
        }
      }
    } else if (current.some((e) => e.kind === entry.kind)) {
      return;
    }

    const nextStack =
      entry.kind === 'detail'
        ? [...current.filter((e) => e.kind !== 'detail'), entry]
        : entry.kind === 'bulk-inquiry'
          ? [...current.filter((e) => e.kind !== 'bulk-inquiry'), entry]
          : [...current, entry];

    navStackRef.current = nextStack;
    setNavStack(nextStack);

    const nextState: HistoryNavState = {
      __estelamNav: true,
      depth: getBaseDepth() + nextStack.length,
      stack: nextStack,
    };
    window.history.pushState(nextState, '');
  }, []);

  const closeLayer = useCallback((kind: NavLayer['kind']) => {
    const current = navStackRef.current;
    const idx = current.map((e) => e.kind).lastIndexOf(kind);
    if (idx === -1) return;

    if (idx === current.length - 1) {
      if (pendingHistoryPopRef.current) return;
      pendingHistoryPopRef.current = true;
      window.history.back();
      window.setTimeout(() => {
        if (pendingHistoryPopRef.current) {
          pendingHistoryPopRef.current = false;
          const trimmed = navStackRef.current.slice(0, -1);
          navStackRef.current = trimmed;
          setNavStack(trimmed);
        }
      }, 120);
      return;
    }

    // Interior layer closed programmatically: strip cleanly and keep history consistent
    const nextStack = current.filter((_, i) => i !== idx);
    navStackRef.current = nextStack;
    setNavStack(nextStack);
    window.history.replaceState(
      {
        __estelamNav: true,
        depth: getBaseDepth() + nextStack.length,
        stack: nextStack,
      } satisfies HistoryNavState,
      ''
    );
  }, []);

  const closeAfterProductDelete = useCallback((deletedProductId: string) => {
    const current = navStackRef.current;
    // Count how many trailing layers belong to the delete confirmation and/or deleted product detail
    let stepsToPop = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      const layer = current[i];
      if (
        layer.kind === 'delete-confirm' ||
        (layer.kind === 'detail' && layer.productId === deletedProductId)
      ) {
        stepsToPop++;
      } else {
        break;
      }
    }

    if (stepsToPop > 0) {
      pendingHistoryPopRef.current = true;
      window.history.go(-stepsToPop);
      window.setTimeout(() => {
        if (pendingHistoryPopRef.current) {
          pendingHistoryPopRef.current = false;
          const trimmed = navStackRef.current.filter(
            (e) =>
              e.kind !== 'delete-confirm' &&
              !(e.kind === 'detail' && e.productId === deletedProductId)
          );
          navStackRef.current = trimmed;
          setNavStack(trimmed);
        }
      }, 150);
    }
  }, []);

  return {
    selectedProductId,
    isBulkInquiryOpen,
    isDrawerOpen,
    isAddModalOpen,
    isBarcodeScannerOpen,
    isSchedulerModalOpen,
    deleteTarget,
    openProductDetail: (productId: string) => pushLayer({ kind: 'detail', productId }),
    closeProductDetail: () => closeLayer('detail'),
    openBulkInquiry: () => pushLayer({ kind: 'bulk-inquiry' }),
    closeBulkInquiry: () => closeLayer('bulk-inquiry'),
    openDrawer: () => pushLayer({ kind: 'drawer' }),
    closeDrawer: () => closeLayer('drawer'),
    openAddModal: () => pushLayer({ kind: 'add-product' }),
    closeAddModal: () => closeLayer('add-product'),
    openBarcodeScanner: () => pushLayer({ kind: 'barcode-scanner' }),
    closeBarcodeScanner: () => closeLayer('barcode-scanner'),
    openSchedulerModal: () => pushLayer({ kind: 'scheduler' }),
    closeSchedulerModal: () => closeLayer('scheduler'),
    openDeleteConfirm: (id: string, name: string) =>
      pushLayer({ kind: 'delete-confirm', id, name }),
    closeDeleteConfirm: () => closeLayer('delete-confirm'),
    closeAfterProductDelete,
  };
}
