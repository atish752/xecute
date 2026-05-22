import { db } from '../schema.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

export const startSession = async (data) => {
  const id = await db.sessions.add({
    taskId: data.taskId,
    planId: data.planId || null,
    startTime: new Date().toISOString(),
    endTime: null,
    focusedMinutes: 0,
    breaksScheduled: data.breaksScheduled || 0,
    breaksTaken: 0,
    progressBefore: data.progressBefore || 0,
    progressAfter: null,
    notes: '',
    intentionText: data.intentionText || '',
    ambientSound: data.ambientSound || 'silence',
  });
  return id;
};

export const endSession = (id, data) =>
  db.sessions.update(id, {
    endTime: new Date().toISOString(),
    focusedMinutes: data.focusedMinutes,
    breaksTaken: data.breaksTaken || 0,
    progressAfter: data.progressAfter,
    notes: data.notes || '',
  });

export const updateSessionNotes = (id, notes) => db.sessions.update(id, { notes });

export const getSessionsByDate = async (date) => {
  const start = startOfDay(date).toISOString();
  const end = endOfDay(date).toISOString();
  return db.sessions.where('startTime').between(start, end).toArray();
};

export const getTodaySessions = () => getSessionsByDate(new Date());

export const getSessionStats = async (period = 'today') => {
  const now = new Date();
  let start, end;
  switch (period) {
    case 'week':  start = startOfWeek(now); end = endOfWeek(now); break;
    case 'month': start = startOfMonth(now); end = endOfMonth(now); break;
    case 'all':   start = new Date(0); end = now; break;
    default:      start = startOfDay(now); end = endOfDay(now);
  }
  const sessions = await db.sessions
    .where('startTime').between(start.toISOString(), end.toISOString())
    .toArray();
  const completedSessions = sessions.filter(s => s.endTime);
  const totalMinutes = completedSessions.reduce((sum, s) => sum + (s.focusedMinutes || 0), 0);
  const avgLength = completedSessions.length ? Math.round(totalMinutes / completedSessions.length) : 0;
  const totalBreaks = completedSessions.reduce((sum, s) => sum + (s.breaksTaken || 0), 0);
  const scheduledBreaks = completedSessions.reduce((sum, s) => sum + (s.breaksScheduled || 0), 0);
  return {
    totalSessions: completedSessions.length,
    totalMinutes,
    avgLength,
    breakCompliance: scheduledBreaks > 0 ? Math.round((totalBreaks / scheduledBreaks) * 100) : 0,
  };
};

export const getAllSessions = () => db.sessions.toArray();
