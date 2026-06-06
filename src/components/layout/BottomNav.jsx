import { motion } from 'framer-motion';
import { useAppStore } from '../../store/appStore.js';

export default function BottomNav() {
  const { activeTab, setActiveTab, sessionState, setPendingTab, setShowExitPopup } = useAppStore();

  const TABS = [
    {
      id: 'execute',
      label: 'Execute',
      icon: (isActive) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill={isActive ? '#F5A623' : 'none'} stroke={isActive ? '#F5A623' : '#4B5060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s, fill 0.2s' }}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    },
    {
      id: 'plan',
      label: 'Plan',
      icon: (isActive) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#F5A623' : '#4B5060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill={isActive ? 'rgba(245,166,35,0.2)' : 'none'} />
          <line x1="9" y1="9" x2="15" y2="9" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      )
    },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: (isActive) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#F5A623' : '#4B5060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }}>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    },
    {
      id: 'analyse',
      label: 'Analyse',
      icon: (isActive) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#F5A623' : '#4B5060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (isActive) => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#F5A623' : '#4B5060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      )
    }
  ];

  return (
    <motion.nav
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="glass-dark bottom-nav-safe"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          height: 64,
        }}
      >

        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-${tab.id}`}
              onClick={() => {
                if (tab.id !== 'execute' && (sessionState === 'active' || sessionState === 'break')) {
                  setPendingTab(tab.id);
                  setShowExitPopup(true);
                } else {
                  setActiveTab(tab.id);
                }
              }}
              aria-label={tab.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                WebkitTapHighlightColor: 'transparent',
                transition: 'opacity 0.15s',
                opacity: isActive ? 1 : 0.55,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '20%',
                    right: '20%',
                    height: 2,
                    borderRadius: '0 0 4px 4px',
                    background: 'linear-gradient(90deg, #F5A623, #FFD060)',
                    boxShadow: '0 0 8px rgba(245,166,35,0.60)',
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              {tab.icon(isActive)}
              <span
                className="font-dm"
                style={{
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#F5A623' : '#8B90A0',
                  transition: 'color 0.2s',
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </motion.nav>
  );
}
