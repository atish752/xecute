import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../../store/appStore.js';
import { db } from '../../db/schema.js';
import { updateTaskProgress } from '../../db/queries/tasks.js';
import { startSession, endSession, updateSessionNotes } from '../../db/queries/sessions.js';
import { checkAndUnlockMilestones } from '../../db/queries/milestones.js';
import { useNotifications } from '../../hooks/useNotifications.js';
import { getFocusCoach } from '../../ai/gemini.js';
import { generateCompletionMessage } from '../../ai/claude.js';
import confetti from 'canvas-confetti';
import PriorityBadge from '../../components/common/PriorityBadge.jsx';
import { startSound, stopSound } from '../../utils/audioSynth.js';
import { addToInbox } from '../../db/queries/analytics.js';
import { syncToCloud } from '../../utils/cloudSync.js';



const PRESETS = [
  { label: '25m', value: 25, icon: '🍅' },
  { label: '45m', value: 45, icon: '⚡' },
  { label: '90m', value: 90, icon: '🔥' },
];

const SOUNDS = [
  { id: 'silence', label: 'Silence', icon: '🔇' },
  { id: 'lofi', label: 'Lo-fi', icon: '🎵' },
  { id: 'rain', label: 'Rain', icon: '🌧️' },
  { id: 'forest', label: 'Forest', icon: '🌲' },
  { id: 'whitenoise', label: 'White Noise', icon: '📡' },
];

function CircularTimer({ progress, timeDisplay, isRunning }) {
  const size = 240;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer pulse ring */}
      {isRunning && (
        <div
          className="timer-pulse-ring"
          style={{
            position: 'absolute',
            inset: -16,
            borderRadius: '50%',
            border: '2px solid rgba(245,166,35,0.20)',
          }}
        />
      )}

      {/* Frosted Center Panel */}
      <div
        className="glass"
        style={{
          position: 'absolute',
          width: size - strokeWidth * 2 - 16,
          height: size - strokeWidth * 2 - 16,
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isRunning ? '0 0 25px rgba(245,166,35,0.12), inset 0 1px 0 rgba(255,255,255,0.05)' : '0 8px 32px 0 rgba(0,0,0,0.37)',
          zIndex: 1,
        }}
      >
        <div
          className={`font-syne font-black`}
          style={{
            fontSize: 48,
            color: '#F0F2F7',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            textShadow: isRunning ? '0 0 12px rgba(245,166,35,0.50)' : 'none',
          }}
        >
          {timeDisplay}
        </div>
        <div className="font-dm" style={{ color: '#8B90A0', fontSize: 11, marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>
          remaining
        </div>
      </div>

      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute', zIndex: 2, pointerEvents: 'none' }}>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        {/* Progress */}
        <circle
          cx={size/2} cy={size/2} r={radius}
          fill="none"
          stroke="#F5A623"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.5s linear',
            filter: 'drop-shadow(0 0 8px rgba(245,166,35,0.60))',
          }}
        />
      </svg>
    </div>
  );
}

export default function ExecuteTab() {
  const { 
    sessionState, setSessionState, 
    selectedTask, setSelectedTask, 
    settings,
    pendingTab, setPendingTab,
    showExitPopup, setShowExitPopup,
    setActiveTab,

    timerSecondsLeft: secondsLeft,
    timerTotalSeconds: totalSeconds,
    timerIsRunning: isRunning,
    timerIsPaused: isPaused,
    timerTargetTime: targetTime,
    timerPausedTimeLeft: pausedTimeLeft,
    timerBreaksDone: breaksDone,
    timerBreakAfterSeconds: breakAfterSeconds,
    timerShowBreakOverlay: showBreakOverlay,
    timerIntention: intention,
    timerAmbientSound: ambientSound,
    timerSessionNotes: sessionNotes,
    timerSessionId: sessionId,
    timerProgressSlider: progressSlider,
    timerExtendedSeconds: extendedSeconds,
    timerWorkMinutes: workMinutes,
    timerBreakMinutes: breakMinutes,
    timerBreakInterval: breakInterval,
    timerIsCustomBreak: isCustomBreak,
    timerIsCustomInterval: isCustomInterval,
    timerBreaksTaken: breaksTaken,
    timerShowNotes: showNotes,

    setTimerSecondsLeft: setSecondsLeft,
    setTimerTotalSeconds: setTotalSeconds,
    setTimerIsRunning: setIsRunning,
    setTimerIsPaused: setIsPaused,
    setTimerTargetTime: setTargetTime,
    setTimerPausedTimeLeft: setPausedTimeLeft,
    setTimerBreaksDone: setBreaksDone,
    setTimerBreakAfterSeconds: setBreakAfterSeconds,
    setTimerShowBreakOverlay: setShowBreakOverlay,
    setTimerIntention: setIntention,
    setTimerAmbientSound: setAmbientSound,
    setTimerSessionNotes: setSessionNotes,
    setTimerSessionId: setSessionId,
    setTimerProgressSlider: setProgressSlider,
    setTimerExtendedSeconds: setExtendedSeconds,
    setTimerWorkMinutes: setWorkMinutes,
    setTimerBreakMinutes: setBreakMinutes,
    setTimerBreakInterval: setBreakInterval,
    setTimerIsCustomBreak: setIsCustomBreak,
    setTimerIsCustomInterval: setIsCustomInterval,
    setTimerBreaksTaken: setBreaksTaken,
    setTimerShowNotes: setShowNotes,

    startGlobalTimer: start,
    pauseGlobalTimer: pause,
    resumeGlobalTimer: resume,
    resetGlobalTimer: reset,
    extendGlobalTimer: extend
  } = useAppStore();
  const { sendNotification, requestPermission } = useNotifications();

  const activePlans = useLiveQuery(() => db.plans.where('status').equals('active').toArray(), [], []);
  const [selectedPlanId, setSelectedPlanId] = useState('today-tasks');

  // Sync selectedPlanId with first active plan if not set or if current one is no longer active
  useEffect(() => {
    if (selectedPlanId === 'today-tasks') return;
    if (activePlans && activePlans.length > 0) {
      if (!selectedPlanId || !activePlans.some(p => p.id === selectedPlanId)) {
        setSelectedPlanId('today-tasks');
      }
    } else {
      setSelectedPlanId('today-tasks');
    }
  }, [activePlans, selectedPlanId]);

  // Deselect task if it doesn't belong to the selected plan or standalone
  useEffect(() => {
    if (selectedTask && selectedTask.planId !== selectedPlanId && !(selectedPlanId === 'today-tasks' && !selectedTask.planId)) {
      setSelectedTask(null);
    }
  }, [selectedPlanId, selectedTask, setSelectedTask]);

  const categories = useLiveQuery(async () => {
    if (!selectedPlanId || selectedPlanId === 'today-tasks') return [];
    const cats = await db.categories.where('planId').equals(selectedPlanId).toArray();
    return cats.sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [selectedPlanId], []);

  const tasks = useLiveQuery(async () => {
    if (!selectedPlanId) return [];
    if (selectedPlanId === 'today-tasks') {
      const allTasksArr = await db.tasks.toArray();
      const allStandalone = allTasksArr.filter(t => !t.planId);
      const todayStr = new Date().toISOString().split('T')[0];
      return allStandalone.filter(t => {
        if (t.taskType === 'daily') return true;
        // One-time tasks: show if active, or if completed today
        if (t.status === 'active') return true;
        if (t.status === 'completed' && t.updatedAt && t.updatedAt.startsWith(todayStr)) return true;
        return false;
      });
    }
    const allPlanTasks = await db.tasks.where('planId').equals(selectedPlanId).toArray();
    return allPlanTasks.filter(t => t.status === 'active');
  }, [selectedPlanId], []);


  // Session-specific UI states
  const [focusCoach, setFocusCoach] = useState('');
  const [loadingCoach, setLoadingCoach] = useState(false);
  const [brainDumpText, setBrainDumpText] = useState('');
  const [brainDumpLogged, setBrainDumpLogged] = useState(false);
  const [customBreakDuration, setCustomBreakDuration] = useState(10);
  const [completionMsg, setCompletionMsg] = useState('');

  // Page Reload / Exit protection
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (sessionState === 'active' || sessionState === 'break') {
        e.preventDefault();
        e.returnValue = 'You are in the middle of a focus session. Leaving now will discard your session progress.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionState]);

  // Initialize values from settings
  useEffect(() => {
    if (settings && Object.keys(settings).length > 0) {
      if (settings.defaultSessionMinutes) setWorkMinutes(settings.defaultSessionMinutes);
      if (settings.defaultBreakMinutes) {
        setBreakMinutes(settings.defaultBreakMinutes);
        setIsCustomBreak(![5, 10, 15, 20].includes(settings.defaultBreakMinutes));
      }
      
      const initialInterval = settings.defaultBreakInterval !== undefined 
        ? settings.defaultBreakInterval 
        : (settings.defaultBreakFrequency !== undefined ? (settings.defaultBreakFrequency === 0 ? 0 : 25) : 25);
      
      setBreakInterval(initialInterval);
      setIsCustomInterval(![0, 15, 25, 40, 60].includes(initialInterval));
      if (settings.defaultAmbientSound) setAmbientSound(settings.defaultAmbientSound);
    }
  }, [settings]);

  const workSeconds = workMinutes * 60;
  const calculatedBreakAfterSeconds = breakInterval > 0 ? breakInterval * 60 : null;

  const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const triggerBreak = (durationInMinutes) => {
    setSessionState('break');
    setBreakMinutes(durationInMinutes);
    start(durationInMinutes * 60, 0); // start break timer globally
  };

  const handleSkipBreakInSession = () => {
    setSessionState('active');
    start(workSeconds, calculatedBreakAfterSeconds);
  };

  // Synchronize Web Audio Synth with timer running and pause state
  useEffect(() => {
    if (sessionState === 'active' && isRunning && !isPaused) {
      startSound(ambientSound);
    } else {
      stopSound();
    }
    return () => stopSound();
  }, [sessionState, isRunning, isPaused, ambientSound]);

  const handleStartSession = async () => {
    await requestPermission();
    setLoadingCoach(true);
    const coach = await getFocusCoach(selectedTask?.title || 'Focus session', intention, workMinutes);
    setFocusCoach(coach || '');
    setLoadingCoach(false);

    setExtendedSeconds(0); // Reset session extension

    const breaksScheduledCount = breakInterval > 0 ? Math.floor(workMinutes / breakInterval) : 0;

    const id = await startSession({
      taskId: selectedTask?.id,
      planId: selectedTask?.planId,
      breaksScheduled: breaksScheduledCount,
      progressBefore: selectedTask?.progress || 0,
      intentionText: intention,
      ambientSound,
    });
    setSessionId(id);
    setSessionState('active');
    start(workSeconds, calculatedBreakAfterSeconds);
  };

  const handleEndSession = () => {
    pause();
    setSessionState('complete');
  };

  const handleBreakTake = () => {
    setBreaksTaken(b => b + 1);
    setShowBreakOverlay(false);
    triggerBreak(breakMinutes);
  };

  const handleBreakSkip = () => {
    setShowBreakOverlay(false);
    resume(); // Resume timer
  };

  const handleCompleteSession = async () => {
    const focusedMinutes = Math.round((workSeconds + extendedSeconds - secondsLeft) / 60);
    if (sessionId) {
      await endSession(sessionId, {
        focusedMinutes,
        breaksTaken,
        progressAfter: progressSlider,
        notes: sessionNotes,
      });
    }
    if (selectedTask) {
      if (selectedTask.taskType === 'daily') {
        const todayStr = new Date().toISOString().split('T')[0];
        const completedDates = selectedTask.completedDates || [];
        if (progressSlider >= 100) {
          if (!completedDates.includes(todayStr)) completedDates.push(todayStr);
        } else {
          const idx = completedDates.indexOf(todayStr);
          if (idx > -1) completedDates.splice(idx, 1);
        }
        await db.tasks.update(selectedTask.id, {
          completedDates,
          progress: progressSlider,
          updatedAt: new Date().toISOString()
        });
      } else {
        await updateTaskProgress(selectedTask.id, progressSlider);
      }
    }
    await checkAndUnlockMilestones();

    // Auto cloud backup if signed in and auto-sync is enabled
    const autoSyncEnabled = localStorage.getItem('xecute_auto_sync_enabled') === 'true';
    const signedInUser = localStorage.getItem('xecute_signed_in_user');
    const password = localStorage.getItem('xecute_signed_in_password');
    if (autoSyncEnabled && signedInUser && password) {
      syncToCloud(signedInUser, password).catch(e => console.error('[Execute Sync] Auto-sync failed:', e));
    }



    if (progressSlider >= 100) {
      confetti({
        particleCount: 120,
        spread: 70,
        colors: ['#F5A623', '#FFD060', '#FFFFFF', '#F0F2F7'],
        origin: { y: 0.6 },
      });
      const msg = await generateCompletionMessage(selectedTask?.title || 'task');
      setCompletionMsg(msg || 'Crushed it. Keep going.');
    }

    reset();
    setSessionState('idle');
    setSelectedTask(null);
    setIntention('');
    setSessionNotes('');
    setBreaksTaken(0);
  };

  const priorityWeights = { p1: 1, p2: 2, p3: 3 };
  const sortTasks = (list) => {
    return [...list].sort((a, b) => {
      const pA = priorityWeights[a.priority] || 2;
      const pB = priorityWeights[b.priority] || 2;
      if (pA !== pB) return pA - pB;
      return (a.order || 0) - (b.order || 0);
    });
  };

  const uncategorizedTasks = sortTasks((tasks || []).filter(t => !t.categoryId));

  const renderExecuteTaskItem = (task, isSignal = false, isNoise = false) => {
    const isSelected = selectedTask?.id === task.id;
    const todayStr = new Date().toISOString().split('T')[0];
    const isCompleted = task.taskType === 'daily'
      ? task.completedDates?.includes(todayStr)
      : task.status === 'completed';

    let borderColor = 'rgba(255,255,255,0.04)';
    let background = 'rgba(255,255,255,0.01)';
    let boxShadow = 'none';

    if (isSelected) {
      borderColor = 'rgba(245,166,35,0.40)';
      background = 'rgba(245,166,35,0.06)';
      boxShadow = '0 0 15px rgba(245,166,35,0.05)';
    } else if (isSignal) {
      borderColor = 'rgba(239,68,68,0.25)';
      background = 'rgba(239,68,68,0.025)';
      boxShadow = '0 0 12px rgba(239,68,68,0.08)';
    }

    return (
      <motion.div
        key={task.id}
        whileTap={{ scale: 0.98 }}
        className="glass glass-sm card-hover"
        style={{
          cursor: 'pointer',
          borderColor,
          background,
          padding: '12px 14px',
          borderRadius: 14,
          boxShadow,
          opacity: isCompleted ? 0.55 : (isNoise ? 0.75 : 1),
          transition: 'all 0.2s',
        }}
        onClick={() => setSelectedTask(isSelected ? null : task)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-dm font-medium" style={{ color: '#F0F2F7', fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isCompleted ? 'line-through' : 'none' }}>
              {task.title}
            </p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <PriorityBadge priority={task.priority} />
              
              {!task.planId && (
                <span className="chip" style={{ background: 'rgba(255,255,255,0.03)', color: '#8B90A0', border: '1px solid rgba(255,255,255,0.04)', fontSize: 10 }}>
                  {task.taskType === 'daily' ? '🔄 Daily' : '🎯 One-time'}
                </span>
              )}

              {task.estimatedMinutes && (
                <span className="font-dm" style={{ color: '#8B90A0', fontSize: 11.5 }}>
                  ~{task.estimatedMinutes}m est.
                </span>
              )}

              {isCompleted ? (
                <span className="font-dm" style={{ color: '#10B981', fontSize: 11.5, fontWeight: 600 }}>
                  ✓ Completed today
                </span>
              ) : task.progress > 0 ? (
                <span className="font-dm text-glow-cyan" style={{ color: '#00C9FF', fontSize: 11.5 }}>
                  {task.progress}% done
                </span>
              ) : null}
            </div>
          </div>
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'linear-gradient(135deg, #F5A623 0%, #D48C11 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: '#050608', fontWeight: 800, flexShrink: 0,
                boxShadow: '0 0 8px rgba(245,166,35,0.5)',
              }}
            >✓</motion.div>
          )}
        </div>
        {isSelected && task.progress > 0 && (
          <div className="progress-track" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${task.progress}%` }} />
          </div>
        )}
      </motion.div>
    );
  };


  // IDLE STATE — Task Selector
  if (sessionState === 'idle' || sessionState === 'setup') {
    return (
      <div className="scrollable" style={{ flex: 1, padding: '16px 16px 16px' }}>
        {/* Active Plans Horizontal Switcher */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 20 }}
        >
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
            Select Plan
          </p>
          <div 
            style={{ 
              display: 'flex', 
              overflowX: 'auto', 
              gap: 10, 
              paddingBottom: 8,
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
            className="no-scrollbar"
          >
            {/* Special button for Today's Standalone Tasks */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setSelectedPlanId('today-tasks')}
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'Syne, sans-serif',
                border: selectedPlanId === 'today-tasks' ? '1px solid rgba(245,166,35,0.35)' : '1px solid rgba(255,255,255,0.04)',
                background: selectedPlanId === 'today-tasks' ? 'rgba(245,166,35,0.1)' : 'rgba(255,255,255,0.01)',
                color: selectedPlanId === 'today-tasks' ? '#F5A623' : '#8B90A0',
                transition: 'all 0.2s',
              }}
            >
              📋 Today's Tasks
            </motion.button>

            {activePlans && activePlans.map(plan => {
              const isActive = selectedPlanId === plan.id;
              return (
                <motion.button
                  key={plan.id}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 12,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'Syne, sans-serif',
                    border: isActive ? '1px solid rgba(245,166,35,0.35)' : '1px solid rgba(255,255,255,0.04)',
                    background: isActive ? 'rgba(245,166,35,0.1)' : 'rgba(255,255,255,0.01)',
                    color: isActive ? '#F5A623' : '#8B90A0',
                    transition: 'all 0.2s',
                  }}
                >
                  🎯 {plan.name}
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Task List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          {(!selectedPlanId) ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p className="empty-state-text">No active plans yet. Create an active plan in the Plan tab.</p>
            </div>
          ) : (tasks || []).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p className="empty-state-text">
                {selectedPlanId === 'today-tasks' 
                  ? "No standalone tasks for today. Add daily or one-time tasks in the Tasks tab."
                  : "No active tasks in this plan. Add tasks in the Plan tab to start executing."
                }
              </p>
            </div>
          ) : selectedPlanId === 'today-tasks' ? (
            // Today's Standalone Tasks with 80/20 Pareto division
            (() => {
              const sortedTodayTasks = sortTasks(tasks || []);
              const signalCount = Math.max(1, Math.ceil(sortedTodayTasks.length * 0.2));
              const signalTasks = sortedTodayTasks.slice(0, signalCount);
              const noiseTasks = sortedTodayTasks.slice(signalCount);

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Signal Tasks (Top 20%) */}
                  {signalTasks.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
                        <span style={{ fontSize: 13 }}>⚡</span>
                        <span className="font-syne font-bold text-glow-amber" style={{ fontSize: 13.5, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Signal Tasks (Must Do - Top 20%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {signalTasks.map(task => renderExecuteTaskItem(task, true, false))}
                      </div>
                    </div>
                  )}

                  {/* Noise Tasks (Bottom 80%) */}
                  {noiseTasks.length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
                        <span style={{ fontSize: 13 }}>💤</span>
                        <span className="font-syne font-bold" style={{ fontSize: 13.5, color: '#8B90A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Noise Tasks (Later - Bottom 80%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {noiseTasks.map(task => renderExecuteTaskItem(task, false, true))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            // Regular Plan Tasks
            <>
              {/* Uncategorized Tasks */}
              {uncategorizedTasks.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 4 }}>
                    <span style={{ fontSize: 13 }}>📦</span>
                    <span className="font-syne font-bold" style={{ fontSize: 13.5, color: '#8B90A0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Uncategorized
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {uncategorizedTasks.map(task => renderExecuteTaskItem(task))}
                  </div>
                </div>
              )}

              {/* Categorized Tasks */}
              {categories.map(category => {
                const categoryTasks = sortTasks((tasks || []).filter(t => t.categoryId === category.id));
                if (categoryTasks.length === 0) return null;
                return (
                  <div 
                    key={category.id}
                    className="glass"
                    style={{
                      borderRadius: 18,
                      padding: '16px 18px',
                      background: 'rgba(255, 255, 255, 0.015)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13 }}>📂</span>
                        <span className="font-syne font-bold" style={{ fontSize: 13.5, color: '#F0F2F7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {category.name}
                        </span>
                      </div>
                      <PriorityBadge priority={category.priority || 'p2'} showLabel={true} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {categoryTasks.map(task => renderExecuteTaskItem(task))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>


        {/* Session Setup Panel */}
        <AnimatePresence>
          {selectedTask && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="glass"
              style={{ borderRadius: 20, padding: 20, marginBottom: 20, border: '1px solid rgba(245,166,35,0.15)', background: 'rgba(245,166,35,0.01)' }}
            >
              <p className="section-label" style={{ marginBottom: 16 }}>Session Setup</p>

              {/* Duration Presets */}
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 10 }}>Work Duration</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {PRESETS.map(p => (
                  <button
                    key={p.value}
                    className={`btn ${workMinutes === p.value ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, height: 42, fontSize: 13 }}
                    onClick={() => setWorkMinutes(p.value)}
                  >
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <input
                  type="range"
                  className="slider"
                  min={5} max={240} step={5}
                  value={workMinutes}
                  onChange={e => setWorkMinutes(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  className="input"
                  min={5} max={240}
                  value={workMinutes}
                  onChange={e => {
                    let v = Number(e.target.value);
                    if (v > 240) v = 240;
                    setWorkMinutes(v);
                  }}
                  style={{ width: 75, padding: '8px 10px', fontSize: 13, textAlign: 'center', flexShrink: 0 }}
                />
              </div>
              <p className="font-dm" style={{ color: '#F5A623', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
                {workMinutes} minutes
              </p>

              {/* Break */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 8 }}>Break</p>
                  {!isCustomBreak ? (
                    <select
                      className="input"
                      style={{ padding: '10px 12px', fontSize: 13 }}
                      value={breakMinutes}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomBreak(true);
                          setBreakMinutes(10); // default custom
                        } else {
                          setBreakMinutes(Number(val));
                        }
                      }}
                    >
                      {[5, 10, 15, 20].map(v => <option key={v} value={v}>{v} min</option>)}
                      <option value="custom">Custom...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        className="input"
                        placeholder="min"
                        style={{ padding: '8px 10px', fontSize: 13, flex: 1 }}
                        value={breakMinutes}
                        min={1}
                        onChange={e => setBreakMinutes(Number(e.target.value))}
                      />
                      <button
                        className="btn btn-ghost"
                        style={{ width: 34, height: 38, padding: 0, fontSize: 12, flexShrink: 0 }}
                        onClick={() => {
                          setIsCustomBreak(false);
                          setBreakMinutes(10);
                        }}
                        title="Back to presets"
                      >
                        ↺
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 8 }}>Every</p>
                  {!isCustomInterval ? (
                    <select
                      className="input"
                      style={{ padding: '10px 12px', fontSize: 13 }}
                      value={breakInterval}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomInterval(true);
                          setBreakInterval(25); // default custom
                        } else {
                          setBreakInterval(Number(val));
                        }
                      }}
                    >
                      <option value={15}>15 min</option>
                      <option value={25}>25 min</option>
                      <option value={40}>40 min</option>
                      <option value={60}>60 min</option>
                      <option value={0}>Never</option>
                      <option value="custom">Custom...</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        className="input"
                        placeholder="min"
                        style={{ padding: '8px 10px', fontSize: 13, flex: 1 }}
                        value={breakInterval}
                        min={1}
                        onChange={e => setBreakInterval(Number(e.target.value))}
                      />
                      <button
                        className="btn btn-ghost"
                        style={{ width: 34, height: 38, padding: 0, fontSize: 12, flexShrink: 0 }}
                        onClick={() => {
                          setIsCustomInterval(false);
                          setBreakInterval(25);
                        }}
                        title="Back to presets"
                      >
                        ↺
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Intention */}
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 8 }}>Intention</p>
              <input
                className="input"
                placeholder="What will you accomplish this session?"
                value={intention}
                onChange={e => setIntention(e.target.value)}
                style={{ marginBottom: 16 }}
              />

              {/* Gemini Focus Coach */}
              {loadingCoach && (
                <div className="glass-sm" style={{ borderRadius: 12, padding: 14, marginBottom: 16 }}>
                  <div className="shimmer" style={{ height: 14, borderRadius: 6, marginBottom: 8 }} />
                  <div className="shimmer" style={{ height: 14, borderRadius: 6, width: '75%' }} />
                </div>
              )}
              {focusCoach && !loadingCoach && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-cyan"
                  style={{ borderRadius: 12, padding: 14, marginBottom: 16 }}
                >
                  <p className="font-dm" style={{ color: '#00C9FF', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', marginBottom: 6 }}>
                    ✨ GEMINI FOCUS COACH
                  </p>
                  <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, lineHeight: 1.6 }}>{focusCoach}</p>
                </motion.div>
              )}

              {/* Ambient Sound */}
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 10 }}>Ambient Sound</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {SOUNDS.map(s => (
                  <button
                    key={s.id}
                    className={`btn ${ambientSound === s.id ? 'btn-primary glow-amber-sm' : 'btn-ghost'}`}
                    style={{
                      padding: '8px 14px',
                      fontSize: 12,
                      borderRadius: 12,
                      background: ambientSound === s.id ? undefined : 'rgba(255,255,255,0.02)',
                      borderColor: ambientSound === s.id ? undefined : 'rgba(255,255,255,0.04)',
                      transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                    }}
                    onClick={() => setAmbientSound(s.id)}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>

              <button
                id="start-session-btn"
                className="btn btn-primary"
                style={{ width: '100%', height: 52, fontSize: 16, borderRadius: 14 }}
                onClick={handleStartSession}
              >
                ⚡ Start Executing
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ACTIVE SESSION
  if (sessionState === 'active' || sessionState === 'break') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '24px 20px 20px', position: 'relative' }}>
        {/* Task + Intention */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', textAlign: 'center' }}>
          <PriorityBadge priority={selectedTask?.priority || 'p2'} />
          <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7', marginTop: 8, marginBottom: 4 }}>
            {sessionState === 'break' ? '🌿 Rest Break' : (selectedTask?.title || 'Focus Session')}
          </h3>
          {intention && sessionState !== 'break' && (
            <p className="font-dm" style={{ color: '#4B5060', fontSize: 13 }}>"{intention}"</p>
          )}
          {sessionState === 'break' && (
            <p className="font-dm" style={{ color: '#10B981', fontSize: 13, fontWeight: 500 }}>Recharging your brain...</p>
          )}
        </motion.div>

        {/* Circular Timer */}
        <CircularTimer
          progress={progress}
          timeDisplay={formatTime(secondsLeft)}
          isRunning={isRunning && !isPaused}
        />

        {/* Sound Selector */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
          {SOUNDS.map(s => (
            <button
              key={s.id}
              className={`btn ${ambientSound === s.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                fontSize: 14,
                padding: 0,
                background: ambientSound === s.id ? undefined : 'rgba(255,255,255,0.02)',
                borderColor: ambientSound === s.id ? undefined : 'rgba(255,255,255,0.04)',
                boxShadow: ambientSound === s.id ? '0 0 10px rgba(245,166,35,0.3)' : 'none',
              }}
              onClick={() => setAmbientSound(s.id)}
              title={s.label}
            >
              {s.icon}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginTop: 8 }}>
          {sessionState === 'break' ? (
            <button
              className="btn btn-primary"
              style={{ width: '100%', height: 50, fontSize: 14, borderRadius: 14 }}
              onClick={handleSkipBreakInSession}
            >
              ⏩ Skip Break & Resume Task
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                {isPaused ? (
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, height: 50, fontSize: 14, borderRadius: 14 }}
                    onClick={resume}
                  >
                    ▶ Resume
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, height: 50, fontSize: 14, borderRadius: 14 }}
                    onClick={() => setShowExitPopup(true)}
                  >
                    ⏸ Pause / Options
                  </button>
                )}
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1, height: 50, fontSize: 14, borderRadius: 14, color: '#00C9FF', borderColor: 'rgba(0,201,255,0.25)' }}
                  onClick={() => setExtendedSeconds(prev => prev + 300)}
                >
                  ➕ +5 Min
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ flex: 1, height: 50, fontSize: 14, borderRadius: 14, color: '#F5A623', borderColor: 'rgba(245,166,35,0.25)' }}
                  onClick={handleEndSession}
                >
                  ✓ Done
                </button>
              </div>

              {/* Manual Break Trigger */}
              <div style={{ width: '100%', marginTop: 4 }}>
                <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12, marginBottom: 6, textAlign: 'center', fontWeight: 500 }}>☕ Take a Break Now</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                  {[2, 5, 10, 20, 40, 60].map(mins => (
                    <button
                      key={mins}
                      className="btn btn-ghost"
                      style={{
                        height: 32,
                        padding: 0,
                        fontSize: 11,
                        borderRadius: 8,
                        borderColor: 'rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.01)'
                      }}
                      onClick={() => triggerBreak(mins)}
                    >
                      {mins === 60 ? '1h' : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Notes Toggle */}
        <button
          className="btn btn-ghost"
          style={{ width: '100%', height: 42, fontSize: 13, marginTop: 6 }}
          onClick={() => setShowNotes(!showNotes)}
        >
          📓 {showNotes ? 'Hide' : 'Session'} Notes
        </button>

        <AnimatePresence>
          {showNotes && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ width: '100%', overflow: 'hidden' }}
            >
              <textarea
                className="input"
                style={{ marginTop: 8, minHeight: 80 }}
                placeholder="Jot thoughts, blockers, ideas..."
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Brain Dump Input */}
        <div style={{ width: '100%', marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              🧠 Brain Dump
            </label>
            {brainDumpLogged && (
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ color: '#10B981', fontSize: 11, fontWeight: 600 }}
              >
                Saved to Inbox!
              </motion.span>
            )}
          </div>
          <input
            type="text"
            className="input"
            style={{ height: 42, fontSize: 13, background: 'rgba(255,255,255,0.02)' }}
            placeholder="Distraction? Jot it down to clear your head..."
            value={brainDumpText}
            onChange={e => setBrainDumpText(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && brainDumpText.trim()) {
                await addToInbox(brainDumpText.trim());
                setBrainDumpText('');
                setBrainDumpLogged(true);
                setTimeout(() => setBrainDumpLogged(false), 2000);
              }
            }}
          />
        </div>

        {/* Break Overlay */}
        <AnimatePresence>
          {showBreakOverlay && (
            <>
              <motion.div
                className="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ zIndex: 45 }}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="glass-dark"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 20,
                  right: 20,
                  transform: 'translateY(-50%)',
                  borderRadius: 24,
                  padding: 28,
                  zIndex: 50,
                  textAlign: 'center',
                  border: '1px solid rgba(245,166,35,0.15)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(245,166,35,0.1)',
                }}
              >
                <p style={{ fontSize: 36, marginBottom: 12, filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.3))' }}>🌿</p>
                <h3 className="font-syne font-bold text-glow-amber" style={{ fontSize: 20, color: '#F0F2F7', marginBottom: 8 }}>Break Time!</h3>
                <p className="font-dm" style={{ color: '#8B90A0', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                  You've been at it for a while. Take a breath and step away. Your brain will thank you.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, height: 46 }} onClick={handleBreakSkip}>Skip</button>
                  <button className="btn btn-primary" style={{ flex: 2, height: 46 }} onClick={handleBreakTake}>Take {breakMinutes}m Break</button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Exit Confirmation Modal */}
        <AnimatePresence>
          {showExitPopup && (
            <>
              <motion.div
                className="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowExitPopup(false);
                  setPendingTab(null);
                }}
                style={{ zIndex: 90 }}
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className="glass-dark"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 20,
                  right: 20,
                  transform: 'translateY(-50%)',
                  borderRadius: 24,
                  padding: 28,
                  zIndex: 100,
                  textAlign: 'center',
                  border: '1px solid rgba(245,166,35,0.15)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 30px rgba(245,166,35,0.1)',
                }}
              >
                <p style={{ fontSize: 36, marginBottom: 12 }}>⚠️</p>
                <h3 className="font-syne font-bold text-glow-amber" style={{ fontSize: 20, color: '#F0F2F7', marginBottom: 8 }}>
                  Focus Session Active
                </h3>
                <p className="font-dm" style={{ color: '#8B90A0', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
                  You are in the middle of executing a task. What would you like to do?
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    className="btn btn-primary"
                    style={{ height: 46 }}
                    onClick={() => {
                      setShowExitPopup(false);
                      const dest = pendingTab;
                      setPendingTab(null);
                      if (dest) setActiveTab(dest);
                      if (isPaused) resume();
                    }}
                  >
                    ▶ Run in Background
                  </button>

                  <button
                    className="btn btn-ghost"
                    style={{ height: 46 }}
                    onClick={() => {
                      pause();
                      setShowExitPopup(false);
                      const dest = pendingTab;
                      setPendingTab(null);
                      if (dest) setActiveTab(dest);
                    }}
                  >
                    ⏸ Pause & Keep Session
                  </button>

                  {/* Take a break panel */}
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 12, background: 'rgba(255,255,255,0.01)' }}>
                    <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 10, fontWeight: 500 }}>☕ Take a Break Instead</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                      {[2, 5, 10, 20, 40, 60].map(mins => (
                        <button
                          key={mins}
                          type="button"
                          className="btn btn-ghost"
                          style={{
                            height: 32,
                            padding: 0,
                            fontSize: 11,
                            borderRadius: 8,
                            borderColor: 'rgba(16,185,129,0.3)',
                            color: '#10B981',
                            background: 'rgba(16,185,129,0.02)'
                          }}
                          onClick={() => {
                            triggerBreak(mins);
                            setShowExitPopup(false);
                            const dest = pendingTab;
                            setPendingTab(null);
                            if (dest) setActiveTab(dest);
                          }}
                        >
                          {mins === 60 ? '1h Break' : `${mins}m Break`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    className="btn btn-ghost"
                    style={{ height: 46, color: '#EF4444', borderColor: 'rgba(239,68,68,0.2)' }}
                    onClick={() => {
                      reset();
                      setSessionState('idle');
                      setSelectedTask(null);
                      setIntention('');
                      setSessionNotes('');
                      setBreaksTaken(0);
                      const destination = pendingTab || 'execute';
                      setShowExitPopup(false);
                      setPendingTab(null);
                      setActiveTab(destination);
                    }}
                  >
                    🛑 Close completely (Cancel)
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // COMPLETE STATE
  if (sessionState === 'complete') {
    return (
      <div className="scrollable" style={{ flex: 1, padding: '24px 20px' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h2 className="font-syne font-bold" style={{ fontSize: 22, color: '#F0F2F7', marginBottom: 6 }}>Session Complete!</h2>
            {completionMsg && (
              <p className="font-dm" style={{ color: '#F5A623', fontSize: 15, fontStyle: 'italic' }}>"{completionMsg}"</p>
            )}
          </div>

          <div className="glass" style={{ borderRadius: 20, padding: 20, marginBottom: 20 }}>
            <p className="section-label" style={{ marginBottom: 16 }}>How much did you complete?</p>
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <span className="font-syne font-black" style={{ fontSize: 40, color: '#F5A623' }}>{progressSlider}%</span>
            </div>
            <input
              type="range"
              className="slider"
              min={0} max={100} step={10}
              value={progressSlider}
              onChange={e => setProgressSlider(Number(e.target.value))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span className="font-dm" style={{ color: '#4B5060', fontSize: 11 }}>0%</span>
              <span className="font-dm" style={{ color: '#4B5060', fontSize: 11 }}>100%</span>
            </div>
          </div>

          <button
            id="complete-session-btn"
            className="btn btn-primary"
            style={{ width: '100%', height: 52, fontSize: 16, borderRadius: 14 }}
            onClick={handleCompleteSession}
          >
            {progressSlider >= 100 ? '🏆 Mark Complete & Celebrate!' : '✓ Save Progress'}
          </button>
        </motion.div>
      </div>
    );
  }
}
