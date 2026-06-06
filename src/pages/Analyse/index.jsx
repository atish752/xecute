import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema.js';
import { computeMomentumScore, getStreak, getHeatmapData, getVelocityData } from '../../db/queries/analytics.js';
import { getSessionStats } from '../../db/queries/sessions.js';
import { computePlanProgress } from '../../db/queries/plans.js';
import { getMilestones, getUnlockedMilestones } from '../../db/queries/milestones.js';
import { getWeeklyInsight, askXecute, generateWeeklyReviewSummary } from '../../ai/claude.js';
import { createWeeklyReview } from '../../db/queries/weeklyReviews.js';
import { format, isToday } from 'date-fns';
import ProgressRing from '../../components/common/ProgressRing.jsx';
import PriorityBadge from '../../components/common/PriorityBadge.jsx';

const AMBER = '#F5A623';
const CYAN = '#00C9FF';

// ─── Custom SVG Area Chart Component ──────────────────────────────────────────
function CustomSVGAreaChart({ data }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => d.completed), 1);
  const paddingLeft = 25;
  const paddingRight = 10;
  const paddingTop = 10;
  const paddingBottom = 20;

  const width = 350;
  const height = 90;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = data.map((d, index) => {
    const x = paddingLeft + (index / Math.max(data.length - 1, 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.completed / maxVal) * chartHeight;
    return { x, y, data: d };
  });

  let linePath = '';
  let areaPath = '';

  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  const showTooltip = hoveredPoint !== null;

  return (
    <div style={{ position: 'relative', width: '100%', height: 110 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="customAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={AMBER} stopOpacity={0.25} />
            <stop offset="100%" stopColor={AMBER} stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio, idx) => {
          const y = paddingTop + chartHeight * ratio;
          const val = Math.round(maxVal * (1 - ratio));
          return (
            <g key={idx}>
              <line 
                x1={paddingLeft} 
                y1={y} 
                x2={width - paddingRight} 
                y2={y} 
                stroke="rgba(255, 255, 255, 0.05)" 
                strokeDasharray="3 3" 
              />
              <text 
                x={paddingLeft - 6} 
                y={y + 3} 
                fill="#4B5060" 
                fontSize={8} 
                textAnchor="end"
                fontFamily="DM Sans, system-ui, sans-serif"
              >
                {val}
              </text>
            </g>
          );
        })}

        {areaPath && (
          <path 
            d={areaPath} 
            fill="url(#customAreaGrad)" 
          />
        )}

        {linePath && (
          <path 
            d={linePath} 
            fill="none" 
            stroke={AMBER} 
            strokeWidth={2} 
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((p, index) => {
          const isHovered = hoveredPoint?.index === index;
          return (
            <g key={index}>
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPoint({ ...p.data, x: p.x, y: p.y, index })}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {(isHovered || points.length <= 7) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 4.5 : 2}
                  fill={AMBER}
                  stroke={isHovered ? '#050608' : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  style={{ pointerEvents: 'none', transition: 'all 0.1s ease' }}
                />
              )}
            </g>
          );
        })}

        {points.filter((_, idx) => {
          if (points.length > 7) {
            return idx % 6 === 0 || idx === points.length - 1;
          }
          return true;
        }).map((p, idx) => (
          <text
            key={idx}
            x={p.x}
            y={height - 2}
            fill="#4B5060"
            fontSize={8}
            textAnchor="middle"
            fontFamily="DM Sans, system-ui, sans-serif"
          >
            {p.data.date}
          </text>
        ))}
      </svg>

      {showTooltip && (
        <div 
          className="glass-dark" 
          style={{ 
            position: 'absolute', 
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${(hoveredPoint.y / height) * 100 - 48}%`,
            transform: 'translateX(-50%)',
            borderRadius: 10, 
            padding: '6px 10px', 
            fontSize: 11,
            zIndex: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            border: '1px solid rgba(245,166,35,0.2)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <p className="font-dm" style={{ color: '#8B90A0', marginBottom: 2 }}>{hoveredPoint.date}</p>
          <p className="font-dm font-semibold" style={{ color: AMBER }}>Completed: {hoveredPoint.completed}</p>
        </div>
      )}
    </div>
  );
}

// ─── Momentum Score ────────────────────────────────────────────────────────────
function MomentumCard({ score }) {
  const color = score >= 75 ? AMBER : score >= 50 ? CYAN : '#EF4444';
  const label = score >= 75 ? 'On Fire 🔥' : score >= 50 ? 'Building 💪' : 'Getting Started ⚡';
  const glowClass = score >= 75 ? 'glow-amber' : score >= 50 ? 'glow-cyan' : '';
  return (
    <div className={`glass-amber ${glowClass}`} style={{ borderRadius: 20, padding: '20px 20px', marginBottom: 16, border: '1px solid rgba(245,166,35,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', justifyContent: 'space-between' }}>
        <div>
          <p className="section-label" style={{ marginBottom: 8, color: '#8B90A0' }}>Momentum Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="font-syne font-black text-glow-amber" style={{ fontSize: 56, color: AMBER, lineHeight: 1 }}>
              {score}
            </span>
            <span className="font-dm" style={{ color: '#8B90A0', fontSize: 14 }}>/100</span>
          </div>
          <p className="font-dm font-medium" style={{ color, fontSize: 14, marginTop: 6, letterSpacing: '0.02em' }}>{label}</p>
        </div>
        <ProgressRing progress={score} size={84} strokeWidth={8} color={color} />
      </div>
    </div>
  );
}

// ─── Today Dashboard ──────────────────────────────────────────────────────────
function TodayDashboard({ streak }) {
  const [todayStats, setTodayStats] = useState({ totalSessions: 0, totalMinutes: 0 });
  const todayStr = new Date().toISOString().split('T')[0];

  // Live queries for deep analytics
  const allTasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const todaySessions = useLiveQuery(async () => {
    const sessions = await db.sessions.toArray();
    return sessions.filter(s => s.startTime && s.startTime.startsWith(todayStr) && s.endTime !== null);
  }, [], []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    getSessionStats('today').then(setTodayStats);
  }, [todaySessions]); // refresh stats when sessions update

  // Priorities Completed Today
  const completedToday = (allTasks || []).filter(t => {
    if (t.taskType === 'daily') {
      return t.completedDates?.includes(todayStr);
    }
    return t.status === 'completed' && t.updatedAt?.startsWith(todayStr);
  });
  const p1Completed = completedToday.filter(t => t.priority === 'p1').length;
  const p2Completed = completedToday.filter(t => t.priority === 'p2').length;
  const p3Completed = completedToday.filter(t => t.priority === 'p3').length;

  // Focus Score Calculation (0-100)
  const totalMinutesToday = todayStats.totalMinutes || 0;
  const targetMinutes = 240; // Focus goal
  const durationScore = Math.min(1, totalMinutesToday / targetMinutes) * 40;
  
  const completedCount = completedToday.length;
  const taskCompletionScore = Math.min(1, completedCount / 3) * 30;

  const totalBreaks = todaySessions?.reduce((sum, s) => sum + (s.breaksTaken || 0), 0) || 0;
  const scheduledBreaks = todaySessions?.reduce((sum, s) => sum + (s.breaksScheduled || 0), 0) || 0;
  const breakScore = scheduledBreaks > 0 
    ? Math.min(1, totalBreaks / scheduledBreaks) * 30 
    : 30;

  const focusScore = Math.round(durationScore + taskCompletionScore + breakScore);

  let scoreLabel = 'Focus building...';
  let scoreColor = CYAN;
  if (focusScore >= 80) {
    scoreLabel = '🧘 Laser Focus Mode. Brilliant work!';
    scoreColor = AMBER;
  } else if (focusScore >= 50) {
    scoreLabel = '💪 Solid momentum today. Keep pushing!';
    scoreColor = '#10B981';
  } else if (focusScore > 0) {
    scoreLabel = '⚡ Getting started. Try a short focus block next.';
    scoreColor = CYAN;
  } else {
    scoreLabel = '💤 No focus blocks recorded yet. Ready to start?';
    scoreColor = '#8B90A0';
  }

  // Grouped task timeline sessions
  const groupedSessions = {};
  if (todaySessions && todaySessions.length > 0) {
    todaySessions.forEach(s => {
      const taskId = s.taskId || 'quick-focus';
      if (!groupedSessions[taskId]) {
        const matchingTask = allTasks?.find(t => t.id === s.taskId);
        groupedSessions[taskId] = {
          task: matchingTask || { 
            title: s.intentionText || 'Quick Focus Session', 
            priority: 'p2',
            taskType: 'one-time'
          },
          sessions: [],
          totalMinutes: 0
        };
      }
      groupedSessions[taskId].sessions.push(s);
      groupedSessions[taskId].totalMinutes += s.focusedMinutes || 0;
    });
  }

  const formatTimeStr = (isoString) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div>
      {/* Greeting */}
      <div className="glass" style={{ borderRadius: 20, padding: '18px 20px', marginBottom: 14, background: 'rgba(255,255,255,0.025)' }}>
        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 2 }}>{greeting},</p>
        <p className="font-syne font-bold" style={{ fontSize: 20, color: '#F0F2F7', letterSpacing: '-0.01em' }}>Let's execute.</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="glass" style={{ borderRadius: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.015)' }}>
          <p className="section-label" style={{ marginBottom: 6 }}>P1 Tasks</p>
          <p className="font-syne font-bold" style={{ fontSize: 28, color: p1Completed > 0 ? '#EF4444' : AMBER }}>
            {p1Completed}
          </p>
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12, marginTop: 2 }}>completed today</p>
        </div>
        <div className="glass" style={{ borderRadius: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.015)' }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Focus Time</p>
          <p className="font-syne font-bold text-glow-cyan" style={{ fontSize: 28, color: CYAN }}>
            {Math.round(todayStats.totalMinutes / 60 * 10) / 10}<span style={{ color: '#4B5060', fontSize: 18 }}>h</span>
          </p>
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12, marginTop: 2 }}>{todayStats.totalSessions} sessions</p>
        </div>
      </div>

      {/* Focus Score (Value-add feature!) */}
      <div className="glass-amber" style={{ borderRadius: 20, padding: 18, marginBottom: 14, border: '1px solid rgba(245,166,35,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p className="section-label" style={{ color: '#8B90A0', marginBottom: 4 }}>Daily Focus Score</p>
            <p className="font-syne font-black text-glow-amber" style={{ fontSize: 32, color: AMBER }}>{focusScore} <span style={{ fontSize: 16, color: '#8B90A0', fontWeight: 500 }}>/ 100</span></p>
          </div>
          <ProgressRing progress={focusScore} size={54} strokeWidth={5} color={scoreColor} />
        </div>
        <p className="font-dm" style={{ fontSize: 12.5, color: '#F0F2F7', lineHeight: 1.5 }}>
          {scoreLabel}
        </p>
      </div>

      {/* Priorities Completed Details */}
      <div className="glass" style={{ borderRadius: 20, padding: 16, marginBottom: 14, background: 'rgba(255,255,255,0.01)' }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Priorities Done Today</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 12, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
            <p className="font-syne font-bold" style={{ fontSize: 18, color: '#EF4444' }}>{p1Completed}</p>
            <p className="font-dm" style={{ fontSize: 11, color: '#fca5a5', marginTop: 2 }}>🔴 Critical</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="font-syne font-bold" style={{ fontSize: 18, color: '#F59E0B' }}>{p2Completed}</p>
            <p className="font-dm" style={{ fontSize: 11, color: '#fcd34d', marginTop: 2 }}>🟡 Important</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <p className="font-syne font-bold" style={{ fontSize: 18, color: '#10B981' }}>{p3Completed}</p>
            <p className="font-dm" style={{ fontSize: 11, color: '#86efac', marginTop: 2 }}>🟢 Nice-to-Have</p>
          </div>
        </div>
      </div>

      {/* Execution Timeline (Timing of executed tasks) */}
      <div className="glass" style={{ borderRadius: 20, padding: 16, marginBottom: 14, background: 'rgba(255,255,255,0.01)' }}>
        <p className="section-label" style={{ marginBottom: 12 }}>Today's Execution Timeline</p>
        {Object.keys(groupedSessions).length === 0 ? (
          <p className="font-dm" style={{ color: '#4B5060', fontSize: 12.5, textAlign: 'center', padding: '10px 0' }}>
            No task executions logged today.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.entries(groupedSessions).map(([taskId, group]) => (
              <div key={taskId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 12 }}>⚡</span>
                    <p className="font-dm font-semibold" style={{ fontSize: 13, color: '#F0F2F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {group.task.title}
                    </p>
                  </div>
                  <span className="font-syne font-bold" style={{ fontSize: 12, color: AMBER, flexShrink: 0 }}>
                    {group.totalMinutes}m spent
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <PriorityBadge priority={group.task.priority || 'p2'} showLabel={false} />
                  {!group.task.planId && (
                    <span className="chip" style={{ background: 'rgba(255,255,255,0.03)', color: '#8B90A0', fontSize: 9 }}>
                      {group.task.taskType === 'daily' ? '🔄 Daily' : '🎯 One-time'}
                    </span>
                  )}
                </div>

                {/* Session Slots */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 18 }}>
                  {group.sessions.map((s, idx) => (
                    <div key={s.id || idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8B90A0' }}>
                      <span className="font-dm">Session {idx + 1}: {formatTimeStr(s.startTime)} - {formatTimeStr(s.endTime)}</span>
                      <span className="font-dm" style={{ color: CYAN }}>{s.focusedMinutes}m</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Streak */}
      {streak > 0 && (
        <div className="glass-amber glow-amber-sm" style={{ borderRadius: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(245,166,35,0.18)' }}>
          <span className="flame" style={{ fontSize: 28, filter: 'drop-shadow(0 0 8px rgba(245,166,35,0.5))' }}>🔥</span>
          <div>
            <p className="font-syne font-bold text-glow-amber" style={{ color: AMBER, fontSize: 16, lineHeight: 1.2 }}>{streak}-Day Streak</p>
            <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12, marginTop: 2 }}>Keep it going. Do not break the chain.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan-Level Analytics Card ───────────────────────────────────────────────
function PlanAnalyticsCard() {
  const plans = useLiveQuery(() => db.plans.toArray(), [], []);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [spentMinutes, setSpentMinutes] = useState(0);
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);

  const selectedPlan = plans?.find(p => p.id === Number(selectedPlanId));

  useEffect(() => {
    if (!selectedPlanId) {
      setSpentMinutes(0);
      setCategories([]);
      setTasks([]);
      return;
    }
    
    const planId = Number(selectedPlanId);

    db.sessions.where('planId').equals(planId).toArray().then(sessList => {
      const sum = sessList.reduce((s, val) => s + (val.focusedMinutes || 0), 0);
      setSpentMinutes(sum);
    });

    db.categories.where('planId').equals(planId).toArray().then(setCategories);
    db.tasks.where('planId').equals(planId).toArray().then(setTasks);
  }, [selectedPlanId]);

  useEffect(() => {
    if (plans && plans.length > 0 && !selectedPlanId) {
      const firstActive = plans.find(p => p.status === 'active');
      if (firstActive) setSelectedPlanId(String(firstActive.id));
      else setSelectedPlanId(String(plans[0].id));
    }
  }, [plans, selectedPlanId]);

  if (!plans || plans.length === 0) {
    return (
      <div className="glass" style={{ borderRadius: 20, padding: 20, marginBottom: 14 }}>
        <p className="section-label" style={{ marginBottom: 8 }}>Plan Analytics</p>
        <p className="font-dm" style={{ color: '#4B5060', fontSize: 13 }}>No plans available. Go to the Plan tab to create one.</p>
      </div>
    );
  }

  const categoriesWithProgress = categories.map(cat => {
    const tasksInCat = tasks.filter(t => t.categoryId === cat.id);
    const avgProgress = tasksInCat.length 
      ? Math.round(tasksInCat.reduce((sum, t) => sum + (t.progress || 0), 0) / tasksInCat.length) 
      : 0;
    return { ...cat, calculatedProgress: avgProgress };
  });

  const p1Total = tasks.filter(t => t.priority === 'p1').length;
  const p1Done = tasks.filter(t => t.priority === 'p1' && t.status === 'completed').length;
  const p2Total = tasks.filter(t => t.priority === 'p2').length;
  const p2Done = tasks.filter(t => t.priority === 'p2' && t.status === 'completed').length;
  const p3Total = tasks.filter(t => t.priority === 'p3').length;
  const p3Done = tasks.filter(t => t.priority === 'p3' && t.status === 'completed').length;

  const budgetMinutes = selectedPlan?.timeBudgetMinutes || 0;
  const budgetHours = Math.round((budgetMinutes / 60) * 10) / 10;
  const spentHours = Math.round((spentMinutes / 60) * 10) / 10;
  const remainingHours = Math.round(((budgetMinutes - spentMinutes) / 60) * 10) / 10;
  const isOverBudget = spentMinutes > budgetMinutes && budgetMinutes > 0;
  const timeProgressPercent = budgetMinutes > 0 ? Math.min((spentMinutes / budgetMinutes) * 100, 100) : 0;

  const calculateETA = () => {
    if (!selectedPlan || tasks.length === 0) return 'N/A';
    const completed = tasks.filter(t => t.status === 'completed');
    const remaining = tasks.filter(t => t.status !== 'completed');
    if (remaining.length === 0) return 'Completed';

    const createdTime = new Date(selectedPlan.createdAt || Date.now()).getTime();
    const daysSinceStart = Math.max((Date.now() - createdTime) / (1000 * 60 * 60 * 24), 1);
    const tasksPerDay = completed.length / daysSinceStart;

    if (tasksPerDay <= 0) return 'Action required';

    const daysToComplete = remaining.length / tasksPerDay;
    const estDate = new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000);
    return format(estDate, 'MMM d, yyyy');
  };

  const predictedETA = calculateETA();

  return (
    <div className="glass" style={{ borderRadius: 20, padding: '18px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p className="section-label">Plan Analytics</p>
        <select
          className="input"
          style={{ width: 160, padding: '4px 8px', fontSize: 12, height: 32 }}
          value={selectedPlanId}
          onChange={e => setSelectedPlanId(e.target.value)}
        >
          {plans.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.status === 'active' ? 'Active' : 'Completed'})
            </option>
          ))}
        </select>
      </div>

      {selectedPlan && (
        <div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
            <ProgressRing
              progress={selectedPlan.overallProgress || 0}
              size={60}
              strokeWidth={5}
              color={selectedPlan.status === 'completed' ? CYAN : AMBER}
              label={`${selectedPlan.overallProgress || 0}%`}
            />
            <div>
              <h4 className="font-syne font-bold" style={{ fontSize: 15, color: '#F0F2F7', marginBottom: 2 }}>{selectedPlan.name}</h4>
              <p className="font-dm" style={{ fontSize: 11.5, color: '#8B90A0' }}>
                Horizon: <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{selectedPlan.category} Term</span>
              </p>
            </div>
          </div>

          {budgetMinutes > 0 ? (
            <div className="glass-sm" style={{ borderRadius: 14, padding: 12, marginBottom: 16, border: isOverBudget ? '1px solid rgba(239,68,68,0.3)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="font-dm font-semibold" style={{ fontSize: 12, color: '#F0F2F7' }}>Time Budget</span>
                <span className="font-dm font-bold" style={{ fontSize: 11, color: isOverBudget ? '#EF4444' : AMBER }}>
                  {spentHours}h spent / {budgetHours}h budget
                </span>
              </div>
              <div className="progress-track" style={{ height: 6, borderRadius: 3, overflow: 'hidden' }}>
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: `${timeProgressPercent}%`, 
                    background: isOverBudget ? '#EF4444' : AMBER 
                  }} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <span className="font-dm" style={{ fontSize: 11, color: isOverBudget ? '#EF4444' : '#8B90A0' }}>
                  {isOverBudget ? '⚠️ Budget Exceeded!' : `${remainingHours}h remaining`}
                </span>
                <span className="font-dm" style={{ fontSize: 10.5, color: '#8B90A0' }}>
                  ETA: <span style={{ color: CYAN, fontWeight: 600 }}>{predictedETA}</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="glass-sm" style={{ borderRadius: 14, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-dm" style={{ fontSize: 11, color: '#8B90A0' }}>Time Spent (No Budget Set):</span>
              <span className="font-dm font-bold" style={{ fontSize: 12, color: CYAN }}>{spentHours} hours</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: '🔴 P1', done: p1Done, total: p1Total, color: '#EF4444' },
              { label: '🟡 P2', done: p2Done, total: p2Total, color: '#F59E0B' },
              { label: '🟢 P3', done: p3Done, total: p3Total, color: '#10B981' }
            ].map(p => (
              <div key={p.label} className="glass-sm" style={{ padding: '6px 10px', borderRadius: 10, textAlign: 'center' }}>
                <span style={{ fontSize: 10, color: p.color, fontWeight: 700, display: 'block', marginBottom: 2 }}>{p.label}</span>
                <span className="font-dm font-bold" style={{ fontSize: 12, color: '#F0F2F7' }}>{p.done}/{p.total}</span>
              </div>
            ))}
          </div>

          {categoriesWithProgress.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="font-dm font-bold" style={{ fontSize: 11, color: '#8B90A0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Categories</p>
              {categoriesWithProgress.map(cat => (
                <div key={cat.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span className="font-dm" style={{ fontSize: 12, color: '#F0F2F7' }}>{cat.name}</span>
                    <span className="font-dm font-semibold" style={{ fontSize: 11, color: CYAN }}>{cat.calculatedProgress}%</span>
                  </div>
                  <div className="progress-track" style={{ height: 3 }}>
                    <div className="progress-fill" style={{ width: `${cat.calculatedProgress}%`, background: CYAN }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Guided Weekly Review Mode ───────────────────────────────────────────────
function WeeklyReviewMode({ onComplete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [wentWell, setWentWell] = useState('');
  const [obstacles, setObstacles] = useState('');
  const [nextWeekFocus, setNextWeekFocus] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [momentum, setMomentum] = useState(0);

  const startReview = () => {
    setWentWell('');
    setObstacles('');
    setNextWeekFocus('');
    setStep(1);
    setIsOpen(true);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(s => s + 1);
    } else if (step === 3) {
      setStep(4);
      runAssessment();
    }
  };

  const runAssessment = async () => {
    setLoadingSummary(true);
    try {
      const score = await computeMomentumScore();
      setMomentum(score);

      const stats = await getSessionStats('week');
      const inputStats = {
        focusedMinutes: stats.totalMinutes || 0,
        sessionsCount: stats.totalSessions || 0,
        momentumScore: score
      };

      const summary = await generateWeeklyReviewSummary(wentWell, obstacles, nextWeekFocus, inputStats);
      const summaryText = summary || "Solid execution this week. Make sure to schedule breaks intentionally to balance focus efficiency and cognitive recovery next week.";
      setAiSummary(summaryText);

      await createWeeklyReview({
        weekStartDate: new Date().toISOString(),
        wentWell,
        obstacles,
        nextWeekFocus,
        claudeSummary: summaryText,
        momentumScore: score
      });

      if (onComplete) onComplete();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <>
      <div 
        className="glass-amber glow-amber-sm card-hover" 
        style={{ 
          borderRadius: 20, 
          padding: '16px 20px', 
          marginBottom: 14, 
          border: '1px solid rgba(245,166,35,0.22)',
          cursor: 'pointer' 
        }}
        onClick={startReview}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>📋</span>
            <div>
              <h4 className="font-syne font-bold text-glow-amber" style={{ color: AMBER, fontSize: 16 }}>Weekly Focus Review</h4>
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12, marginTop: 2 }}>Evaluate execution & calibrate for next week.</p>
            </div>
          </div>
          <span style={{ color: AMBER, fontSize: 20 }}>→</span>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.95)', padding: 20,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              className="glass"
              style={{
                borderRadius: 28, 
                padding: '24px 20px', 
                width: '100%', 
                maxWidth: 400,
                border: '1px solid rgba(255,255,255,0.08)',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span className="font-syne font-black" style={{ color: AMBER, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Weekly Review • Step {step}/4
                </span>
                {step < 4 && (
                  <button className="btn btn-ghost" style={{ width: 28, height: 28, padding: 0, borderRadius: '50%' }} onClick={() => setIsOpen(false)}>×</button>
                )}
              </div>

              <div style={{ flex: 1, minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {step === 1 && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    <h3 className="font-syne font-bold" style={{ fontSize: 17, color: '#F0F2F7', marginBottom: 12 }}>What went well this week?</h3>
                    <textarea
                      className="textarea"
                      placeholder="List your highlights, completed plans, focus breakthroughs..."
                      value={wentWell}
                      onChange={e => setWentWell(e.target.value)}
                      style={{ minHeight: 110, width: '100%', resize: 'none', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: '#F0F2F7', outline: 'none' }}
                    />
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    <h3 className="font-syne font-bold" style={{ fontSize: 17, color: '#F0F2F7', marginBottom: 12 }}>What obstacles did you face?</h3>
                    <textarea
                      className="textarea"
                      placeholder="Procrastination, scope creep, technical blockages, distractions..."
                      value={obstacles}
                      onChange={e => setObstacles(e.target.value)}
                      style={{ minHeight: 110, width: '100%', resize: 'none', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: '#F0F2F7', outline: 'none' }}
                    />
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
                    <h3 className="font-syne font-bold" style={{ fontSize: 17, color: '#F0F2F7', marginBottom: 12 }}>What is your main focus for next week?</h3>
                    <textarea
                      className="textarea"
                      placeholder="Specify your absolute priority or next P1 milestones..."
                      value={nextWeekFocus}
                      onChange={e => setNextWeekFocus(e.target.value)}
                      style={{ minHeight: 110, width: '100%', resize: 'none', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, color: '#F0F2F7', outline: 'none' }}
                    />
                  </motion.div>
                )}

                {step === 4 && (
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    {loadingSummary ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                        <div style={{ position: 'relative', width: 50, height: 50 }}>
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                            style={{
                              width: '100%', height: '100%',
                              borderRadius: '50%',
                              border: '3px solid rgba(245,166,35,0.1)',
                              borderTopColor: AMBER,
                            }}
                          />
                        </div>
                        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13 }}>Tuning Gemini productivity analytics...</p>
                      </div>
                    ) : (
                      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, alignItems: 'center', marginBottom: 16 }}>
                          <div style={{ textAlign: 'left' }}>
                            <p className="section-label" style={{ fontSize: 10 }}>MOMENTUM</p>
                            <h3 className="font-syne font-black text-glow-amber" style={{ fontSize: 36, color: AMBER, lineHeight: 1 }}>{momentum}</h3>
                          </div>
                          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.08)' }} />
                          <div style={{ textAlign: 'left' }}>
                            <p className="section-label" style={{ fontSize: 10, color: CYAN }}>STATUS</p>
                            <p className="font-dm font-bold" style={{ color: CYAN, fontSize: 14 }}>Ritual Complete</p>
                          </div>
                        </div>
                        
                        <div className="glass-cyan" style={{ borderRadius: 16, padding: 14, textAlign: 'left', border: '1px solid rgba(0,201,255,0.18)', marginBottom: 20 }}>
                          <p className="font-dm font-bold" style={{ color: CYAN, fontSize: 11, letterSpacing: '0.05em', marginBottom: 4 }}>MENTOR INSIGHT</p>
                          <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 12.5, lineHeight: 1.5 }}>{aiSummary}</p>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                {step < 4 ? (
                  <>
                    {step > 1 && (
                      <button className="btn btn-ghost" style={{ flex: 1, height: 44, borderRadius: 12 }} onClick={() => setStep(s => s - 1)}>
                        Back
                      </button>
                    )}
                    <button className="btn btn-primary" style={{ flex: 2, height: 44, borderRadius: 12 }} onClick={handleNext}>
                      {step === 3 ? 'Analyze →' : 'Continue'}
                    </button>
                  </>
                ) : (
                  !loadingSummary && (
                    <button className="btn btn-primary" style={{ width: '100%', height: 46, borderRadius: 12 }} onClick={() => setIsOpen(false)}>
                      Done
                    </button>
                  )
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Collapsible Review History Logs ──────────────────────────────────────────
function WeeklyReviewHistory({ refreshTrigger }) {
  const reviews = useLiveQuery(() => db.weeklyReviews.orderBy('weekStartDate').reverse().toArray(), [refreshTrigger], []);
  const [expandedId, setExpandedId] = useState(null);

  if (!reviews || reviews.length === 0) return null;

  return (
    <div className="glass" style={{ borderRadius: 20, padding: '18px 16px', marginBottom: 14 }}>
      <p className="section-label" style={{ marginBottom: 12 }}>Review History Logs</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reviews.map(rev => {
          const isExpanded = expandedId === rev.id;
          const formattedDate = format(new Date(rev.weekStartDate), 'MMMM d, yyyy');

          return (
            <div key={rev.id} className="glass-sm" style={{ borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : rev.id)}
              >
                <div>
                  <p className="font-dm font-bold" style={{ color: '#F0F2F7', fontSize: 13.5 }}>{formattedDate}</p>
                  <p className="font-dm" style={{ color: '#8B90A0', fontSize: 11.5, marginTop: 2 }}>
                    Momentum Score: <span style={{ color: AMBER, fontWeight: 700 }}>{rev.momentumScore}</span>
                  </p>
                </div>
                <span style={{ color: '#8B90A0', fontSize: 11 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ overflow: 'hidden', marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <span style={{ fontSize: 10, color: AMBER, fontWeight: 700, display: 'block' }}>WHAT WENT WELL</span>
                        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12.5, marginTop: 2 }}>{rev.wentWell || 'None'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: '#EF4444', fontWeight: 700, display: 'block' }}>OBSTACLES FACED</span>
                        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12.5, marginTop: 2 }}>{rev.obstacles || 'None'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: 10, color: CYAN, fontWeight: 700, display: 'block' }}>NEXT WEEK'S FOCUS</span>
                        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 12.5, marginTop: 2 }}>{rev.nextWeekFocus || 'None'}</p>
                      </div>
                      <div className="glass-sm" style={{ padding: 10, borderRadius: 10, background: 'rgba(0,201,255,0.02)', border: '1px solid rgba(0,201,255,0.1)' }}>
                        <span style={{ fontSize: 9, color: CYAN, fontWeight: 700, display: 'block', letterSpacing: '0.05em' }}>AI INSIGHT SUMMARY</span>
                        <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{rev.claudeSummary}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Session Analytics ─────────────────────────────────────────────────────────
function SessionAnalytics() {
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState({ totalSessions: 0, totalMinutes: 0, avgLength: 0, breakCompliance: 0 });
  const [velocityData, setVelocityData] = useState([]);

  useEffect(() => {
    getSessionStats(period).then(setStats);
    getVelocityData(null, period === 'week' ? 7 : period === 'month' ? 30 : 1).then(setVelocityData);
  }, [period]);

  const periods = ['today', 'week', 'month', 'all'];

  return (
    <div className="glass" style={{ borderRadius: 20, padding: '18px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p className="section-label">Focus Sessions</p>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 10 }}>
          {periods.map(p => (
            <button
              key={p}
              className={`btn`}
              style={{
                height: 26,
                padding: '0 10px',
                fontSize: 10,
                borderRadius: 8,
                background: period === p ? 'linear-gradient(135deg, #F5A623 0%, #D48C11 100%)' : 'transparent',
                color: period === p ? '#050608' : '#8B90A0',
                fontWeight: period === p ? 600 : 500,
                boxShadow: period === p ? '0 2px 8px rgba(245,166,35,0.2)' : 'none',
              }}
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Time', value: `${Math.round(stats.totalMinutes / 60 * 10) / 10}h`, color: AMBER },
          { label: 'Sessions', value: stats.totalSessions, color: CYAN },
          { label: 'Avg Session', value: `${stats.avgLength}m`, color: '#10B981' },
          { label: 'Break Score', value: `${stats.breakCompliance}%`, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="glass-sm" style={{ borderRadius: 12, padding: '12px 14px' }}>
            <p className="section-label" style={{ marginBottom: 4, color: '#4B5060' }}>{s.label}</p>
            <p className="font-syne font-bold" style={{ fontSize: 22, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {velocityData.length > 0 && (
        <div style={{ height: 110, marginTop: 8, paddingRight: 8 }}>
          <CustomSVGAreaChart data={velocityData} />
        </div>
      )}
    </div>
  );
}

// ─── AI Insights Panel ────────────────────────────────────────────────────────
function AIInsights({ streak }) {
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    const stats = await getSessionStats('week');
    const p1Tasks = await db.tasks.where('priority').equals('p1').toArray();
    const p1Rate = p1Tasks.length ? Math.round((p1Tasks.filter(t => t.status === 'completed').length / p1Tasks.length) * 100) : 0;
    const result = await getWeeklyInsight({ ...stats, streak, p1Rate });
    setInsights(result);
    setLoadingInsights(false);
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoadingAnswer(true);
    const allSessions = await db.sessions.toArray();
    const allTasks = await db.tasks.toArray();
    const context = {
      totalSessions: allSessions.length,
      streak,
      p1Tasks: allTasks.filter(t => t.priority === 'p1').length,
      completedTasks: allTasks.filter(t => t.status === 'completed').length,
    };
    const res = await askXecute(question, context);
    setAnswer(res || 'No data available. Keep executing and try again!');
    setLoadingAnswer(false);
  };

  return (
    <div className="glass-cyan" style={{ borderRadius: 20, padding: '18px 16px', marginBottom: 14 }}>
      <p className="section-label" style={{ color: CYAN, marginBottom: 14 }}>✨ AI Insights</p>

      {!insights ? (
        <button
          className="btn"
          style={{
            width: '100%',
            height: 46,
            fontSize: 14,
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(0,201,255,0.08) 0%, rgba(0,201,255,0.03) 100%)',
            color: CYAN,
            border: '1px solid rgba(0,201,255,0.22)',
            boxShadow: '0 4px 15px rgba(0,201,255,0.05)',
            fontWeight: 600
          }}
          onClick={handleGenerateInsights}
          disabled={loadingInsights}
        >
          {loadingInsights ? '🤖 Analyzing your week...' : '🔍 Generate Weekly Insights'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {insights.map((insight, i) => (
            <div key={i} className="glass-sm" style={{ borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, border: '1px solid rgba(255,255,255,0.03)' }}>
              <span style={{ color: CYAN, fontSize: 18, flexShrink: 0 }}>{'💡⚡🎯'[i]}</span>
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, lineHeight: 1.5 }}>{insight}</p>
            </div>
          ))}
        </div>
      )}

      <div className="divider" style={{ marginTop: 16, marginBottom: 16, background: 'rgba(0,201,255,0.08)' }} />

      <p className="font-dm font-semibold" style={{ color: '#F0F2F7', fontSize: 14, marginBottom: 10 }}>Ask Xecute</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: answer ? 12 : 0 }}>
        <input
          className="input"
          placeholder="How am I doing on my P1 tasks?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAsk()}
          style={{ flex: 1, padding: '10px 14px', fontSize: 13, borderColor: 'rgba(0,201,255,0.1)' }}
        />
        <button
          className="btn"
          style={{
            height: 42,
            padding: '0 16px',
            borderRadius: 12,
            fontSize: 14,
            background: 'linear-gradient(135deg, #00C9FF 0%, #0099C4 100%)',
            color: '#050608',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,201,255,0.2)',
          }}
          onClick={handleAsk}
          disabled={loadingAnswer}
        >
          {loadingAnswer ? '🤖' : '→'}
        </button>
      </div>
      {answer && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-sm" style={{ borderRadius: 12, padding: '12px 14px', marginTop: 12, border: '1px solid rgba(0,201,255,0.15)' }}>
          <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 13, lineHeight: 1.6 }}>{answer}</p>
        </motion.div>
      )}
    </div>
  );
}

// ─── Milestones ────────────────────────────────────────────────────────────────
function MilestonesSection() {
  const allDefs = getMilestones();
  const unlocked = useLiveQuery(() => getUnlockedMilestones(), [], []);
  const unlockedTypes = new Set(unlocked?.map(m => m.type) || []);

  return (
    <div className="glass" style={{ borderRadius: 20, padding: '18px 16px', marginBottom: 14 }}>
      <p className="section-label" style={{ marginBottom: 14 }}>Milestones</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {allDefs.map(m => {
          const isUnlocked = unlockedTypes.has(m.type);
          return (
            <div
              key={m.type}
              title={m.desc}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: isUnlocked ? 1 : 0.25,
                filter: isUnlocked ? 'none' : 'grayscale(1)',
              }}
            >
              <div style={{
                width: 46, height: 46, borderRadius: 14,
                background: isUnlocked ? 'rgba(245,166,35,0.12)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isUnlocked ? 'rgba(245,166,35,0.35)' : 'rgba(255,255,255,0.04)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
                boxShadow: isUnlocked ? '0 0 12px rgba(245,166,35,0.15), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
              }}>
                {m.icon}
              </div>
              <span className="font-dm" style={{ fontSize: 9, color: isUnlocked ? '#8B90A0' : '#4B5060', textAlign: 'center', lineHeight: 1.2 }}>{m.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Analyse Tab ─────────────────────────────────────────────────────────
export default function AnalyseTab() {
  const [momentum, setMomentum] = useState(0);
  const [streak, setStreak] = useState(0);
  const [reviewRefreshTrigger, setReviewRefreshTrigger] = useState(0);

  useEffect(() => {
    computeMomentumScore().then(setMomentum);
    getStreak().then(setStreak);
  }, [reviewRefreshTrigger]);

  const handleReviewComplete = () => {
    setReviewRefreshTrigger(t => t + 1);
    computeMomentumScore().then(setMomentum);
  };

  return (
    <div className="scrollable" style={{ flex: 1, padding: '16px 16px 16px' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <TodayDashboard streak={streak} />
        <div style={{ height: 14 }} />

        {/* Guided Weekly Review Banner & Modal */}
        <WeeklyReviewMode onComplete={handleReviewComplete} />
        <div style={{ height: 4 }} />

        <MomentumCard score={momentum} />

        {/* Selected Plan Analytics (Spent vs Budget, category completion) */}
        <PlanAnalyticsCard />

        <SessionAnalytics />
        <AIInsights streak={streak} />
        <MilestonesSection />

        {/* Weekly Review Logs */}
        <WeeklyReviewHistory refreshTrigger={reviewRefreshTrigger} />
      </motion.div>
    </div>
  );
}
