import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema.js';
import { useAppStore } from '../../store/appStore.js';
import { getNextBestAction } from '../../ai/gemini.js';
import { getStreak } from '../../db/queries/analytics.js';
import { format } from 'date-fns';

export default function NextBestAction() {
  const { activeTab, setActiveTab, setSelectedTask, setSessionState } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);

  // Load context data from Dexie
  const activeTasks = useLiveQuery(() => db.tasks.where('status').equals('active').toArray(), [], []);
  const streak = useLiveQuery(() => getStreak(), [], 0);
  const todaySessions = useLiveQuery(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return db.sessions.where('startTime').aboveOrEqual(todayStr).toArray();
  }, [], []);

  // Show only on 'execute' and 'plan' tabs
  if (activeTab !== 'execute' && activeTab !== 'plan') {
    return null;
  }

  const handleTrigger = async () => {
    setIsOpen(true);
    setLoading(true);

    try {
      const now = new Date();
      const currentHour = now.getHours();
      const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening';

      const lastSession = todaySessions && todaySessions.length > 0 
        ? todaySessions[todaySessions.length - 1]
        : null;
      let lastSessionText = 'None yet today';
      if (lastSession) {
        const task = await db.tasks.get(lastSession.taskId);
        lastSessionText = `Worked on "${task?.title || 'a task'}" for ${lastSession.focusedMinutes || 0} mins`;
      }

      const p1Tasks = activeTasks?.filter(t => t.priority === 'p1') || [];
      const formattedTasks = activeTasks?.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority
      })) || [];

      const result = await getNextBestAction({
        timeOfDay,
        streak,
        p1Count: p1Tasks.length,
        lastSession: lastSessionText,
        tasks: formattedTasks
      });

      setRecommendation(result);
    } catch (err) {
      console.error(err);
      setRecommendation({
        recommendation: 'Start a focused work session',
        reason: 'Execution is the only way forward. Let\'s make progress now.',
        taskId: null
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteRecommendation = async () => {
    if (recommendation && recommendation.taskId) {
      const task = await db.tasks.get(recommendation.taskId);
      if (task) {
        setSelectedTask(task);
        setSessionState('setup');
        setActiveTab('execute');
      }
    } else {
      setActiveTab('execute');
    }
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.button
        className="fab pulse-dot"
        style={{ pointerEvents: 'auto' }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={handleTrigger}
        title="AI Next Action suggestion"
      >
        🎯
      </motion.button>

      {/* Suggestion Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              style={{ zIndex: 90 }}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="glass-dark"
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                borderTopLeftRadius: 28,
                borderTopRightRadius: 28,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderBottom: 'none',
                padding: '24px 20px 32px',
                zIndex: 95,
                boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {/* Drag Handle Bar */}
              <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 9999, margin: '0 auto 20px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🧠</span>
                <div>
                  <h3 className="font-syne font-bold text-glow-cyan" style={{ color: '#00C9FF', fontSize: 18 }}>
                    Next Best Action
                  </h3>
                  <p className="font-dm" style={{ color: '#4B5060', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    AI MISSION BRIEFING
                  </p>
                </div>
              </div>

              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                  <div style={{ position: 'relative', width: 44, height: 44, marginBottom: 12 }}>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                      style={{
                        width: '100%', height: '100%',
                        borderRadius: '50%',
                        border: '3px solid rgba(0,201,255,0.08)',
                        borderTopColor: '#00C9FF',
                        filter: 'drop-shadow(0 0 6px rgba(0,201,255,0.4))'
                      }}
                    />
                  </div>
                  <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13 }}>Consulting executive intelligence...</p>
                </div>
              ) : recommendation ? (
                <div>
                  <div className="glass-amber glow-amber-sm" style={{ borderRadius: 16, padding: 18, marginBottom: 20, border: '1px solid rgba(245,166,35,0.15)' }}>
                    <p className="font-dm font-semibold" style={{ color: '#F5A623', fontSize: 15, marginBottom: 6 }}>
                      {recommendation.recommendation}
                    </p>
                    <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, lineHeight: 1.5 }}>
                      {recommendation.reason}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1, height: 48, borderRadius: 12 }}
                      onClick={() => setIsOpen(false)}
                    >
                      Dismiss
                    </button>
                    <button
                      className="btn btn-primary glow-amber-sm"
                      style={{ flex: 2, height: 48, borderRadius: 12 }}
                      onClick={handleExecuteRecommendation}
                    >
                      ⚡ Let's Do It Now
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p className="font-dm" style={{ color: '#4B5060', fontSize: 13 }}>No recommendation could be retrieved.</p>
                  <button className="btn btn-ghost" style={{ marginTop: 12, width: '100%' }} onClick={() => setIsOpen(false)}>Close</button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
