import { db } from '../db/schema.js';

// Helper: Encrypt/Decrypt data using simple XOR cipher with password key + Base64
const encryptData = (dataStr, password) => {
  const key = password || 'xecute_default';
  let result = '';
  for (let i = 0; i < dataStr.length; i++) {
    result += String.fromCharCode(dataStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
};

const decryptData = (encryptedStr, password) => {
  try {
    const key = password || 'xecute_default';
    const decoded = decodeURIComponent(escape(atob(encryptedStr)));
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  } catch (e) {
    console.error('[CloudSync] Decryption failed:', e);
    return null;
  }
};

// Simulated cloud state in local storage (independent of IndexedDB)
const getCloudStore = () => {
  try {
    const raw = localStorage.getItem('xecute_mock_cloud_store');
    return raw ? JSON.parse(raw) : { users: {}, backups: {} };
  } catch {
    return { users: {}, backups: {} };
  }
};

const saveCloudStore = (store) => {
  localStorage.setItem('xecute_mock_cloud_store', JSON.stringify(store));
};

export const registerUser = async (username, password) => {
  // Simulate network delay
  await new Promise(r => setTimeout(r, 800));

  const u = username.trim().toLowerCase();
  if (!u || !password) return { success: false, message: 'Invalid credentials' };

  const store = getCloudStore();
  if (store.users[u]) {
    return { success: false, message: 'ID/Username already exists' };
  }

  // Save user with basic hashed password representation
  store.users[u] = {
    username: u,
    passwordHash: btoa(password), // Simulated hash
    createdAt: new Date().toISOString()
  };
  
  saveCloudStore(store);
  return { success: true, message: 'Account created successfully!' };
};

export const loginUser = async (username, password) => {
  await new Promise(r => setTimeout(r, 600));

  const u = username.trim().toLowerCase();
  const store = getCloudStore();

  const user = store.users[u];
  if (!user || user.passwordHash !== btoa(password)) {
    return { success: false, message: 'Invalid username or password' };
  }

  return { success: true, username: u };
};

export const syncToCloud = async (username, password) => {
  await new Promise(r => setTimeout(r, 1000));

  const u = username.trim().toLowerCase();
  const store = getCloudStore();

  if (!store.users[u]) {
    return { success: false, message: 'Account not found' };
  }

  // Export current local database
  const localData = {
    plans: await db.plans.toArray(),
    categories: await db.categories.toArray(),
    tasks: await db.tasks.toArray(),
    subtasks: await db.subtasks.toArray(),
    sessions: await db.sessions.toArray(),
    weeklyReviews: await db.weeklyReviews.toArray(),
    inbox: await db.inbox.toArray(),
    milestones: await db.milestones.toArray(),
    settings: await db.settings.toArray(),
  };

  const serialized = JSON.stringify(localData);
  const encrypted = encryptData(serialized, password);

  if (!store.backups[u]) {
    store.backups[u] = [];
  }

  // Add backup with timestamp
  const newBackup = {
    timestamp: new Date().toISOString(),
    data: encrypted,
    label: `Backup - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`
  };

  // Keep up to 5 historical backups (Value-add feature!)
  store.backups[u].unshift(newBackup);
  if (store.backups[u].length > 5) {
    store.backups[u].pop();
  }

  saveCloudStore(store);
  return { success: true, backups: store.backups[u] };
};

export const restoreFromCloud = async (username, password, backupIndex = 0) => {
  await new Promise(r => setTimeout(r, 1200));

  const u = username.trim().toLowerCase();
  const store = getCloudStore();

  const userBackups = store.backups[u];
  if (!userBackups || !userBackups[backupIndex]) {
    return { success: false, message: 'No backup found' };
  }

  const encrypted = userBackups[backupIndex].data;
  const decrypted = decryptData(encrypted, password);
  if (!decrypted) {
    return { success: false, message: 'Data decryption failed. Incorrect password?' };
  }

  const parsed = JSON.parse(decrypted);

  // Restore database tables
  await db.transaction('rw', [
    db.plans, db.categories, db.tasks, db.subtasks, 
    db.sessions, db.weeklyReviews, db.inbox, db.milestones, db.settings
  ], async () => {
    // Clear existing
    await db.plans.clear();
    await db.categories.clear();
    await db.tasks.clear();
    await db.subtasks.clear();
    await db.sessions.clear();
    await db.weeklyReviews.clear();
    await db.inbox.clear();
    await db.milestones.clear();
    await db.settings.clear();

    // Import
    if (parsed.plans) await db.plans.bulkAdd(parsed.plans);
    if (parsed.categories) await db.categories.bulkAdd(parsed.categories);
    if (parsed.tasks) await db.tasks.bulkAdd(parsed.tasks);
    if (parsed.subtasks) await db.subtasks.bulkAdd(parsed.subtasks);
    if (parsed.sessions) await db.sessions.bulkAdd(parsed.sessions);
    if (parsed.weeklyReviews) await db.weeklyReviews.bulkAdd(parsed.weeklyReviews);
    if (parsed.inbox) await db.inbox.bulkAdd(parsed.inbox);
    if (parsed.milestones) await db.milestones.bulkAdd(parsed.milestones);
    if (parsed.settings) await db.settings.bulkAdd(parsed.settings);
  });

  return { success: true };
};

export const getBackupsList = (username) => {
  const u = username.trim().toLowerCase();
  const store = getCloudStore();
  return store.backups[u] || [];
};
