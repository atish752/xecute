import { db } from '../schema.js';
import { subDays, startOfDay, endOfDay, format, getHours } from 'date-fns';

export const computeMomentumScore = async () => {
  const allSessions = await db.sessions.toArray();
  const tasks = await db.tasks.toArray();
  const today = new Date();

  // Streak (30%)
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = subDays(today, i);
    const start = startOfDay(day).toISOString();
    const end = endOfDay(day).toISOString();
    const daySessions = allSessions.filter(s => s.startTime >= start && s.startTime <= end && s.endTime);
    if (daySessions.length > 0) streak++;
    else if (i > 0) break;
  }
  const streakScore = Math.min(streak / 14, 1) * 30;

  // Session consistency last 7 days (25%)
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const day = subDays(today, i);
    const start = startOfDay(day).toISOString();
    const end = endOfDay(day).toISOString();
    const daySessions = allSessions.filter(s => s.startTime >= start && s.startTime <= end && s.endTime);
    if (daySessions.length > 0) activeDays++;
  }
  const consistencyScore = (activeDays / 7) * 25;

  // P1 completion rate (25%)
  const p1Tasks = tasks.filter(t => t.priority === 'p1');
  const p1Done = p1Tasks.filter(t => t.status === 'completed').length;
  const p1Rate = p1Tasks.length > 0 ? p1Done / p1Tasks.length : 0;
  const p1Score = p1Rate * 25;

  // Velocity trend (20%) - tasks completed in last 7 days vs prior 7
  const last7 = tasks.filter(t => {
    if (t.status !== 'completed' || !t.updatedAt) return false;
    const d = new Date(t.updatedAt);
    return d >= subDays(today, 7);
  }).length;
  const velocityScore = Math.min(last7 / 10, 1) * 20;

  return Math.round(streakScore + consistencyScore + p1Score + velocityScore);
};

export const getStreak = async () => {
  const allSessions = await db.sessions.toArray();
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = subDays(today, i);
    const start = startOfDay(day).toISOString();
    const end = endOfDay(day).toISOString();
    const daySessions = allSessions.filter(s => s.startTime >= start && s.startTime <= end && s.endTime);
    if (daySessions.length > 0) streak++;
    else if (i > 0) break;
  }
  return streak;
};

export const getHeatmapData = async () => {
  const sessions = await db.sessions.where('endTime').notEqual('').toArray();
  const map = {};
  for (const s of sessions) {
    if (!s.startTime || !s.endTime) continue;
    const hour = getHours(new Date(s.startTime));
    const day = format(new Date(s.startTime), 'EEE');
    const key = `${day}-${hour}`;
    map[key] = (map[key] || 0) + (s.focusedMinutes || 0);
  }
  return map;
};

export const getVelocityData = async (planId, days = 30) => {
  const data = [];
  const today = new Date();
  const tasks = planId
    ? await db.tasks.where('planId').equals(planId).toArray()
    : await db.tasks.toArray();
  for (let i = days - 1; i >= 0; i--) {
    const day = subDays(today, i);
    const start = startOfDay(day).toISOString();
    const end = endOfDay(day).toISOString();
    const completed = tasks.filter(t =>
      t.status === 'completed' && t.updatedAt >= start && t.updatedAt <= end
    ).length;
    data.push({ date: format(day, 'MM/dd'), completed });
  }
  return data;
};

export const getInboxItems = () => db.inbox.orderBy('createdAt').reverse().toArray();

export const addToInbox = (title) =>
  db.inbox.add({ title, createdAt: new Date().toISOString() });

export const deleteInboxItem = (id) => db.inbox.delete(id);

export const assignInboxToPlan = async (id, planId, categoryId = null) => {
  const item = await db.inbox.get(id);
  if (!item) return;
  await db.tasks.add({
    planId,
    categoryId,
    title: item.title,
    description: '',
    estimatedMinutes: 25,
    priority: 'p2',
    dueDate: null,
    status: 'active',
    progress: 0,
    isRecurring: false,
    recurringSchedule: null,
    dependsOn: [],
    order: 999,
    createdAt: new Date().toISOString(),
  });
  await db.inbox.delete(id);
};
