import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineStatusBar() {
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted || isOnline) return null;

  return (
    <div className="bg-orange-600 text-white text-xs font-medium py-1 px-4 text-center flex items-center justify-center gap-2 fixed top-0 left-0 right-0 z-[100]">
      <WifiOff size={14} />
      <span>You are offline. Changes will be synced when connection is restored.</span>
    </div>
  );
}
