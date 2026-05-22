import { useEffect } from 'react';
import { useAppStore } from '../store/appStore.js';

export const useOnlineStatus = () => {
  const { isOnline, setIsOnline } = useAppStore();
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);
  return isOnline;
};
