import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const isNativeAndroid = Capacitor.isNativePlatform();
  const isElectronDesktop =
    typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron');

  useEffect(() => {
    const standaloneMatch =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-ignore - iOS Safari standalone check
      Boolean(window.navigator.standalone);

    if (standaloneMatch || isNativeAndroid || isElectronDesktop) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isNativeAndroid, isElectronDesktop]);

  const installApp = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
    return outcome;
  };

  return {
    isInstallable: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isNativeAndroid,
    isElectronDesktop,
    installApp,
  };
}
