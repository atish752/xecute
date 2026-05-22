import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema.js';
import { useAppStore } from '../../store/appStore.js';
import { createPlan, updatePlan, deletePlan, archivePlan, computePlanProgress, getPlanById } from '../../db/queries/plans.js';
import { createTask, getTasksByPlan, deleteTask, updateTask, updateTaskProgress, createSubtask, getSubtasksByTask, reorderTasks } from '../../db/queries/tasks.js';
import { getInboxItems, deleteInboxItem, assignInboxToPlan } from '../../db/queries/analytics.js';
import { createCategory, updateCategory, deleteCategory, getCategoriesByPlan } from '../../db/queries/categories.js';
import { generatePlanTemplate, breakdownTask, suggestOptimalOrder } from '../../ai/gemini.js';
import { refineSMARTGoal } from '../../ai/gemini.js';
import { generateCompletionMessage } from '../../ai/claude.js';
import confetti from 'canvas-confetti';
import PriorityBadge from '../../components/common/PriorityBadge.jsx';
import ProgressRing from '../../components/common/ProgressRing.jsx';
import { format } from 'date-fns';


const STATUS_COLORS = {
  active: '#22C55E',
  completed: '#00C9FF',
  archived: '#4B5060',
  paused: '#F59E0B',
};

const CATEGORY_LABELS = {
  short: { label: 'Short Term', desc: '1–7 days', color: '#10B981' },
  medium: { label: 'Medium Term', desc: '1–4 weeks', color: '#F59E0B' },
  long: { label: 'Long Term', desc: '1–12+ mos', color: '#EF4444' },
};

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const cardVariants = {
  hidden: { y: 15, opacity: 0, filter: 'blur(4px)' },
  show: { 
    y: 0, 
    opacity: 1, 
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 300, damping: 25 } 
  }
};

// ─── Plan Card ───────────────────────────────────────────────────────────────
function PlanCard({ plan, onClick }) {
  const cat = CATEGORY_LABELS[plan.category] || CATEGORY_LABELS.medium;
  return (
    <motion.div
      variants={cardVariants}
      whileTap={{ scale: 0.98 }}
      className="card card-hover"
      style={{ cursor: 'pointer', padding: '16px 20px', position: 'relative', overflow: 'hidden' }}
      onClick={() => onClick(plan)}
    >
      {/* Dynamic border-highlight glow on card */}
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: cat.color }} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <ProgressRing progress={plan.overallProgress || 0} size={54} strokeWidth={5} color={cat.color} label={`${plan.overallProgress || 0}%`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3 className="font-syne font-bold" style={{ fontSize: 16, color: '#F0F2F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
              {plan.name}
            </h3>
            <span
              className="chip"
              style={{ fontSize: 9, background: `${cat.color}10`, color: cat.color, border: `1px solid ${cat.color}25`, padding: '2px 8px', flexShrink: 0 }}
            >
              {cat.label}
            </span>
          </div>
          <div className="progress-track" style={{ marginBottom: 8, height: 3 }}>
            <div className="progress-fill" style={{ width: `${plan.overallProgress || 0}%`, background: cat.color }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="font-dm" style={{ color: '#4B5060', fontSize: 12 }}>
              {plan.status === 'active' ? '🟢 Active' : plan.status === 'completed' ? '✅ Complete' : '📦 Archived'}
            </span>
            {plan.targetDate && (
              <span className="font-dm" style={{ color: '#8B90A0', fontSize: 12 }}>
                📅 {format(new Date(plan.targetDate), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Plan Dashboard ───────────────────────────────────────────────────────────
function PlanDashboard({ plan, onBack }) {
  const tasks = useLiveQuery(() => db.tasks.where('planId').equals(plan.id).toArray(), [plan.id], []);
  const categories = useLiveQuery(() => db.categories.where('planId').equals(plan.id).sortBy('order'), [plan.id], []);

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', priority: 'p2', estimatedMinutes: 25, isRecurring: false, recurringSchedule: 'daily', dependsOnTaskId: '', categoryId: '' });
  const [loadingBreakdown, setLoadingBreakdown] = useState(null);
  const [subtaskMap, setSubtaskMap] = useState({});
  const [expandedTask, setExpandedTask] = useState(null);

  const [toastText, setToastText] = useState('');
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);
  const [prevProgress, setPrevProgress] = useState(0);
  const [loadingOrder, setLoadingOrder] = useState(false);

  // New states for Advanced Planning Controls
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: '', priority: 'p2' });
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEditForm, setPlanEditForm] = useState(null);
  const [editingTask, setEditingTask] = useState(null);

  const p1Done = tasks?.filter(t => t.priority === 'p1' && t.status === 'completed').length || 0;
  const p1Total = tasks?.filter(t => t.priority === 'p1').length || 0;
  const p2Done = tasks?.filter(t => t.priority === 'p2' && t.status === 'completed').length || 0;
  const p2Total = tasks?.filter(t => t.priority === 'p2').length || 0;
  const p3Done = tasks?.filter(t => t.priority === 'p3' && t.status === 'completed').length || 0;
  const p3Total = tasks?.filter(t => t.priority === 'p3').length || 0;
  const totalProgress = tasks?.length ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / tasks.length) : 0;

  const uncategorizedTasks = (tasks || [])
    .filter(t => !t.categoryId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Track completion celebration
  useEffect(() => {
    if (tasks && tasks.length > 0) {
      if (totalProgress === 100 && prevProgress < 100 && plan.status === 'active') {
        updatePlan(plan.id, { status: 'completed' });
        setShowCompletionCelebration(true);
        confetti({
          particleCount: 150,
          spread: 80,
          colors: ['#F5A623', '#00C9FF', '#FFFFFF'],
          origin: { y: 0.5 }
        });
      }
      setPrevProgress(totalProgress);
    }
  }, [totalProgress, tasks?.length, plan.id, plan.status, prevProgress]);

  const handleBreakdown = async (task) => {
    setLoadingBreakdown(task.id);
    const subtasks = await breakdownTask(task.title);
    if (subtasks && subtasks.length > 0) {
      for (const title of subtasks) {
        await createSubtask({ taskId: task.id, title, priority: 'p2' });
      }
      const subs = await getSubtasksByTask(task.id);
      setSubtaskMap(m => ({ ...m, [task.id]: subs }));
    }
    setLoadingBreakdown(null);
    setExpandedTask(task.id);
  };

  const toggleExpand = async (taskId) => {
    if (expandedTask === taskId) { setExpandedTask(null); return; }
    const subs = await getSubtasksByTask(taskId);
    setSubtaskMap(m => ({ ...m, [taskId]: subs }));
    setExpandedTask(taskId);
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;
    const catTasks = tasks.filter(t => t.categoryId === (newTask.categoryId ? Number(newTask.categoryId) : null));
    await createTask({
      planId: plan.id,
      title: newTask.title,
      priority: newTask.priority,
      estimatedMinutes: newTask.estimatedMinutes,
      isRecurring: newTask.isRecurring,
      recurringSchedule: newTask.isRecurring ? newTask.recurringSchedule : null,
      dependsOn: newTask.dependsOnTaskId ? [Number(newTask.dependsOnTaskId)] : [],
      categoryId: newTask.categoryId ? Number(newTask.categoryId) : null,
      order: catTasks.length
    });
    setNewTask({ title: '', priority: 'p2', estimatedMinutes: 25, isRecurring: false, recurringSchedule: 'daily', dependsOnTaskId: '', categoryId: '' });
    setShowAddTask(false);
  };

  const handleToggleTask = async (task, checked) => {
    const newProgress = checked ? 100 : 0;
    await updateTaskProgress(task.id, newProgress);

    if (checked) {
      confetti({
        particleCount: 80,
        spread: 50,
        colors: ['#F5A623', '#00C9FF', '#FFFFFF'],
        origin: { y: 0.8 }
      });
      const msg = await generateCompletionMessage(task.title);
      setToastText(msg || 'Crushed it. Another one down.');
      setTimeout(() => setToastText(''), 3000);
    }
  };

  const handleAutoOrder = async () => {
    if (tasks.length === 0) return;
    setLoadingOrder(true);
    try {
      let orderedIds = null;
      if (navigator.onLine) {
        orderedIds = await suggestOptimalOrder(tasks);
      }
      
      const originalIds = tasks.map(t => t.id);
      const isDefault = !orderedIds || 
        orderedIds.length !== originalIds.length || 
        orderedIds.every((id, idx) => id === originalIds[idx]);

      if (isDefault) {
        // Fall back to local heuristic ordering: Priority (p1 > p2 > p3) first, then Category Order, then Task Order
        const priorityWeights = { p1: 1, p2: 2, p3: 3 };
        const sorted = [...tasks].sort((a, b) => {
          const pA = priorityWeights[a.priority] || 2;
          const pB = priorityWeights[b.priority] || 2;
          if (pA !== pB) return pA - pB;
          
          if (a.categoryId !== b.categoryId) {
            const catA = categories.find(c => c.id === a.categoryId);
            const catB = categories.find(c => c.id === b.categoryId);
            const orderA = catA ? (catA.order ?? 999) : 999;
            const orderB = catB ? (catB.order ?? 999) : 999;
            if (orderA !== orderB) return orderA - orderB;
          }
          
          return (a.order ?? 0) - (b.order ?? 0);
        });
        orderedIds = sorted.map(t => t.id);
        setToastText('Tasks ordered locally by priority.');
      } else {
        setToastText('AI reordered your tasks.');
      }

      if (orderedIds && orderedIds.length > 0) {
        await reorderTasks(plan.id, orderedIds);
        setTimeout(() => setToastText(''), 3000);
      }
    } catch (err) {
      console.error('[AutoOrder] Error:', err);
      const priorityWeights = { p1: 1, p2: 2, p3: 3 };
      const sorted = [...tasks].sort((a, b) => {
        const pA = priorityWeights[a.priority] || 2;
        const pB = priorityWeights[b.priority] || 2;
        if (pA !== pB) return pA - pB;
        if (a.categoryId !== b.categoryId) {
          const catA = categories.find(c => c.id === a.categoryId);
          const catB = categories.find(c => c.id === b.categoryId);
          const orderA = catA ? (catA.order ?? 999) : 999;
          const orderB = catB ? (catB.order ?? 999) : 999;
          if (orderA !== orderB) return orderA - orderB;
        }
        return (a.order ?? 0) - (b.order ?? 0);
      });
      const orderedIds = sorted.map(t => t.id);
      await reorderTasks(plan.id, orderedIds);
      setToastText('Tasks ordered locally by priority.');
      setTimeout(() => setToastText(''), 3000);
    } finally {
      setLoadingOrder(false);
    }
  };

  // Reordering & Category Management helper methods
  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) return;
    await createCategory({
      planId: plan.id,
      name: newCategory.name,
      priority: newCategory.priority,
      order: categories.length
    });
    setNewCategory({ name: '', priority: 'p2' });
    setShowAddCategory(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    await updateCategory(editingCategory.id, {
      name: editingCategory.name,
      priority: editingCategory.priority
    });
    setEditingCategory(null);
  };

  const handleDeleteCategoryClick = async (cat) => {
    const keep = confirm(`Do you want to keep the tasks in "${cat.name}"? Click OK to move them to Uncategorized, or Cancel to delete all tasks in this category.`);
    await deleteCategory(cat.id, keep);
  };

  const handleMoveCategory = async (category, direction) => {
    const index = categories.findIndex(c => c.id === category.id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;
    
    const swapWith = categories[direction === 'up' ? index - 1 : index + 1];
    const currentOrder = category.order || 0;
    const targetOrder = swapWith.order || 0;
    
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(category.id, { order: targetOrder });
      await db.categories.update(swapWith.id, { order: currentOrder });
    });
  };

  const handleMoveTask = async (task, direction, catId) => {
    const categoryTasks = tasks
      .filter(t => t.categoryId === catId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const index = categoryTasks.findIndex(t => t.id === task.id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categoryTasks.length - 1) return;
    
    const swapWith = categoryTasks[direction === 'up' ? index - 1 : index + 1];
    const currentOrder = task.order || 0;
    const targetOrder = swapWith.order || 0;
    
    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.update(task.id, { order: targetOrder });
      await db.tasks.update(swapWith.id, { order: currentOrder });
    });
  };

  const handleMoveTaskToCategory = async (task, targetCatId) => {
    const targetTasks = tasks.filter(t => t.categoryId === targetCatId);
    const targetOrder = targetTasks.length;
    await db.tasks.update(task.id, {
      categoryId: targetCatId || null,
      order: targetOrder
    });
  };

  const startEditingPlan = () => {
    setPlanEditForm({
      name: plan.name,
      description: plan.description || '',
      category: plan.category || 'medium',
      targetDate: plan.targetDate || '',
      goalStatement: plan.goalStatement || '',
      timeBudgetHours: plan.timeBudgetMinutes ? String(Math.round(plan.timeBudgetMinutes / 60)) : ''
    });
    setEditingPlan(true);
  };

  const handleUpdatePlanDetails = async () => {
    if (!planEditForm || !planEditForm.name.trim()) return;
    await updatePlan(plan.id, {
      name: planEditForm.name,
      description: planEditForm.description || '',
      category: planEditForm.category || 'medium',
      targetDate: planEditForm.targetDate || null,
      goalStatement: planEditForm.goalStatement || '',
      timeBudgetMinutes: planEditForm.timeBudgetHours ? Number(planEditForm.timeBudgetHours) * 60 : 0
    });
    setEditingPlan(false);
    setPlanEditForm(null);
  };

  const startEditingTask = (task) => {
    setEditingTask({
      ...task,
      dependsOnTaskId: task.dependsOn?.[0] || ''
    });
  };

  const handleUpdateTask = async () => {
    if (!editingTask || !editingTask.title.trim()) return;
    
    const dependencyId = editingTask.dependsOnTaskId ? Number(editingTask.dependsOnTaskId) : null;
    const dependsOn = dependencyId ? [dependencyId] : [];
    
    const targetCatId = editingTask.categoryId ? Number(editingTask.categoryId) : null;
    let targetOrder = editingTask.order;
    
    const originalTask = tasks.find(t => t.id === editingTask.id);
    if (originalTask && originalTask.categoryId !== targetCatId) {
      const targetTasks = tasks.filter(t => t.categoryId === targetCatId);
      targetOrder = targetTasks.length;
    }

    await updateTask(editingTask.id, {
      title: editingTask.title,
      priority: editingTask.priority,
      estimatedMinutes: Number(editingTask.estimatedMinutes) || 25,
      isRecurring: editingTask.isRecurring,
      recurringSchedule: editingTask.isRecurring ? editingTask.recurringSchedule : null,
      categoryId: targetCatId,
      dependsOn: dependsOn,
      order: targetOrder
    });
    setEditingTask(null);
  };

  const renderTaskItem = (task, catId) => {
    const isBlocked = task.dependsOn && task.dependsOn.length > 0 && tasks.some(t => task.dependsOn.includes(t.id) && t.status !== 'completed');
    const depTask = isBlocked ? tasks.find(t => task.dependsOn.includes(t.id)) : null;

    return (
      <motion.div key={task.id} variants={cardVariants}>
        <div
          className="glass-sm"
          style={{
            borderRadius: 14,
            padding: '10px 12px',
            cursor: isBlocked ? 'not-allowed' : 'pointer',
            opacity: task.status === 'completed' ? 0.5 : isBlocked ? 0.65 : 1,
            transition: 'opacity 0.2s',
            border: isBlocked ? '1px dashed rgba(239, 68, 68, 0.2)' : '1px solid rgba(255,255,255,0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
          onClick={() => !isBlocked && toggleExpand(task.id)}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="checkbox"
              disabled={isBlocked}
              checked={task.status === 'completed'}
              onChange={e => {
                e.stopPropagation();
                handleToggleTask(task, e.target.checked);
              }}
              style={{ width: 16, height: 16, accentColor: '#F5A623', flexShrink: 0, cursor: isBlocked ? 'not-allowed' : 'pointer' }}
              onClick={e => e.stopPropagation()}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-dm font-medium" style={{ color: '#F0F2F7', fontSize: 13.5, textDecoration: task.status === 'completed' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.title}
              </p>
              {task.isRecurring && (
                <span style={{ fontSize: 9, color: '#F5A623', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  🔄 Recurring ({task.recurringSchedule})
                </span>
              )}
              {isBlocked && depTask && (
                <p className="font-dm" style={{ color: '#EF4444', fontSize: 10, marginTop: 2 }}>
                  🔒 Blocked: complete <span style={{ fontWeight: 600 }}>{depTask.title}</span> first
                </p>
              )}
              {task.progress > 0 && task.status !== 'completed' && !isBlocked && (
                <div className="progress-track" style={{ marginTop: 6, height: 3 }}>
                  <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                </div>
              )}
            </div>
            
            {/* Task Controls & Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
              <PriorityBadge priority={task.priority} showLabel={false} />
              
              <span className="font-dm" style={{ color: '#8B90A0', fontSize: 10, fontWeight: 500, marginRight: 4 }}>
                {task.estimatedMinutes}m
              </span>
              
              {/* Task Reordering Buttons */}
              <button
                className="btn btn-ghost"
                style={{ width: 24, height: 24, padding: 0, borderRadius: 6, fontSize: 10 }}
                onClick={() => handleMoveTask(task, 'up', catId)}
                title="Move Up"
              >
                ▲
              </button>
              <button
                className="btn btn-ghost"
                style={{ width: 24, height: 24, padding: 0, borderRadius: 6, fontSize: 10 }}
                onClick={() => handleMoveTask(task, 'down', catId)}
                title="Move Down"
              >
                ▼
              </button>
              
              {/* Edit Task Button */}
              <button
                className="btn btn-ghost"
                style={{ width: 24, height: 24, padding: 0, borderRadius: 6, fontSize: 10, color: '#00C9FF' }}
                onClick={() => startEditingTask(task)}
                title="Edit Task"
              >
                ✏️
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Task Subtasks */}
        <AnimatePresence>
          {expandedTask === task.id && !isBlocked && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div className="glass-sm" style={{ borderRadius: '0 0 14px 14px', padding: '10px 12px', borderTop: 'none', marginTop: -2, borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                {/* Subtasks */}
                {subtaskMap[task.id]?.map(sub => (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }} onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={sub.status === 'completed'}
                      onChange={e => {
                        db.subtasks.update(sub.id, { status: e.target.checked ? 'completed' : 'active' });
                        setSubtaskMap(m => ({ ...m, [task.id]: m[task.id]?.map(s => s.id === sub.id ? { ...s, status: e.target.checked ? 'completed' : 'active' } : s) }));
                      }}
                      style={{ width: 14, height: 14, accentColor: '#00C9FF', cursor: 'pointer' }}
                    />
                    <span className="font-dm" style={{ color: '#8B90A0', fontSize: 12.5, textDecoration: sub.status === 'completed' ? 'line-through' : 'none' }}>
                      {sub.title}
                    </span>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1, height: 36, fontSize: 11, borderRadius: 8 }}
                    onClick={() => handleBreakdown(task)}
                    disabled={loadingBreakdown === task.id}
                  >
                    {loadingBreakdown === task.id ? '⏳ Analyzing...' : '🤖 AI Breakdown'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ height: 36, width: 36, padding: 0, borderRadius: 8 }}
                    onClick={() => deleteTask(task.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const cat = CATEGORY_LABELS[plan.category] || CATEGORY_LABELS.medium;

  return (
    <div className="scrollable" style={{ flex: 1, padding: '16px 16px 20px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="btn btn-ghost" style={{ width: 36, height: 36, padding: 0, borderRadius: 10, fontSize: 18, flexShrink: 0 }} onClick={onBack}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</h2>
            <button
              className="btn btn-ghost"
              style={{ width: 26, height: 26, padding: 0, borderRadius: 6, fontSize: 11, color: '#00C9FF', border: '1px solid rgba(0,201,255,0.2)' }}
              onClick={startEditingPlan}
              title="Edit Plan Details"
            >
              ✏️
            </button>
          </div>
          <span className="font-dm" style={{ color: cat.color, fontSize: 12, fontWeight: 500 }}>{cat.label}</span>
        </div>
        <button
          className="btn btn-danger"
          style={{ height: 36, padding: '0 12px', fontSize: 12, borderRadius: 10, flexShrink: 0 }}
          onClick={() => { if (confirm('Archive this plan?')) archivePlan(plan.id).then(onBack); }}
        >
          Archive
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div className="glass" style={{ borderRadius: 20, padding: '16px 16px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ProgressRing progress={totalProgress} size={64} strokeWidth={5} color={cat.color} label={`${totalProgress}%`} />
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 11, marginTop: 8, fontWeight: 500, letterSpacing: '0.04em' }}>COMPLETED</p>
        </div>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['p1', p1Done, p1Total, '#EF4444'], ['p2', p2Done, p2Total, '#F59E0B'], ['p3', p3Done, p3Total, '#10B981']].map(([p, done, total, color]) => (
            <div key={p} className="glass-sm" style={{ borderRadius: 14, padding: '8px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="font-dm" style={{ color, fontSize: 11, fontWeight: 700 }}>{p.toUpperCase()}</span>
                <span className="font-dm" style={{ color: '#8B90A0', fontSize: 11 }}>{done}/{total}</span>
              </div>
              <div className="progress-track" style={{ height: 3 }}>
                <div className="progress-fill" style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%', background: color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="section-label">Tasks</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" style={{ height: 32, padding: '0 10px', fontSize: 12, borderRadius: 8, color: '#00C9FF', border: '1px solid rgba(0,201,255,0.2)' }} onClick={() => setShowAddCategory(true)}>
            📂 + Category
          </button>
          <button className="btn btn-ghost" style={{ height: 32, padding: '0 10px', fontSize: 12, borderRadius: 8 }} onClick={handleAutoOrder} disabled={loadingOrder}>
            {loadingOrder ? '⏳...' : '🤖 Order'}
          </button>
          <button className="btn btn-primary" style={{ height: 32, padding: '0 12px', fontSize: 12, borderRadius: 8 }} onClick={() => setShowAddTask(true)}>
            + Add Task
          </button>
        </div>
      </div>

      {/* Add task form */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-amber"
            style={{ borderRadius: 16, padding: 16, marginBottom: 16, overflow: 'hidden' }}
          >
            <input className="input" placeholder="Task title" value={newTask.title} onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))} style={{ marginBottom: 10 }} />
            
            {/* Category Select for Task Creation */}
            <div style={{ marginBottom: 10 }}>
              <label className="font-dm" style={{ display: 'block', marginBottom: 4, color: '#8B90A0', fontSize: 11, fontWeight: 500 }}>Category</label>
              <select className="input" style={{ padding: '10px 12px', fontSize: 13 }} value={newTask.categoryId} onChange={e => setNewTask(n => ({ ...n, categoryId: e.target.value }))}>
                <option value="">-- Uncategorized --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.priority === 'p1' ? '🔴' : c.priority === 'p2' ? '🟡' : '🟢'}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <select className="input" style={{ padding: '10px 12px', fontSize: 13 }} value={newTask.priority} onChange={e => setNewTask(n => ({ ...n, priority: e.target.value }))}>
                <option value="p1">🔴 P1 Critical</option>
                <option value="p2">🟡 P2 Important</option>
                <option value="p3">🟢 P3 Nice to Have</option>
              </select>
              <input type="number" className="input" placeholder="Min" style={{ width: 80, padding: '10px 12px', fontSize: 13 }} value={newTask.estimatedMinutes} onChange={e => setNewTask(n => ({ ...n, estimatedMinutes: Number(e.target.value) }))} />
            </div>

            {/* Recurrence scheduling */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8B90A0', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={newTask.isRecurring} onChange={e => setNewTask(n => ({ ...n, isRecurring: e.target.checked }))} style={{ accentColor: '#F5A623' }} />
                Recurring Task
              </label>
              {newTask.isRecurring && (
                <select className="input" style={{ padding: '6px 8px', fontSize: 12, height: 32, width: 100 }} value={newTask.recurringSchedule} onChange={e => setNewTask(n => ({ ...n, recurringSchedule: e.target.value }))}>
                  <option value="daily">🔄 Daily</option>
                  <option value="weekly">📅 Weekly</option>
                </select>
              )}
            </div>

            {/* Dependency select */}
            <div style={{ marginBottom: 14 }}>
              <label className="font-dm" style={{ display: 'block', marginBottom: 4, color: '#8B90A0', fontSize: 11, fontWeight: 500 }}>Prerequisite Dependency</label>
              <select className="input" style={{ padding: '8px 10px', fontSize: 12.5 }} value={newTask.dependsOnTaskId} onChange={e => setNewTask(n => ({ ...n, dependsOnTaskId: e.target.value }))}>
                <option value="">-- None --</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, height: 38 }} onClick={() => setShowAddTask(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 2, height: 38 }} onClick={handleAddTask}>Add Task</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task List / Eisenhower Matrix */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <p className="empty-state-text">No tasks yet. Add tasks to start executing.</p>
          </div>
        ) : (
          <>
            {/* Uncategorized Section */}
            {uncategorizedTasks.length > 0 && (
              <div className="glass" style={{ borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>📦</span>
                    <h3 className="font-syne font-bold" style={{ fontSize: 15, color: '#8B90A0' }}>
                      Uncategorized Tasks
                    </h3>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uncategorizedTasks.map(task => renderTaskItem(task, null))}
                </div>
              </div>
            )}

            {/* Categorized Sections */}
            {categories.map(category => {
              const categoryTasks = (tasks || [])
                .filter(t => t.categoryId === category.id)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

              return (
                <div key={category.id} className="glass" style={{ borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {/* Category Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>📂</span>
                      <h3 className="font-syne font-bold" style={{ fontSize: 15, color: '#F0F2F7' }}>
                        {category.name}
                      </h3>
                      <PriorityBadge priority={category.priority || 'p2'} showLabel={true} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button 
                        className="btn btn-ghost" 
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, fontSize: 12 }} 
                        onClick={() => handleMoveCategory(category, 'up')}
                        title="Move Up"
                      >
                        ▲
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, fontSize: 12 }} 
                        onClick={() => handleMoveCategory(category, 'down')}
                        title="Move Down"
                      >
                        ▼
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, fontSize: 12, color: '#00C9FF' }} 
                        onClick={() => setEditingCategory(category)}
                        title="Edit Category"
                      >
                        ✏️
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 6, fontSize: 12, color: '#EF4444' }} 
                        onClick={() => handleDeleteCategoryClick(category)}
                        title="Delete Category"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  
                  {/* Category Tasks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {categoryTasks.length === 0 ? (
                      <p className="font-dm" style={{ fontSize: 12, color: '#4B5060', textAlign: 'center', padding: '10px 0' }}>
                        No tasks in this category.
                      </p>
                    ) : (
                      categoryTasks.map(task => renderTaskItem(task, category.id))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </motion.div>

      {/* Toast Alert */}
      <AnimatePresence>
        {toastText && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            style={{
              position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(245,166,35,0.95)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, padding: '10px 20px', zIndex: 99,
              boxShadow: '0 8px 32px 0 rgba(245, 166, 35, 0.3)',
            }}
          >
            <span className="font-dm" style={{ color: '#07080a', fontSize: 13, fontWeight: 700 }}>🏆 {toastText}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan Completion Celebration Modal */}
      <AnimatePresence>
        {showCompletionCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.95)', padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              animate={{ scale: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ scale: 0.9, y: 30, filter: 'blur(10px)' }}
              className="glass-amber glow-amber"
              style={{
                borderRadius: 28, padding: '32px 24px', width: '100%', maxWidth: 360,
                textAlign: 'center', border: '1px solid rgba(245,166,35,0.3)',
              }}
            >
              <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
              <h2 className="font-syne font-black text-glow-amber" style={{ fontSize: 24, color: '#F5A623', marginBottom: 8, textTransform: 'uppercase' }}>
                Plan Completed!
              </h2>
              <p className="font-dm font-bold" style={{ fontSize: 18, color: '#F0F2F7', marginBottom: 20 }}>
                {plan.name}
              </p>
              
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
                "Every great execution starts with a plan. But it ends with relentless focus. You did it."
              </p>
              
              <button
                className="btn btn-primary"
                style={{ width: '100%', height: 48, fontSize: 15, borderRadius: 14, marginBottom: 12 }}
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `I completed my goal: ${plan.name} on Xecute!`,
                      text: `Finished 100% of tasks for ${plan.name}. Focus is power.`,
                      url: window.location.origin
                    });
                  }
                }}
              >
                🔗 Share Your Win
              </button>
              
              <button
                className="btn btn-ghost"
                style={{ width: '100%', height: 44, fontSize: 14, borderRadius: 12 }}
                onClick={() => setShowCompletionCelebration(false)}
              >
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      <AnimatePresence>
        {showAddCategory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.8)', backdropFilter: 'blur(8px)', padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="glass"
              style={{
                borderRadius: 24, padding: 24, width: '100%', maxWidth: 360,
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 16
              }}
            >
              <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7' }}>Add Category</h3>
              
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Category Name</label>
                <input 
                  className="input" 
                  placeholder="e.g., Phase 1: Foundation" 
                  value={newCategory.name} 
                  onChange={e => setNewCategory(c => ({ ...c, name: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Importance Priority</label>
                <select 
                  className="input" 
                  style={{ padding: '10px 12px', fontSize: 13 }}
                  value={newCategory.priority} 
                  onChange={e => setNewCategory(c => ({ ...c, priority: e.target.value }))}
                >
                  <option value="p1">🔴 P1 Critical</option>
                  <option value="p2">🟡 P2 Important</option>
                  <option value="p3">🟢 P3 Nice to Have</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, height: 42 }} onClick={() => setShowAddCategory(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 42 }} onClick={handleAddCategory}>Add</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Category Modal */}
      <AnimatePresence>
        {editingCategory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.8)', backdropFilter: 'blur(8px)', padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="glass"
              style={{
                borderRadius: 24, padding: 24, width: '100%', maxWidth: 360,
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 16
              }}
            >
              <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7' }}>Edit Category</h3>
              
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Category Name</label>
                <input 
                  className="input" 
                  value={editingCategory.name} 
                  onChange={e => setEditingCategory(c => ({ ...c, name: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Importance Priority</label>
                <select 
                  className="input" 
                  style={{ padding: '10px 12px', fontSize: 13 }}
                  value={editingCategory.priority} 
                  onChange={e => setEditingCategory(c => ({ ...c, priority: e.target.value }))}
                >
                  <option value="p1">🔴 P1 Critical</option>
                  <option value="p2">🟡 P2 Important</option>
                  <option value="p3">🟢 P3 Nice to Have</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, height: 42 }} onClick={() => setEditingCategory(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 42 }} onClick={handleUpdateCategory}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Plan Modal */}
      <AnimatePresence>
        {editingPlan && planEditForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.8)', backdropFilter: 'blur(8px)', padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="glass scrollable"
              style={{
                borderRadius: 24, padding: 24, width: '100%', maxWidth: 420, maxHeight: '85vh',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 16
              }}
            >
              <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7' }}>Edit Plan Details</h3>
              
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Plan Name *</label>
                <input 
                  className="input" 
                  value={planEditForm.name} 
                  onChange={e => setPlanEditForm(f => ({ ...f, name: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Description</label>
                <textarea 
                  className="input" 
                  value={planEditForm.description} 
                  onChange={e => setPlanEditForm(f => ({ ...f, description: e.target.value }))} 
                  style={{ minHeight: 60 }}
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Time Horizon</label>
                <select 
                  className="input" 
                  style={{ padding: '10px 12px', fontSize: 13 }}
                  value={planEditForm.category} 
                  onChange={e => setPlanEditForm(f => ({ ...f, category: e.target.value }))}
                >
                  <option value="short">Short Term (1–7 days)</option>
                  <option value="medium">Medium Term (1–4 weeks)</option>
                  <option value="long">Long Term (1–12+ months)</option>
                </select>
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Target Date</label>
                <input 
                  type="date" 
                  className="input" 
                  value={planEditForm.targetDate} 
                  onChange={e => setPlanEditForm(f => ({ ...f, targetDate: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Time Budget (Hours)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={planEditForm.timeBudgetHours} 
                  onChange={e => setPlanEditForm(f => ({ ...f, timeBudgetHours: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Goal Statement</label>
                <textarea 
                  className="input" 
                  value={planEditForm.goalStatement} 
                  onChange={e => setPlanEditForm(f => ({ ...f, goalStatement: e.target.value }))} 
                  style={{ minHeight: 60 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, height: 42 }} onClick={() => setEditingPlan(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 42 }} onClick={handleUpdatePlanDetails} disabled={!planEditForm.name.trim()}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7, 8, 10, 0.8)', backdropFilter: 'blur(8px)', padding: 24,
            }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="glass scrollable"
              style={{
                borderRadius: 24, padding: 24, width: '100%', maxWidth: 380, maxHeight: '85vh',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', gap: 16
              }}
            >
              <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7' }}>Edit Task</h3>
              
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Task Title</label>
                <input 
                  className="input" 
                  value={editingTask.title} 
                  onChange={e => setEditingTask(t => ({ ...t, title: e.target.value }))} 
                />
              </div>

              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Category</label>
                <select 
                  className="input" 
                  style={{ padding: '10px 12px', fontSize: 13 }}
                  value={editingTask.categoryId || ''} 
                  onChange={e => setEditingTask(t => ({ ...t, categoryId: e.target.value }))}
                >
                  <option value="">-- Uncategorized --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Priority</label>
                  <select 
                    className="input" 
                    style={{ padding: '10px 12px', fontSize: 13 }}
                    value={editingTask.priority} 
                    onChange={e => setEditingTask(t => ({ ...t, priority: e.target.value }))}
                  >
                    <option value="p1">🔴 P1 Critical</option>
                    <option value="p2">🟡 P2 Important</option>
                    <option value="p3">🟢 P3 Nice to Have</option>
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Est. Min</label>
                  <input 
                    type="number" 
                    className="input" 
                    value={editingTask.estimatedMinutes} 
                    onChange={e => setEditingTask(t => ({ ...t, estimatedMinutes: Number(e.target.value) }))} 
                  />
                </div>
              </div>

              {/* Recurrence scheduling */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8B90A0', fontSize: 12.5, cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={editingTask.isRecurring} 
                    onChange={e => setEditingTask(t => ({ ...t, isRecurring: e.target.checked }))} 
                    style={{ accentColor: '#F5A623' }} 
                  />
                  Recurring Task
                </label>
                {editingTask.isRecurring && (
                  <select 
                    className="input" 
                    style={{ padding: '6px 8px', fontSize: 12, height: 32, width: 100 }} 
                    value={editingTask.recurringSchedule || 'daily'} 
                    onChange={e => setEditingTask(t => ({ ...t, recurringSchedule: e.target.value }))}
                  >
                    <option value="daily">🔄 Daily</option>
                    <option value="weekly">📅 Weekly</option>
                  </select>
                )}
              </div>

              {/* Prerequisite selection */}
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Prerequisite Dependency</label>
                <select 
                  className="input" 
                  style={{ padding: '10px 12px', fontSize: 13 }}
                  value={editingTask.dependsOnTaskId || ''} 
                  onChange={e => setEditingTask(t => ({ ...t, dependsOnTaskId: e.target.value }))}
                >
                  <option value="">-- None --</option>
                  {tasks.filter(t => t.id !== editingTask.id).map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, height: 42 }} onClick={() => setEditingTask(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1, height: 42 }} onClick={handleUpdateTask} disabled={!editingTask.title.trim()}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Create Plan Wizard (Single-Step Overhaul) ───────────────────────────────
function CreatePlanWizard({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', description: '', category: 'medium', targetDate: '', goalStatement: '', timeBudgetHours: '' });
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingSMART, setLoadingSMART] = useState(false);
  const [loadingStatusText, setLoadingStatusText] = useState('Initiating target database...');

  const handleSMART = async () => {
    if (!form.goalStatement.trim()) return;
    setLoadingSMART(true);
    const refined = await refineSMARTGoal(form.goalStatement);
    if (refined) setForm(f => ({ ...f, goalStatement: refined }));
    setLoadingSMART(false);
  };

  const handleCreateManual = async () => {
    if (!form.name.trim()) return;
    const id = await createPlan({
      ...form,
      timeBudgetMinutes: form.timeBudgetHours ? Number(form.timeBudgetHours) * 60 : 0
    });
    const newPlan = await getPlanById(id);
    onDone(newPlan);
  };

  const handleCreateWithAI = async () => {
    if (!form.name.trim()) return;
    setLoadingTemplate(true);
    setLoadingStatusText('Refining strategy goal...');
    
    let id = null;
    try {
      id = await createPlan({
        ...form,
        timeBudgetMinutes: form.timeBudgetHours ? Number(form.timeBudgetHours) * 60 : 0
      });
      
      setTimeout(() => setLoadingStatusText('Drafting milestones & categories...'), 1000);
      
      const tmpl = await generatePlanTemplate(form.goalStatement);
      
      if (tmpl) {
        setTimeout(() => setLoadingStatusText('Populating focused tasks...'), 2000);
        for (const cat of tmpl.categories || []) {
          const catId = await createCategory({ planId: id, ...cat });
          for (const task of cat.tasks || []) {
            await createTask({ planId: id, categoryId: catId, ...task });
          }
        }
      }
      const newPlan = await getPlanById(id);
      onDone(newPlan);
    } catch (e) {
      console.error(e);
      // Fallback: if plan creation failed, create it now; otherwise reuse the ID
      if (!id) {
        id = await createPlan({
          ...form,
          timeBudgetMinutes: form.timeBudgetHours ? Number(form.timeBudgetHours) * 60 : 0
        });
      }
      const newPlan = await getPlanById(id);
      onDone(newPlan);
    } finally {
      setLoadingTemplate(false);
    }
  };

  return (
    <div className="scrollable" style={{ flex: 1, padding: '20px 16px', position: 'relative' }}>
      
      {/* AI loading overlay */}
      <AnimatePresence>
        {loadingTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 }}
          >
            <div className="glass-cyan" style={{ borderRadius: 24, padding: 32, width: '100%', maxWidth: 320, textAlign: 'center', border: '1px solid rgba(0,201,255,0.22)' }}>
              {/* Spinner */}
              <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 20px' }}>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  style={{
                    width: '100%', height: '100%',
                    borderRadius: '50%',
                    border: '3px solid rgba(0,201,255,0.1)',
                    borderTopColor: '#00C9FF',
                    filter: 'drop-shadow(0 0 8px rgba(0,201,255,0.5))'
                  }}
                />
                <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 24 }}>🤖</span>
              </div>
              
              <h3 className="font-syne font-bold text-glow-cyan" style={{ fontSize: 18, color: '#00C9FF', marginBottom: 8 }}>Xecute AI</h3>
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, minHeight: 40 }}>{loadingStatusText}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', damping: 25 }}>
        <h2 className="font-syne font-bold" style={{ fontSize: 22, color: '#F0F2F7', marginBottom: 4 }}>New Plan</h2>
        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 14, marginBottom: 20 }}>Define your mission.</p>

        {/* Inputs card */}
        <div className="glass" style={{ borderRadius: 20, padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Plan Name *</label>
            <input className="input" placeholder="e.g., Launch SaaS product" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Description</label>
            <textarea className="input" placeholder="What is this plan about?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 70 }} />
          </div>

          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 10 }}>Time Horizon</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <button
                  key={k}
                  className="btn"
                  style={{ 
                    flex: 1, 
                    height: 52, 
                    flexDirection: 'column', 
                    borderRadius: 12, 
                    padding: '4px 6px',
                    border: `1px solid ${form.category === k ? v.color : 'rgba(255,255,255,0.06)'}`,
                    background: form.category === k ? `${v.color}08` : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => setForm(f => ({ ...f, category: k }))}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: form.category === k ? v.color : '#8B90A0' }}>{v.label}</span>
                  <span style={{ fontSize: 9, opacity: 0.6, color: '#8B90A0' }}>{v.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Target Date</label>
            <input type="date" className="input" value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} />
          </div>

          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Time Budget (Hours)</label>
            <input
              type="number"
              className="input"
              placeholder="e.g., 20"
              min={1}
              value={form.timeBudgetHours}
              onChange={e => setForm(f => ({ ...f, timeBudgetHours: e.target.value }))}
            />
          </div>

          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Goal Statement (Required for AI generation)</label>
            <div style={{ position: 'relative' }}>
              <textarea className="input" placeholder="What does success look like?" value={form.goalStatement} onChange={e => setForm(f => ({ ...f, goalStatement: e.target.value }))} style={{ paddingRight: 80, minHeight: 70 }} />
              {form.goalStatement.trim() && (
                <button
                  className="btn"
                  style={{ 
                    position: 'absolute', 
                    bottom: 8, 
                    right: 8, 
                    height: 28, 
                    padding: '0 10px', 
                    fontSize: 10, 
                    borderRadius: 8, 
                    background: 'rgba(0,201,255,0.1)', 
                    color: '#00C9FF', 
                    border: '1px solid rgba(0,201,255,0.2)',
                    fontWeight: 700
                  }}
                  onClick={handleSMART}
                  disabled={loadingSMART}
                >
                  {loadingSMART ? '...' : '✨ SMART'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {form.goalStatement.trim() ? (
            <>
              <button 
                className="btn btn-primary glow-amber-sm" 
                style={{ width: '100%', height: 48, fontSize: 15, borderRadius: 14 }}
                onClick={handleCreateWithAI}
                disabled={!form.name.trim()}
              >
                🤖 Generate Plan with AI ✨
              </button>
              <button 
                className="btn btn-ghost" 
                style={{ width: '100%', height: 44, fontSize: 14, borderRadius: 12 }}
                onClick={handleCreateManual}
                disabled={!form.name.trim()}
              >
                Create Manually →
              </button>
            </>
          ) : (
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', height: 48, fontSize: 15, borderRadius: 14 }}
              onClick={handleCreateManual}
              disabled={!form.name.trim()}
            >
              Create Plan →
            </button>
          )}
          <button className="btn btn-ghost" style={{ width: '100%', height: 44, opacity: 0.7 }} onClick={onCancel}>Cancel</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Captured Inbox Helper ───────────────────────────────────────────────────
function InboxSection({ items, plans, onDelete, onAssign }) {
  const [assigningId, setAssigningId] = useState(null);
  const [isOpen, setIsOpen] = useState(true);

  if (!items || items.length === 0) return null;

  const activePlans = plans?.filter(p => p.status === 'active') || [];

  return (
    <div className="glass-amber glow-amber-sm" style={{ borderRadius: 20, padding: 16, marginBottom: 20, border: '1px solid rgba(245,166,35,0.18)' }}>
      <div 
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📥</span>
          <p className="font-syne font-bold text-glow-amber" style={{ color: '#F5A623', fontSize: 15 }}>
            Captured Inbox ({items.length})
          </p>
        </div>
        <span style={{ color: '#F5A623', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginTop: 12 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => (
                <div key={item.id} className="glass-sm" style={{ borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 13.5, flex: 1, wordBreak: 'break-word' }}>
                      {item.title}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button 
                        className="btn btn-ghost" 
                        style={{ height: 28, padding: '0 10px', fontSize: 11, borderRadius: 8, color: '#00C9FF', borderColor: 'rgba(0,201,255,0.15)' }}
                        onClick={() => setAssigningId(assigningId === item.id ? null : item.id)}
                      >
                        Assign
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ height: 28, width: 28, padding: 0, borderRadius: 8, fontSize: 11 }}
                        onClick={() => onDelete(item.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {assigningId === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.03)' }}
                      >
                        <p className="font-dm" style={{ color: '#8B90A0', fontSize: 11, marginBottom: 6 }}>Assign task to plan:</p>
                        {activePlans.length === 0 ? (
                          <p className="font-dm" style={{ color: '#4B5060', fontSize: 11 }}>No active plans. Create an active plan first.</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {activePlans.map(p => (
                              <button
                                key={p.id}
                                className="btn btn-ghost"
                                style={{ height: 26, padding: '0 8px', fontSize: 10, borderRadius: 6 }}
                                onClick={() => {
                                  onAssign(item.id, p.id);
                                  setAssigningId(null);
                                }}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Plan Tab ────────────────────────────────────────────────────────────
export default function PlanTab() {
  const [view, setView] = useState('list'); // list | dashboard | create
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [filter, setFilter] = useState('active');

  const plans = useLiveQuery(async () => {
    const all = await db.plans.toArray();
    return Promise.all(all.map(async p => ({
      ...p,
      overallProgress: await computePlanProgress(p.id),
    })));
  }, [], []);

  const inboxItems = useLiveQuery(() => getInboxItems(), [], []);

  const selectedPlan = useLiveQuery(() => selectedPlanId ? db.plans.get(selectedPlanId) : null, [selectedPlanId]);

  const filtered = plans?.filter(p => filter === 'all' ? true : p.status === filter) || [];

  if (view === 'create') {
    return (
      <CreatePlanWizard 
        onDone={(newPlan) => { 
          if (newPlan) {
            setSelectedPlanId(newPlan.id);
            setView('dashboard');
          } else {
            setView('list'); 
          }
        }} 
        onCancel={() => setView('list')} 
      />
    );
  }

  if (view === 'dashboard' && selectedPlan) {
    return <PlanDashboard plan={selectedPlan} onBack={() => { setView('list'); setSelectedPlanId(null); }} />;
  }

  return (
    <div className="scrollable" style={{ flex: 1, padding: '16px 16px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 className="font-syne font-bold" style={{ fontSize: 22, color: '#F0F2F7', marginBottom: 2 }}>Your Plans</h2>
          <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13 }}>{filtered.length} plan{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" style={{ height: 40, padding: '0 16px', fontSize: 14, borderRadius: 12 }} onClick={() => setView('create')}>
          + New Plan
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {['active', 'completed', 'archived', 'all'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ height: 32, padding: '0 14px', fontSize: 12, borderRadius: 9999, whiteSpace: 'nowrap' }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Inbox Section */}
      <InboxSection
        items={inboxItems}
        plans={plans}
        onDelete={deleteInboxItem}
        onAssign={assignInboxToPlan}
      />

      {/* Plan list */}
      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="show" 
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗺️</div>
            <p className="empty-state-text">No plans yet. Every great execution starts with a plan.</p>
            <button className="btn btn-primary" style={{ height: 44, padding: '0 20px', fontSize: 14, borderRadius: 12 }} onClick={() => setView('create')}>
              Create Your First Plan
            </button>
          </div>
        ) : filtered.map(plan => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onClick={(p) => { setSelectedPlanId(p.id); setView('dashboard'); }}
          />
        ))}
      </motion.div>
    </div>
  );
}
