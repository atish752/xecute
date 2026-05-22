import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/appStore.js';
import { addToInbox } from '../../db/queries/analytics.js';

export default function QuickCapture() {
  const { showQuickCapture, setShowQuickCapture } = useAppStore();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    await addToInbox(value.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setValue('');
      setShowQuickCapture(false);
    }, 800);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setShowQuickCapture(false);
  };

  return (
    <AnimatePresence>
      {showQuickCapture && (
        <>
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowQuickCapture(false)}
          />
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={{
              position: 'fixed',
              bottom: 100,
              left: 16,
              right: 16,
              zIndex: 60,
              borderRadius: 20,
            }}
            className="glass-amber"
          >
            <div style={{ padding: '20px 20px 16px' }}>
              <p className="font-syne text-base font-bold" style={{ color: '#F5A623', marginBottom: 12 }}>
                ⚡ Capture a thought
              </p>
              <input
                id="quick-capture-input"
                className="input"
                placeholder="What's on your mind? Press Enter to save."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKey}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1, height: 44, fontSize: 14 }}
                  onClick={() => setShowQuickCapture(false)}
                >
                  Cancel
                </button>
                <button
                  id="quick-capture-save"
                  className="btn btn-primary"
                  style={{ flex: 2, height: 44, fontSize: 14 }}
                  onClick={handleSave}
                >
                  {saved ? '✓ Saved to Inbox' : 'Save to Inbox'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
