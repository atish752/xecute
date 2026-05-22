import { motion } from 'framer-motion';
import { useAppStore } from '../../store/appStore.js';

const TAB_TITLES = {
  execute: '⚡ Execute',
  plan: '📋 Plan',
  analyse: '📊 Analyse',
  settings: '⚙️ Settings',
};

export default function TopBar({ streak = 0 }) {
  const { activeTab, setShowQuickCapture } = useAppStore();

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass-dark flex items-center justify-between px-5 pt-safe"
      style={{
        height: 60,
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1 select-none">
        <span
          className="font-syne text-xl font-black text-glow-amber"
          style={{ color: '#F5A623', letterSpacing: '-0.03em', lineHeight: 1 }}
        >X</span>
        <span
          className="font-syne text-xl font-black"
          style={{ color: '#F0F2F7', letterSpacing: '-0.03em', lineHeight: 1 }}
        >ecute</span>
      </div>

      {/* Tab title */}
      <motion.span
        key={activeTab}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-dm text-sm font-medium"
        style={{ color: '#8B90A0' }}
      >
        {TAB_TITLES[activeTab]}
      </motion.span>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {streak > 0 && (
          <div className="flex items-center gap-1">
            <span className="flame text-base">🔥</span>
            <span className="font-dm text-sm font-semibold" style={{ color: '#F5A623' }}>{streak}</span>
          </div>
        )}
        <button
          id="quick-capture-btn"
          className="btn btn-ghost"
          style={{ width: 36, height: 36, borderRadius: 10, fontSize: 16, padding: 0 }}
          onClick={() => setShowQuickCapture(true)}
          aria-label="Quick capture task"
        >
          ⚡
        </button>
      </div>
    </motion.header>
  );
}
