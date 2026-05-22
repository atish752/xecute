import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema.js';
import { getStreak } from '../../db/queries/analytics.js';
import { generateMorningQuote } from '../../ai/gemini.js';
import { format } from 'date-fns';

export default function MorningKickstart({ enabled, onDone }) {
  const [show, setShow] = useState(false);
  const [quote, setQuote] = useState('');
  const [loading, setLoading] = useState(true);

  // Queries
  const settings = useLiveQuery(() => db.settings.toArray(), [], []);
  const streak = useLiveQuery(() => getStreak(), [], 0);
  const topTasks = useLiveQuery(() => 
    db.tasks
      .where('status')
      .equals('active')
      .toArray()
      .then(tasks => {
        // Sort: P1 first, then order
        const priorityOrder = { p1: 0, p2: 1, p3: 2 };
        return tasks.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
      }), [], []);

  useEffect(() => {
    if (!enabled) {
      onDone();
      return;
    }

    const checkStatus = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastKickstart = localStorage.getItem('xecute_last_kickstart');
      if (lastKickstart !== todayStr) {
        setShow(true);
        fetchQuote();
      } else {
        onDone();
      }
    };

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const userNameRow = settings?.find(r => r.key === 'userName');
        const userName = userNameRow ? userNameRow.value : 'operator';
        
        // Grab top 3 tasks for Gemini context
        const taskTitles = topTasks ? topTasks.slice(0, 3).map(t => t.title) : [];
        const genQuote = await generateMorningQuote(userName, taskTitles);
        setQuote(genQuote || 'Do it now. Execution is everything.');
      } catch (e) {
        console.error(e);
        setQuote('Do it now. Execution is everything.');
      } finally {
        setLoading(false);
      }
    };

    if (settings && settings.length > 0 && topTasks) {
      checkStatus();
    }
  }, [enabled, settings, topTasks, onDone]);

  const handleDismiss = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('xecute_last_kickstart', todayStr);
    setShow(false);
    onDone();
  };

  if (!show) return null;

  const todayDate = format(new Date(), 'EEEE, MMMM d, yyyy');
  const userNameRow = settings?.find(r => r.key === 'userName');
  const userName = userNameRow ? userNameRow.value : 'Operator';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: '#07080a',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 24px',
          overflowY: 'auto'
        }}
      >
        {/* Glow ambient */}
        <div 
          style={{
            position: 'absolute',
            top: '20%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '80vw',
            height: '80vw',
            background: 'radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 60%)',
            borderRadius: '50%',
            filter: 'blur(30px)',
            pointerEvents: 'none'
          }}
        />

        {/* Top Info */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{ textAlign: 'center', marginTop: 20 }}
        >
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(245,166,35,0.08)',
            border: '1px solid rgba(245,166,35,0.18)',
            padding: '4px 12px',
            borderRadius: 9999,
            marginBottom: 16
          }}>
            <span style={{ fontSize: 12 }}>⚡</span>
            <span className="font-dm font-semibold" style={{ color: '#F5A623', fontSize: 11, letterSpacing: '0.04em' }}>
              DAILY BRIEFING
            </span>
          </div>
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {todayDate}
          </p>
          <h1 className="font-syne font-extrabold text-glow-amber" style={{ fontSize: 26, color: '#F5A623', marginTop: 8 }}>
            Good Morning, {userName}.
          </h1>
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 14, marginTop: 4 }}>
            Let's execute on today's agenda.
          </p>
        </motion.div>

        {/* Center Panel (Quote + Tasks) */}
        <div style={{ margin: '40px 0', display: 'flex', flexDirection: 'column', gap: 20, zIndex: 1 }}>
          {/* Quote Card */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="glass"
            style={{ borderRadius: 24, padding: '24px 20px', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="font-dm" style={{ color: '#8B90A0', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              ✨ MORNING DIRECTION
            </p>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="shimmer" style={{ height: 14, borderRadius: 6 }} />
                <div className="shimmer" style={{ height: 14, borderRadius: 6, width: '80%' }} />
              </div>
            ) : (
              <p className="font-syne font-medium" style={{ fontSize: 16, color: '#F0F2F7', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{quote}"
              </p>
            )}
          </motion.div>

          {/* Tasks checklist preview */}
          {topTasks && topTasks.length > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="glass-dark"
              style={{ borderRadius: 24, padding: '20px 20px', border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <p className="font-dm" style={{ color: '#4B5060', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                🎯 TOP TASKS TODAY
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topTasks.slice(0, 3).map((t, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 6,
                      border: `1px solid ${t.priority === 'p1' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      background: t.priority === 'p1' ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: t.priority === 'p1' ? '#EF4444' : '#8B90A0', fontWeight: 700
                    }}>
                      {idx + 1}
                    </div>
                    <p className="font-dm font-medium" style={{ color: '#F0F2F7', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {t.title}
                    </p>
                    <span className="font-dm" style={{
                      fontSize: 10,
                      color: t.priority === 'p1' ? '#EF4444' : t.priority === 'p2' ? '#F59E0B' : '#10B981',
                      fontWeight: 600
                    }}>
                      {t.priority.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Streak indicator if active */}
          {streak > 0 && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
            >
              <span className="flame" style={{ fontSize: 20 }}>🔥</span>
              <span className="font-syne font-bold" style={{ color: '#F5A623', fontSize: 14 }}>
                {streak}-Day Streak Active
              </span>
            </motion.div>
          )}
        </div>

        {/* Action Button */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{ zIndex: 1, paddingBottom: 10 }}
        >
          <button
            className="btn btn-primary glow-amber"
            style={{ width: '100%', height: 54, fontSize: 16, borderRadius: 16 }}
            onClick={handleDismiss}
          >
            ⚡ Let's Execute
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
