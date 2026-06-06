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

  // Global Timer State & Actions
  timerSecondsLeft: 0,
  timerTotalSeconds: 0,
  timerIsRunning: false,
  timerIsPaused: false,
  timerTargetTime: null,
  timerPausedTimeLeft: 0,
  timerBreaksDone: 0,
  timerBreakAfterSeconds: null,
  timerShowBreakOverlay: false,
  timerIntention: '',
  timerAmbientSound: 'silence',
  timerSessionNotes: '',
  timerSessionId: null,
  timerProgressSlider: 50,
  timerExtendedSeconds: 0,
  timerWorkMinutes: 45,
  timerBreakMinutes: 10,
  timerBreakInterval: 25,
  timerIsCustomBreak: false,
  timerIsCustomInterval: false,
  timerBreaksTaken: 0,
  timerShowNotes: false,

  setTimerSecondsLeft: (val) => set({ timerSecondsLeft: val }),
  setTimerTotalSeconds: (val) => set({ timerTotalSeconds: val }),
  setTimerIsRunning: (val) => set({ timerIsRunning: val }),
  setTimerIsPaused: (val) => set({ timerIsPaused: val }),
  setTimerTargetTime: (val) => set({ timerTargetTime: val }),
  setTimerPausedTimeLeft: (val) => set({ timerPausedTimeLeft: val }),
  setTimerBreaksDone: (val) => set({ timerBreaksDone: val }),
  setTimerBreakAfterSeconds: (val) => set({ timerBreakAfterSeconds: val }),
  setTimerShowBreakOverlay: (val) => set({ timerShowBreakOverlay: val }),
  setTimerIntention: (val) => set({ timerIntention: val }),
  setTimerAmbientSound: (val) => set({ timerAmbientSound: val }),
  setTimerSessionNotes: (val) => set({ timerSessionNotes: val }),
  setTimerSessionId: (val) => set({ timerSessionId: val }),
  setTimerProgressSlider: (val) => set({ timerProgressSlider: val }),
  setTimerExtendedSeconds: (val) => set({ timerExtendedSeconds: val }),
  setTimerWorkMinutes: (val) => set({ timerWorkMinutes: val }),
  setTimerBreakMinutes: (val) => set({ timerBreakMinutes: val }),
  setTimerBreakInterval: (val) => set({ timerBreakInterval: val }),
  setTimerIsCustomBreak: (val) => set({ timerIsCustomBreak: val }),
  setTimerIsCustomInterval: (val) => set({ timerIsCustomInterval: val }),
  setTimerBreaksTaken: (val) => set({ timerBreaksTaken: val }),
  setTimerShowNotes: (val) => set({ timerShowNotes: val }),

  startGlobalTimer: (totalSeconds, breakAfterSeconds) => {
    set({
      timerTargetTime: Date.now() + totalSeconds * 1000,
      timerTotalSeconds: totalSeconds,
      timerSecondsLeft: totalSeconds,
      timerIsRunning: true,
      timerIsPaused: false,
      timerBreaksDone: 0,
      timerBreakAfterSeconds: breakAfterSeconds,
      timerExtendedSeconds: 0,
      timerBreaksTaken: 0
    });
  },

  pauseGlobalTimer: () => {
    const { timerIsRunning, timerSecondsLeft } = get();
    if (!timerIsRunning) return;
    set({
      timerIsPaused: true,
      timerPausedTimeLeft: timerSecondsLeft
    });
  },

  resumeGlobalTimer: () => {
    const { timerIsPaused, timerPausedTimeLeft } = get();
    if (!timerIsPaused) return;
    set({
      timerTargetTime: Date.now() + timerPausedTimeLeft * 1000,
      timerIsPaused: false
    });
  },

  resetGlobalTimer: () => {
    set({
      timerIsRunning: false,
      timerIsPaused: false,
      timerSecondsLeft: 0,
      timerTargetTime: null,
      timerBreaksDone: 0,
      timerExtendedSeconds: 0,
      timerBreaksTaken: 0
    });
  },

  extendGlobalTimer: (extraSeconds) => {
    const { timerTargetTime, timerTotalSeconds, timerExtendedSeconds } = get();
    set({
      timerTargetTime: (timerTargetTime || Date.now()) + extraSeconds * 1000,
      timerTotalSeconds: timerTotalSeconds + extraSeconds,
      timerExtendedSeconds: timerExtendedSeconds + extraSeconds
    });
  },

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

