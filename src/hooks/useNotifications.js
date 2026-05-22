import { useCallback } from 'react';
import { useAppStore } from '../store/appStore.js';

export const useNotifications = () => {
  const { notifPermission, setNotifPermission } = useAppStore();

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return 'denied';
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    return perm;
  }, [setNotifPermission]);

  const sendNotification = useCallback((title, body, options = {}) => {
    if (Notification.permission !== 'granted') return;
    new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      ...options,
    });
  }, []);

  return { permission: notifPermission, requestPermission, sendNotification };
};
