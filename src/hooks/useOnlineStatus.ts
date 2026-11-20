import { useEffect, useRef, useState } from 'react';

/**
 * Debounced online status hook that verifies browser 'offline' events
 * against same-origin /api/kv/status before declaring the device offline,
 * preventing false Net-Melli switches on transient browser/VPN blips.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearOfflineTimer = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };

    const handleOnline = () => {
      clearOfflineTimer();
      setIsOnline(true);
    };

    const handleOffline = () => {
      clearOfflineTimer();
      offlineTimerRef.current = setTimeout(async () => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          setIsOnline(true);
          return;
        }
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 2500);
          const res = await fetch('/api/kv/status', {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            setIsOnline(true);
            return;
          }
        } catch {
          // Confirmed unreachable
        }
        setIsOnline(false);
      }, 2000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearOfflineTimer();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
