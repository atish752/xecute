import { db } from '../schema.js';

export const createTask = async (data) => {
  const id = await db.tasks.add({
    planId: data.planId,
    categoryId: data.categoryId || null,
    title: data.title,
    description: data.description || '',
    estimatedMinutes: data.estimatedMinutes || 25,
    priority: data.priority || 'p2',
    dueDate: data.dueDate || null,
    status: 'active',
    progress: 0,
    isRecurring: false,
    recurringSchedule: null,
    dependsOn: [],
    order: data.order || 0,
    createdAt: new Date().toISOString(),
  });
  return id;
};

export const getTasksByPlan = (planId) =>
  db.tasks.where('planId').equals(planId).sortBy('order');

export const getTasksByPriority = async (planId) => {
  const tasks = await db.tasks.where('planId').equals(planId).toArray();
  const order = { p1: 0, p2: 1, p3: 2 };
  return tasks.sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
};

export const getAllActiveTasks = async () =>
  db.tasks.where('status').equals('active').toArray();

export const updateTask = (id, changes) =>
  db.tasks.update(id, changes);

export const updateTaskProgress = async (id, progress) => {
  await db.tasks.update(id, {
    progress,
    status: progress >= 100 ? 'completed' : 'active',
  });
};

export const deleteTask = async (id) => {
  await db.subtasks.where('taskId').equals(id).delete();
  await db.tasks.delete(id);
};

export const createSubtask = async (data) => {
  const id = await db.subtasks.add({
    taskId: data.taskId,
    title: data.title,
    priority: data.priority || 'p2',
    status: 'active',
    progress: 0,
  });
  return id;
};

export const getSubtasksByTask = (taskId) =>
  db.subtasks.where('taskId').equals(taskId).toArray();

export const updateSubtask = (id, changes) => db.subtasks.update(id, changes);
export const deleteSubtask = (id) => db.subtasks.delete(id);

export const reorderTasks = async (planId, orderedIds) => {
  await db.transaction('rw', db.tasks, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.tasks.update(orderedIds[i], { order: i });
    }
  });
};

export const createStandaloneTask = async (data) => {
  const id = await db.tasks.add({
    planId: null,
    categoryId: null,
    title: data.title,
    description: data.description || '',
    estimatedMinutes: data.estimatedMinutes || 25,
    priority: data.priority || 'p2',
    taskType: data.taskType || 'one-time',
    dueDate: data.dueDate || null,
    completedDates: data.completedDates || [],
    status: 'active',
    progress: 0,
    isRecurring: false,
    order: data.order || 0,
    createdAt: new Date().toISOString(),
  });
  return id;
};

export const getStandaloneTasks = async () => {
  const arr = await db.tasks.toArray();
  return arr.filter(t => !t.planId);
};


export const toggleTaskCompletion = async (id) => {
  const task = await db.tasks.get(id);
  if (!task) return;
  if (task.taskType === 'daily') {
    const todayStr = new Date().toISOString().split('T')[0];
    const completedDates = task.completedDates || [];
    let nextDates = [...completedDates];
    let nextProgress = 0;
    if (completedDates.includes(todayStr)) {
      nextDates = nextDates.filter(d => d !== todayStr);
      nextProgress = 0;
    } else {
      nextDates.push(todayStr);
      nextProgress = 100;
    }
    await db.tasks.update(id, { completedDates: nextDates, progress: nextProgress });
  } else {
    const isCompleted = task.status === 'completed';
    await db.tasks.update(id, {
      status: isCompleted ? 'active' : 'completed',
      progress: isCompleted ? 0 : 100,
      updatedAt: new Date().toISOString()
    });
  }
};

