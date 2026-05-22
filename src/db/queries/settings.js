import { db } from '../schema.js';

const DEFAULTS = {
  userName: '',
  avatar: '🧠',
  dailyFocusGoalMinutes: 240,
  workStartTime: '09:00',
  workEndTime: '18:00',
  defaultSessionMinutes: 45,
  defaultBreakMinutes: 10,
  defaultBreakFrequency: 1,
  defaultAmbientSound: 'silence',
  autoStartNextSession: false,
  theme: 'dark',
  accentColor: 'amber',
  customAccentHex: '#F5A623',
  compactMode: false,
  fontSize: 'medium',
  notifBreaks: true,
  notifDailyPlanning: true,
  notifDailyPlanningTime: '08:00',
  notifStreak: true,
  notifStreakTime: '20:00',
  notifWeeklyReview: true,
  notifWeeklyReviewDay: 'sunday',
  aiEnabled: true,
  aiClaudeEnabled: true,
  aiGeminiEnabled: true,
  aiInsightFrequency: 'weekly',
  claudeApiKey: '',
  geminiApiKey: '',
  firebaseSyncEnabled: false,
  procrastinationShield: false,
  morningKickstart: true,
  weeklyReviewDay: 'sunday',
};

export const getSetting = async (key) => {
  const row = await db.settings.get(key);
  return row ? row.value : DEFAULTS[key];
};

export const setSetting = (key, value) =>
  db.settings.put({ key, value });

export const getAllSettings = async () => {
  const rows = await db.settings.toArray();
  const stored = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...DEFAULTS, ...stored };
};

export const resetSettings = async () => {
  await db.settings.clear();
};
