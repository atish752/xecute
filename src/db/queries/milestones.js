import { db } from '../schema.js';

const ALL_MILESTONES = [
  { type: 'first_plan', label: 'First Plan', icon: '🎯', desc: 'Created your first plan' },
  { type: 'first_session', label: 'First Session', icon: '⚡', desc: 'Completed your first focus session' },
  { type: 'streak_7', label: '7-Day Streak', icon: '🔥', desc: '7 consecutive days of execution' },
  { type: 'streak_30', label: '30-Day Streak', icon: '🏆', desc: '30 consecutive days of execution' },
  { type: 'hours_10', label: '10 Hours', icon: '⏱️', desc: '10 total focused hours' },
  { type: 'hours_100', label: '100 Hours', icon: '💯', desc: '100 total focused hours' },
  { type: 'tasks_10', label: '10 Tasks', icon: '✅', desc: '10 tasks completed' },
  { type: 'tasks_100', label: '100 Tasks', icon: '🚀', desc: '100 tasks completed' },
  { type: 'plan_complete', label: 'Plan Complete', icon: '🎉', desc: 'Completed an entire plan' },
  { type: 'momentum_90', label: 'Peak Performer', icon: '⚡', desc: 'Momentum score above 90' },
];

export const getMilestones = () => ALL_MILESTONES;

export const getUnlockedMilestones = () => db.milestones.toArray();

export const unlockMilestone = async (type) => {
  const existing = await db.milestones.where('type').equals(type).first();
  if (existing) return;
  await db.milestones.add({ type, unlockedAt: new Date().toISOString() });
};

export const checkAndUnlockMilestones = async () => {
  const sessions = await db.sessions.where('endTime').notEqual('').toArray();
  const tasks = await db.tasks.toArray();
  const plans = await db.plans.toArray();
  const totalMinutes = sessions.reduce((s, x) => s + (x.focusedMinutes || 0), 0);
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const completedPlans = plans.filter(p => p.status === 'completed').length;

  if (plans.length >= 1) await unlockMilestone('first_plan');
  if (sessions.length >= 1) await unlockMilestone('first_session');
  if (totalMinutes >= 600) await unlockMilestone('hours_10');
  if (totalMinutes >= 6000) await unlockMilestone('hours_100');
  if (completedTasks >= 10) await unlockMilestone('tasks_10');
  if (completedTasks >= 100) await unlockMilestone('tasks_100');
  if (completedPlans >= 1) await unlockMilestone('plan_complete');
};
