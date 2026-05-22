import Dexie from 'dexie';

export const db = new Dexie('XecuteDB');

db.version(1).stores({
  plans:         '++id, status, category, createdAt, updatedAt',
  categories:    '++id, planId, order',
  tasks:         '++id, planId, categoryId, priority, status, dueDate, order',
  subtasks:      '++id, taskId',
  sessions:      '++id, taskId, planId, startTime, endTime',
  weeklyReviews: '++id, weekStartDate',
  inbox:         '++id, createdAt',
  settings:      'key',
  milestones:    '++id, type, unlockedAt',
});

export default db;
