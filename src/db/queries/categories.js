import { db } from '../schema.js';

export const createCategory = async (data) => {
  const id = await db.categories.add({
    planId: data.planId,
    name: data.name,
    priority: data.priority || 'p2',
    order: data.order || 0,
    progress: 0,
  });
  return id;
};

export const getCategoriesByPlan = (planId) =>
  db.categories.where('planId').equals(planId).sortBy('order');

export const updateCategory = (id, changes) => db.categories.update(id, changes);

export const deleteCategory = async (id, keepTasks = false) => {
  if (keepTasks) {
    const tasks = await db.tasks.where('categoryId').equals(id).toArray();
    for (const task of tasks) {
      await db.tasks.update(task.id, { categoryId: null });
    }
  } else {
    const tasks = await db.tasks.where('categoryId').equals(id).toArray();
    for (const task of tasks) {
      await db.subtasks.where('taskId').equals(task.id).delete();
    }
    await db.tasks.where('categoryId').equals(id).delete();
  }
  await db.categories.delete(id);
};
