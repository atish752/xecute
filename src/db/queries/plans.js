import { db } from '../schema.js';

export const createPlan = async (data) => {
  const now = new Date().toISOString();
  const id = await db.plans.add({
    name: data.name,
    description: data.description || '',
    category: data.category || 'short',
    targetDate: data.targetDate || null,
    goalStatement: data.goalStatement || '',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    totalEstimatedMinutes: 0,
    totalTimeSpent: 0,
    overallProgress: 0,
    timeBudgetMinutes: data.timeBudgetMinutes || 0,
  });
  return id;
};

export const getPlans = () => db.plans.toArray();

export const getPlanById = (id) => db.plans.get(id);

export const updatePlan = (id, changes) =>
  db.plans.update(id, { ...changes, updatedAt: new Date().toISOString() });

export const deletePlan = (id) =>
  db.transaction('rw', [db.plans, db.categories, db.tasks, db.subtasks], async () => {
    const cats = await db.categories.where('planId').equals(id).toArray();
    for (const cat of cats) {
      const tasks = await db.tasks.where('categoryId').equals(cat.id).toArray();
      for (const task of tasks) {
        await db.subtasks.where('taskId').equals(task.id).delete();
      }
      await db.tasks.where('categoryId').equals(cat.id).delete();
    }
    await db.tasks.where('planId').equals(id).delete();
    await db.categories.where('planId').equals(id).delete();
    await db.plans.delete(id);
  });

export const archivePlan = (id) => updatePlan(id, { status: 'archived' });

export const computePlanProgress = async (planId) => {
  const tasks = await db.tasks.where('planId').equals(planId).toArray();
  if (!tasks.length) return 0;
  const total = tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
  return Math.round(total / tasks.length);
};

export const getPlanWithProgress = async (id) => {
  const plan = await db.plans.get(id);
  if (!plan) return null;
  const progress = await computePlanProgress(id);
  return { ...plan, overallProgress: progress };
};
