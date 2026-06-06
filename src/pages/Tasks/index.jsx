import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema.js';
import { createStandaloneTask, toggleTaskCompletion } from '../../db/queries/tasks.js';
import { enhanceStandaloneTask } from '../../ai/gemini.js';
import PriorityBadge from '../../components/common/PriorityBadge.jsx';

const AMBER = '#F5A623';
const CYAN = '#00C9FF';

export default function TasksTab() {
  const [filter, setFilter] = useState('today'); // today | daily | one-time
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('one-time'); // one-time | daily
  const [priority, setPriority] = useState('p2'); // p1 | p2 | p3
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Live query for standalone tasks (where planId is null or undefined)
  const allTasks = useLiveQuery(async () => {
    const arr = await db.tasks.toArray();
    return arr.filter(t => !t.planId);
  }, [], []);

  const todayStr = new Date().toISOString().split('T')[0];

  const filteredTasks = (allTasks || []).filter(task => {
    // Check if task is completed today (for daily tasks)
    const isCompletedToday = task.taskType === 'daily' && task.completedDates?.includes(todayStr);
    
    if (filter === 'today') {
      // Show all active one-time tasks and all daily tasks (completed or not)
      if (task.taskType === 'daily') return true;
      return task.status === 'active';
    } else if (filter === 'daily') {
      return task.taskType === 'daily';
    } else {
      return task.taskType === 'one-time';
    }
  }).sort((a, b) => {
    const pOrder = { p1: 1, p2: 2, p3: 3 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  const handleOpenAddModal = () => {
    setTitle('');
    setDescription('');
    setTaskType('one-time');
    setPriority('p2');
    setEstimatedMinutes(25);
    setDueDate(new Date().toISOString().split('T')[0]);
    setShowAddModal(true);
  };

  const handleOpenEditModal = (task) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setTaskType(task.taskType || 'one-time');
    setPriority(task.priority || 'p2');
    setEstimatedMinutes(task.estimatedMinutes || 25);
    setDueDate(task.dueDate || new Date().toISOString().split('T')[0]);
    setShowEditModal(true);
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    await createStandaloneTask({
      title: title.trim(),
      description: description.trim(),
      taskType,
      priority,
      estimatedMinutes: Number(estimatedMinutes),
      dueDate: taskType === 'one-time' ? dueDate : null,
    });

    setShowAddModal(false);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !editingTask) return;

    await db.tasks.update(editingTask.id, {
      title: title.trim(),
      description: description.trim(),
      taskType,
      priority,
      estimatedMinutes: Number(estimatedMinutes),
      dueDate: taskType === 'one-time' ? dueDate : null,
    });

    setShowEditModal(false);
    setEditingTask(null);
  };

  const handleDeleteTask = async (id) => {
    if (window.confirm('Delete this task permanently?')) {
      await db.tasks.delete(id);
      if (editingTask?.id === id) {
        setShowEditModal(false);
        setEditingTask(null);
      }
    }
  };

  const handleEnhance = async () => {
    if (!title.trim()) return;
    setIsEnhancing(true);
    try {
      const result = await enhanceStandaloneTask(title, description);
      if (result) {
        if (result.title) setTitle(result.title);
        if (result.description) setDescription(result.description);
        if (result.estimatedMinutes) setEstimatedMinutes(result.estimatedMinutes);
        if (result.priority) setPriority(result.priority);
      }
    } catch (err) {
      console.error('Enhancement error:', err);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Checkbox completed state calculation
  const getIsTaskCompleted = (task) => {
    if (task.taskType === 'daily') {
      return task.completedDates?.includes(todayStr) || false;
    }
    return task.status === 'completed';
  };

  return (
    <div className="scrollable" style={{ flex: 1, padding: '16px 16px 20px', display: 'flex', flexDirection: 'column' }}>
      {/* Header with Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 className="font-syne font-bold" style={{ fontSize: 22, color: '#F0F2F7', letterSpacing: '-0.02em' }}>
          Standalone Tasks
        </h2>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={handleOpenAddModal}
          className="btn btn-primary"
          style={{
            width: 38, height: 38, borderRadius: 12, padding: 0, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          ＋
        </motion.button>
      </div>

      {/* Tabs / Filter Row */}
      <div className="glass" style={{ display: 'flex', padding: 4, borderRadius: 12, marginBottom: 16, background: 'rgba(255,255,255,0.02)' }}>
        {['today', 'daily', 'one-time'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="btn"
            style={{
              flex: 1, height: 32, fontSize: 12, borderRadius: 10,
              background: filter === f ? 'linear-gradient(135deg, #F5A623 0%, #D48C11 100%)' : 'transparent',
              color: filter === f ? '#050608' : '#8B90A0',
              fontWeight: filter === f ? 600 : 500,
              boxShadow: filter === f ? '0 2px 8px rgba(245,166,35,0.15)' : 'none',
            }}
          >
            {f === 'today' ? "☀️ Today" : f === 'daily' ? "🔄 Daily" : "🎯 One-time"}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {filteredTasks.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 40 }}>
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-text">No tasks found. Click the + button to add one.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredTasks.map(task => {
              const isCompleted = getIsTaskCompleted(task);
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="glass card-hover"
                  style={{
                    borderRadius: 16,
                    padding: '14px 16px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    background: isCompleted ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
                    opacity: isCompleted ? 0.6 : 1,
                    transition: 'opacity 0.2s, background 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Custom Checkbox */}
                    <button
                      onClick={() => toggleTaskCompletion(task.id)}
                      style={{
                        width: 22, height: 22, borderRadius: '50%',
                        border: isCompleted ? `2px solid ${AMBER}` : '2px solid rgba(255,255,255,0.25)',
                        background: isCompleted ? AMBER : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0, marginTop: 2,
                        color: '#050608', fontSize: 10, fontWeight: 900,
                        transition: 'all 0.2s',
                      }}
                    >
                      {isCompleted && '✓'}
                    </button>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => handleOpenEditModal(task)}>
                      <p
                        className="font-dm font-semibold"
                        style={{
                          fontSize: 14.5,
                          color: isCompleted ? '#4B5060' : '#F0F2F7',
                          textDecoration: isCompleted ? 'line-through' : 'none',
                          marginBottom: 4,
                          lineHeight: 1.3
                        }}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="font-dm" style={{ fontSize: 12, color: '#8B90A0', marginBottom: 8, textDecoration: isCompleted ? 'line-through' : 'none' }}>
                          {task.description}
                        </p>
                      )}
                      
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <PriorityBadge priority={task.priority} showLabel={false} />
                        
                        <span className="chip" style={{ background: 'rgba(255,255,255,0.03)', color: '#8B90A0', border: '1px solid rgba(255,255,255,0.04)', fontSize: 10 }}>
                          {task.taskType === 'daily' ? '🔄 Daily' : '🎯 One-time'}
                        </span>
                        
                        {task.estimatedMinutes && (
                          <span className="font-dm" style={{ color: '#4B5060', fontSize: 11 }}>
                            ⏱ {task.estimatedMinutes}m
                          </span>
                        )}

                        {task.taskType === 'one-time' && task.dueDate && (
                          <span className="font-dm" style={{ color: '#4B5060', fontSize: 11 }}>
                            📅 {task.dueDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Add / Edit Modals */}
      <AnimatePresence>
        {(showAddModal || showEditModal) && (
          <>
            <motion.div
              className="modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingTask(null); }}
              style={{ zIndex: 110 }}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: '-40%' }}
              animate={{ scale: 1, opacity: 1, y: '-50%' }}
              exit={{ scale: 0.9, opacity: 0, y: '-40%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="glass-dark"
              style={{
                position: 'fixed',
                top: '50%',
                left: 16,
                right: 16,
                transform: 'translateY(-50%)',
                borderRadius: 24,
                padding: '24px 20px',
                zIndex: 120,
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                maxHeight: '90%',
                overflowY: 'auto'
              }}
            >
              <h3 className="font-syne font-bold" style={{ fontSize: 18, color: '#F0F2F7', marginBottom: 16 }}>
                {showAddModal ? 'New Standalone Task' : 'Edit Standalone Task'}
              </h3>

              <form onSubmit={showAddModal ? handleAddSubmit : handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Title */}
                <div>
                  <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Task Title</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="input"
                      required
                      placeholder="What needs to be done?"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handleEnhance}
                      disabled={isEnhancing || !title.trim()}
                      className="btn btn-ghost"
                      style={{
                        padding: '0 12px', fontSize: 13, borderColor: 'rgba(0,201,255,0.3)',
                        color: CYAN, opacity: title.trim() ? 1 : 0.5
                      }}
                    >
                      {isEnhancing ? '✨ Enhancing...' : '✨ Enhance AI'}
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Description (Optional)</label>
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="Provide details or action items..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                {/* Task Type Switch */}
                <div>
                  <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Task Category</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { id: 'one-time', label: '🎯 One-time Task' },
                      { id: 'daily', label: '🔄 Daily Habit / Task' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTaskType(t.id)}
                        className="btn"
                        style={{
                          flex: 1, height: 38, fontSize: 12, borderRadius: 10,
                          border: taskType === t.id ? '1px solid rgba(245,166,35,0.3)' : '1px solid rgba(255,255,255,0.05)',
                          background: taskType === t.id ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.01)',
                          color: taskType === t.id ? '#F5A623' : '#8B90A0',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority Selection with Color Glows */}
                <div>
                  <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Priority Level</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { id: 'p1', label: '🔴 P1', activeBg: 'rgba(220,38,38,0.22)', border: '#EF4444', color: '#fca5a5', shadow: '0 0 10px rgba(220,38,38,0.3)' },
                      { id: 'p2', label: '🟡 P2', activeBg: 'rgba(245,158,11,0.22)', border: '#F59E0B', color: '#fcd34d', shadow: '0 0 10px rgba(245,158,11,0.3)' },
                      { id: 'p3', label: '🟢 P3', activeBg: 'rgba(34,197,94,0.18)', border: '#10B981', color: '#86efac', shadow: '0 0 10px rgba(34,197,94,0.3)' }
                    ].map(p => {
                      const isSel = priority === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPriority(p.id)}
                          className="btn"
                          style={{
                            flex: 1, height: 38, fontSize: 13, borderRadius: 10,
                            background: isSel ? p.activeBg : 'rgba(255,255,255,0.01)',
                            border: isSel ? `1px solid ${p.border}` : '1px solid rgba(255,255,255,0.05)',
                            color: isSel ? p.color : '#8B90A0',
                            boxShadow: isSel ? p.shadow : 'none',
                            fontWeight: isSel ? 700 : 500,
                            transition: 'all 0.2s',
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time & Date */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Est. Time (min)</label>
                    <input
                      type="number"
                      className="input"
                      min={5} max={240}
                      value={estimatedMinutes}
                      onChange={e => setEstimatedMinutes(Number(e.target.value))}
                    />
                  </div>

                  {taskType === 'one-time' && (
                    <div style={{ flex: 1 }}>
                      <label className="font-dm" style={{ color: '#8B90A0', fontSize: 12, display: 'block', marginBottom: 6 }}>Due Date</label>
                      <input
                        type="date"
                        className="input"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  {!showAddModal && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(editingTask.id)}
                      className="btn btn-danger"
                      style={{ padding: '0 16px', height: 46 }}
                      title="Delete Task"
                    >
                      🗑
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setShowEditModal(false); setEditingTask(null); }}
                    className="btn btn-ghost"
                    style={{ flex: 1, height: 46 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1, height: 46 }}
                  >
                    {showAddModal ? 'Add Task' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
