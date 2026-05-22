import { db } from '../schema.js';

export const createWeeklyReview = async (data) => {
  const id = await db.weeklyReviews.add({
    weekStartDate: data.weekStartDate || new Date().toISOString(),
    wentWell: data.wentWell || '',
    notCompleted: data.notCompleted || '',
    obstacles: data.obstacles || '',
    nextWeekFocus: data.nextWeekFocus || '',
    claudeSummary: data.claudeSummary || '',
    momentumScore: data.momentumScore || 0,
    createdAt: new Date().toISOString()
  });
  return id;
};

export const getWeeklyReviews = () => {
  return db.weeklyReviews.orderBy('weekStartDate').reverse().toArray();
};

export const getWeeklyReviewById = (id) => {
  return db.weeklyReviews.get(id);
};

export const deleteWeeklyReview = (id) => {
  return db.weeklyReviews.delete(id);
};
