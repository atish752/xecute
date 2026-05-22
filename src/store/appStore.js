import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Active tab
  activeTab: 'execute',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Intercept navigation
  pendingTab: null,
  setPendingTab: (tab) => set({ pendingTab: tab }),
  showExitPopup: false,
  setShowExitPopup: (v) => set({ showExitPopup: v }),

  // Session state
  sessionState: 'idle', // idle | setup | active | break | complete
  setSessionState: (state) => set({ sessionState: state }),

  activeSession: null,
  setActiveSession: (session) => set({ activeSession: session }),

  selectedTask: null,
  setSelectedTask: (task) => set({ selectedTask: task }),

  // Timer
  timerSeconds: 0,
  setTimerSeconds: (s) => set({ timerSeconds: s }),

  // Quick capture
  showQuickCapture: false,
  setShowQuickCapture: (v) => set({ showQuickCapture: v }),

  // Morning kickstart
  showMorningKickstart: false,
  setShowMorningKickstart: (v) => set({ showMorningKickstart: v }),

  // Plan editor
  activePlanId: null,
  setActivePlanId: (id) => set({ activePlanId: id }),

  planView: 'list', // list | dashboard | create | matrix
  setPlanView: (v) => set({ planView: v }),

  // Settings (loaded from DB)
  settings: {},
  setSettings: (s) => set({ settings: s }),

  // Online status
  isOnline: navigator.onLine,
  setIsOnline: (v) => set({ isOnline: v }),

  // Notification permission
  notifPermission: 'default',
  setNotifPermission: (v) => set({ notifPermission: v }),
}));
