import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { registerSW } from 'virtual:pwa-register';
import { useAppStore } from './store/appStore.js';
import { getAllSettings } from './db/queries/settings.js';
import { getStreak } from './db/queries/analytics.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import { useNotifications } from './hooks/useNotifications.js';
import { db } from './db/schema.js';

import TopBar from './components/layout/TopBar.jsx';
import BottomNav from './components/layout/BottomNav.jsx';
import QuickCapture from './components/layout/QuickCapture.jsx';
import SplashScreen from './components/layout/SplashScreen.jsx';
import MorningKickstart from './components/layout/MorningKickstart.jsx';

import ExecuteTab from './pages/Execute/index.jsx';
import PlanTab from './pages/Plan/index.jsx';
import AnalyseTab from './pages/Analyse/index.jsx';
import SettingsTab from './pages/Settings/index.jsx';

// Register PWA Service Worker
registerSW({ immediate: true });

const TAB_COMPONENTS = {
  execute: ExecuteTab,
  plan: PlanTab,
  analyse: AnalyseTab,
  settings: SettingsTab,
};

// Premium glassmorphic transition (scale + fade + blur reveal)
const getVariants = () => ({
  initial:  { scale: 0.96, opacity: 0, filter: 'blur(8px)' },
  animate:  { scale: 1, opacity: 1, filter: 'blur(0px)' },
  exit:     { scale: 1.04, opacity: 0, filter: 'blur(8px)' },
});

const TAB_ORDER = ['execute', 'plan', 'analyse', 'settings'];

export default function App() {
  const { activeTab, setSettings, settings } = useAppStore();
  const [streak, setStreak] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [showKickstart, setShowKickstart] = useState(false);
  const [prevTab, setPrevTab] = useState('execute');
  const isOnline = useOnlineStatus();
  const { sendNotification } = useNotifications();

  // Load settings from DB on mount
  useEffect(() => {
    const init = async () => {
      const s = await getAllSettings();
      setSettings(s);
      const str = await getStreak();
      setStreak(str);

      // Check if morning kickstart modal should show
      if (s.morningKickstart) {
        setShowKickstart(true);
      }
    };
    init();
  }, [setSettings]);

  // Procrastination Shield Check
  useEffect(() => {
    if (!settings || !settings.procrastinationShield) return;

    const checkProcrastination = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      if (localStorage.getItem('xecute_procrastination_alerted') === todayStr) return;

      // Check if any sessions have been started today
      const todaySessions = await db.sessions.where('startTime').aboveOrEqual(todayStr).toArray();
      const completedSessions = todaySessions.filter(s => s.endTime !== null);
      if (completedSessions.length > 0) return;

      // Check current time vs work start time + 30 mins
      const [startHour, startMin] = settings.workStartTime.split(':').map(Number);
      const startTimeMinutes = startHour * 60 + startMin;
      const alertTimeMinutes = startTimeMinutes + 30;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (currentMinutes >= alertTimeMinutes) {
        sendNotification(
          "Procrastination Shield 🛑", 
          "You haven't started your focus session yet. Start now - even 5 minutes counts!"
        );
        localStorage.setItem('xecute_procrastination_alerted', todayStr);
      }
    };

    checkProcrastination();
    const interval = setInterval(checkProcrastination, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings, sendNotification]);

  // Track tab direction for animation
  const direction = TAB_ORDER.indexOf(activeTab) >= TAB_ORDER.indexOf(prevTab) ? 1 : -1;
  useEffect(() => { setPrevTab(activeTab); }, [activeTab]);

  if (showSplash) {
    return <SplashScreen onDone={() => setShowSplash(false)} />;
  }

  const TabComponent = TAB_COMPONENTS[activeTab];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#07080a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ambient background blobs */}
      <div className="bg-ambient" />

      {/* Offline banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            style={{
              position: 'absolute',
              top: 60,
              left: 0,
              right: 0,
              zIndex: 25,
              background: 'rgba(245,166,35,0.12)',
              borderBottom: '1px solid rgba(245,166,35,0.20)',
              padding: '6px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: '#F5A623',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            📡 Offline — All your data is saved locally
          </motion.div>
        )}
      </AnimatePresence>

      {/* Morning Kickstart Ritual */}
      {showKickstart && settings && (
        <MorningKickstart
          enabled={!!settings.morningKickstart}
          onDone={() => setShowKickstart(false)}
        />
      )}

      {/* Top Bar */}
      <TopBar streak={streak} />

      {/* Tab Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            variants={getVariants()}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <TabComponent />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Quick Capture Overlay */}
      <QuickCapture />
    </div>
  );
}
