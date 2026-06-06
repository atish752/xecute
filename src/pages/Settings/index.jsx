import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getAllSettings, setSetting, resetSettings } from '../../db/queries/settings.js';
import { db } from '../../db/schema.js';
import { useAppStore } from '../../store/appStore.js';
import { useInstallPrompt } from '../../hooks/useInstallPrompt.js';
import Toggle from '../../components/common/Toggle.jsx';
import { 
  registerUser, 
  loginUser, 
  syncToCloud, 
  restoreFromCloud, 
  getBackupsList 
} from '../../utils/cloudSync.js';


const Section = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <p className="section-label" style={{ marginBottom: 14, paddingLeft: 4 }}>{title}</p>
    <div className="glass" style={{ borderRadius: 20, overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

const Row = ({ label, sublabel, right, noBorder = false }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)',
  }}>
    <div>
      <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 15, fontWeight: 500 }}>{label}</p>
      {sublabel && <p className="font-dm" style={{ color: '#4B5060', fontSize: 12, marginTop: 2 }}>{sublabel}</p>}
    </div>
    <div style={{ flexShrink: 0, marginLeft: 12 }}>{right}</div>
  </div>
);

const SelectRow = ({ label, sublabel, value, options, onChange, noBorder }) => (
  <div style={{
    padding: '14px 18px',
    borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div>
        <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 15, fontWeight: 500 }}>{label}</p>
        {sublabel && <p className="font-dm" style={{ color: '#4B5060', fontSize: 12, marginTop: 2 }}>{sublabel}</p>}
      </div>
    </div>
    <select
      className="input"
      style={{ padding: '10px 12px', fontSize: 13 }}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

const InputRow = ({ label, sublabel, value, onChange, placeholder, type = 'text', noBorder }) => (
  <div style={{
    padding: '14px 18px',
    borderBottom: noBorder ? 'none' : '1px solid rgba(255,255,255,0.05)',
  }}>
    <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{label}</p>
    {sublabel && <p className="font-dm" style={{ color: '#4B5060', fontSize: 12, marginBottom: 8 }}>{sublabel}</p>}
    <input
      type={type}
      className="input"
      placeholder={placeholder}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{ fontSize: 13 }}
    />
  </div>
);

const ACCENT_COLORS = [
  { id: 'amber', label: '🟠 Amber', hex: '#F5A623' },
  { id: 'cyan', label: '🔵 Cyan', hex: '#00C9FF' },
  { id: 'green', label: '🟢 Green', hex: '#22C55E' },
  { id: 'red', label: '🔴 Red', hex: '#EF4444' },
];

const AMBER = '#F5A623';
const CYAN = '#00C9FF';

export default function SettingsTab() {
  const { setSettings } = useAppStore();
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [s, setS] = useState(null);
  const [saved, setSaved] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Cloud Sync & Security States
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem('xecute_signed_in_user') || null);
  const [userPassword, setUserPassword] = useState(() => localStorage.getItem('xecute_signed_in_password') || '');
  
  // Auth Form State
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authMode, setAuthMode] = useState('login'); // login | signup

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backups, setBackups] = useState(() => currentUser ? getBackupsList(currentUser) : []);
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('xecute_auto_sync_enabled') === 'true');


  useEffect(() => {
    getAllSettings().then(async (loaded) => {
      // Auto-seed Gemini key from env if not yet stored
      const envKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      const storedKey = loaded.geminiApiKey || localStorage.getItem('xecute_gemini_key') || '';
      const activeKey = storedKey || envKey;
      if (envKey && !storedKey) {
        await setSetting('geminiApiKey', envKey);
        localStorage.setItem('xecute_gemini_key', envKey);
        loaded = { ...loaded, geminiApiKey: envKey };
      }
      setS({ ...loaded, geminiApiKey: activeKey });
    });
  }, []);

  const update = async (key, value) => {
    setS(prev => ({ ...prev, [key]: value }));
    await setSetting(key, value);
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(key);
    setTimeout(() => setSaved(''), 1500);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword) return;
    setAuthLoading(true);
    setAuthMessage('');

    if (authMode === 'signup') {
      const res = await registerUser(authUsername, authPassword);
      if (res.success) {
        // Log in immediately
        localStorage.setItem('xecute_signed_in_user', authUsername.trim().toLowerCase());
        localStorage.setItem('xecute_signed_in_password', authPassword);
        setCurrentUser(authUsername.trim().toLowerCase());
        setUserPassword(authPassword);
        setBackups([]);
        setAuthUsername('');
        setAuthPassword('');
        setAuthMessage('Account created and signed in! 🎉');
      } else {
        setAuthMessage(`❌ ${res.message}`);
      }
    } else {
      const res = await loginUser(authUsername, authPassword);
      if (res.success) {
        localStorage.setItem('xecute_signed_in_user', res.username);
        localStorage.setItem('xecute_signed_in_password', authPassword);
        setCurrentUser(res.username);
        setUserPassword(authPassword);
        const list = getBackupsList(res.username);
        setBackups(list);
        
        // Auto restore latest if backups exist
        if (list.length > 0) {
          if (window.confirm('Latest cloud backup found! Restore data now?')) {
            setRestoring(true);
            const restRes = await restoreFromCloud(res.username, authPassword, 0);
            if (restRes.success) {
              alert('Data restored successfully! Window will reload.');
              window.location.reload();
            } else {
              alert(`Restore failed: ${restRes.message}`);
            }
            setRestoring(false);
          }
        }
        
        setAuthUsername('');
        setAuthPassword('');
        setAuthMessage('Logged in successfully! 🚀');
      } else {
        setAuthMessage(`❌ ${res.message}`);
      }
    }
    setAuthLoading(false);
  };

  const handleLogOut = () => {
    localStorage.removeItem('xecute_signed_in_user');
    localStorage.removeItem('xecute_signed_in_password');
    setCurrentUser(null);
    setUserPassword('');
    setBackups([]);
    setAuthMessage('Logged out.');
  };

  const handleSyncNow = async () => {
    if (!currentUser || !userPassword) return;
    setSyncing(true);
    const res = await syncToCloud(currentUser, userPassword);
    if (res.success) {
      setBackups(res.backups);
      setSaved('sync');
      setTimeout(() => setSaved(''), 1500);
    } else {
      alert(`Sync failed: ${res.message}`);
    }
    setSyncing(false);
  };

  const handleRestoreNow = async (index) => {
    if (!currentUser || !userPassword) return;
    if (window.confirm('Restore this backup? All current local data will be replaced.')) {
      setRestoring(true);
      const res = await restoreFromCloud(currentUser, userPassword, index);
      if (res.success) {
        alert('Data restored successfully! Reloading...');
        window.location.reload();
      } else {
        alert(`Restore failed: ${res.message}`);
      }
      setRestoring(false);
    }
  };

  const toggleAutoSync = (val) => {
    setAutoSync(val);
    localStorage.setItem('xecute_auto_sync_enabled', String(val));
  };


  const handleExport = async () => {
    const data = {
      plans: await db.plans.toArray(),
      tasks: await db.tasks.toArray(),
      sessions: await db.sessions.toArray(),
      settings: await db.settings.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xecute-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = async () => {
    await db.plans.clear();
    await db.tasks.clear();
    await db.sessions.clear();
    await db.settings.clear();
    await db.inbox.clear();
    await db.milestones.clear();
    await db.weeklyReviews.clear();
    await resetSettings();
    const fresh = await getAllSettings();
    setS(fresh);
    setSettings(fresh);
    setShowClearConfirm(false);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Xecute — Do it now.',
        text: 'I use Xecute for deep-focus productivity. Check it out!',
        url: window.location.origin,
      });
    }
  };

  if (!s) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="shimmer" style={{ width: 200, height: 20, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <div className="scrollable" style={{ flex: 1, padding: '16px 16px 20px' }}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {/* Profile */}
        <Section title="Profile">
          <InputRow label="Your Name" placeholder="e.g., Alex" value={s.userName} onChange={v => update('userName', v)} />
          <InputRow label="Daily Focus Goal" sublabel="Target focused hours per day" placeholder="4" type="number" value={s.dailyFocusGoalMinutes / 60} onChange={v => update('dailyFocusGoalMinutes', Number(v) * 60)} />
          <Row label="Work Start Time" right={
            <input type="time" className="input" style={{ width: 110, padding: '8px 10px', fontSize: 13 }} value={s.workStartTime} onChange={e => update('workStartTime', e.target.value)} />
          } />
          <Row label="Work End Time" noBorder right={
            <input type="time" className="input" style={{ width: 110, padding: '8px 10px', fontSize: 13 }} value={s.workEndTime} onChange={e => update('workEndTime', e.target.value)} />
          } />
        </Section>

        {/* Focus Preferences */}
        <Section title="Focus Preferences">
          <Row
            label="Default Session"
            sublabel={`${s.defaultSessionMinutes} minutes`}
            right={
              <select className="input" style={{ padding: '8px 10px', fontSize: 13, width: 110 }} value={s.defaultSessionMinutes} onChange={e => update('defaultSessionMinutes', Number(e.target.value))}>
                {[15, 25, 30, 45, 60, 90, 120].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            }
          />
          <Row
            label="Default Break"
            sublabel={`${s.defaultBreakMinutes} minutes`}
            right={
              <select className="input" style={{ padding: '8px 10px', fontSize: 13, width: 110 }} value={s.defaultBreakMinutes} onChange={e => update('defaultBreakMinutes', Number(e.target.value))}>
                {[5, 10, 15, 20, 30].map(v => <option key={v} value={v}>{v} min</option>)}
              </select>
            }
          />
          <Row label="Auto-start next session" right={<Toggle id="auto-start" value={s.autoStartNextSession} onChange={v => update('autoStartNextSession', v)} />} />
          <Row label="Morning Kickstart" sublabel="Show daily briefing on open" noBorder right={<Toggle id="morning-kickstart" value={s.morningKickstart} onChange={v => update('morningKickstart', v)} />} />
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <Row label="Break Reminders" right={<Toggle id="notif-breaks" value={s.notifBreaks} onChange={v => update('notifBreaks', v)} />} />
          <Row label="Daily Planning" right={<Toggle id="notif-daily" value={s.notifDailyPlanning} onChange={v => update('notifDailyPlanning', v)} />} />
          <Row label="Streak Reminder" right={<Toggle id="notif-streak" value={s.notifStreak} onChange={v => update('notifStreak', v)} />} />
          <Row label="Weekly Review" noBorder right={<Toggle id="notif-weekly" value={s.notifWeeklyReview} onChange={v => update('notifWeeklyReview', v)} />} />
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
          <SelectRow
            label="Accent Color"
            options={ACCENT_COLORS.map(c => ({ value: c.id, label: c.label }))}
            value={s.accentColor}
            onChange={v => update('accentColor', v)}
          />
          <SelectRow
            label="Font Size"
            options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]}
            value={s.fontSize}
            onChange={v => update('fontSize', v)}
          />
          <Row label="Compact Mode" sublabel="Reduced padding for more info" noBorder right={<Toggle id="compact-mode" value={s.compactMode} onChange={v => update('compactMode', v)} />} />
        </Section>

        {/* AI Assistant */}
        <Section title="AI Assistant — Powered by Gemini">
          <Row
            label="Enable AI Features"
            sublabel="Focus coach, plan templates, insights"
            right={<Toggle id="ai-enabled" value={s.aiEnabled} onChange={v => update('aiEnabled', v)} />}
          />
          {s.aiEnabled && (
            <>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'rgba(0,201,255,0.15)', border: '1px solid rgba(0,201,255,0.25)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
                  }}>✨</div>
                  <div>
                    <p className="font-dm font-medium" style={{ color: '#F0F2F7', fontSize: 14 }}>Gemini API Key</p>
                    <p className="font-dm" style={{ color: '#4B5060', fontSize: 12 }}>From aistudio.google.com/apikey</p>
                  </div>
                  {s.geminiApiKey && (
                    <span className="chip" style={{ marginLeft: 'auto', background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.22)', fontSize: 11 }}>
                      ✓ Active
                    </span>
                  )}
                </div>
                <input
                  id="gemini-api-key"
                  type="password"
                  className="input"
                  placeholder="AIza..."
                  value={s.geminiApiKey || ''}
                  onChange={e => {
                    const v = e.target.value;
                    update('geminiApiKey', v);
                    localStorage.setItem('xecute_gemini_key', v);
                  }}
                  style={{ fontSize: 13 }}
                />
              </div>
              <Row
                label="AI Insight Frequency"
                right={
                  <select
                    className="input"
                    style={{ padding: '8px 10px', fontSize: 13, width: 130 }}
                    value={s.aiInsightFrequency}
                    onChange={e => update('aiInsightFrequency', e.target.value)}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="ondemand">On Demand</option>
                  </select>
                }
                noBorder
              />
            </>
          )}
        </Section>

        {/* Cloud Sync & Security */}
        <Section title="🔒 Cloud Sync & Security">
          {!currentUser ? (
            <div style={{ padding: '16px 18px' }}>
              <p className="font-dm" style={{ color: '#8B90A0', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                Sign in to secure your data on the cloud. Create any ID and password; no verification is needed.
              </p>
              <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <input
                    type="text"
                    className="input"
                    required
                    placeholder="Username / ID"
                    value={authUsername}
                    onChange={e => setAuthUsername(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
                <div>
                  <input
                    type="password"
                    className="input"
                    required
                    placeholder="Password"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </div>
                
                {authMessage && (
                  <p className="font-dm" style={{ fontSize: 12.5, color: authMessage.startsWith('❌') ? '#EF4444' : '#22C55E', textAlign: 'center', marginTop: 4 }}>
                    {authMessage}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                  <button
                    type="submit"
                    onClick={() => setAuthMode('login')}
                    className="btn btn-primary"
                    disabled={authLoading}
                    style={{ flex: 1, height: 42, fontSize: 13 }}
                  >
                    {authLoading && authMode === 'login' ? 'Logging in...' : '🔑 Log In'}
                  </button>
                  <button
                    type="submit"
                    onClick={() => setAuthMode('signup')}
                    className="btn btn-ghost"
                    disabled={authLoading}
                    style={{ flex: 1, height: 42, fontSize: 13 }}
                  >
                    {authLoading && authMode === 'signup' ? 'Signing up...' : '📝 Sign Up'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p className="font-dm font-semibold" style={{ color: '#F0F2F7', fontSize: 14.5 }}>
                    👤 Signed in as <span style={{ color: AMBER }}>{currentUser}</span>
                  </p>
                  <p className="font-dm" style={{ color: '#4B5060', fontSize: 12, marginTop: 2 }}>
                    Cloud Sync is active and secured.
                  </p>
                </div>
                <button
                  onClick={handleLogOut}
                  className="btn btn-ghost"
                  style={{ height: 32, padding: '0 12px', fontSize: 11, color: '#EF4444', borderColor: 'rgba(239,68,68,0.2)' }}
                >
                  Log Out
                </button>
              </div>

              <Row 
                label="Auto-sync on focus" 
                sublabel="Automatically backup after completing focus sessions"
                right={<Toggle id="auto-sync-cloud" value={autoSync} onChange={toggleAutoSync} />} 
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button
                  onClick={handleSyncNow}
                  className="btn btn-primary"
                  disabled={syncing}
                  style={{ flex: 1, height: 44, fontSize: 13 }}
                >
                  {syncing ? '⌛ Syncing...' : '📤 Backup to Cloud'}
                </button>
              </div>

              {/* Backups List */}
              <div style={{ marginTop: 8 }}>
                <p className="section-label" style={{ fontSize: 11, marginBottom: 8, color: '#8B90A0' }}>Backup Restore Points (Max 5)</p>
                {backups.length === 0 ? (
                  <p className="font-dm" style={{ color: '#4B5060', fontSize: 12, fontStyle: 'italic', paddingLeft: 4 }}>
                    No cloud backups found. Click backup above.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {backups.map((b, idx) => (
                      <div 
                        key={b.timestamp} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between', 
                          padding: '10px 12px', 
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.01)',
                          border: '1px solid rgba(255,255,255,0.03)'
                        }}
                      >
                        <div>
                          <p className="font-dm font-medium" style={{ fontSize: 12, color: '#F0F2F7' }}>{b.label}</p>
                          <p className="font-dm" style={{ fontSize: 10, color: '#4B5060', marginTop: 2 }}>Encrypted client-side</p>
                        </div>
                        <button
                          onClick={() => handleRestoreNow(idx)}
                          className="btn btn-ghost"
                          style={{ height: 28, padding: '0 10px', fontSize: 11, color: CYAN, borderColor: 'rgba(0,201,255,0.2)' }}
                          disabled={restoring}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Data & Sync */}
        <Section title="Data & Sync">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button className="btn btn-ghost" style={{ width: '100%', height: 46, fontSize: 14 }} onClick={handleExport}>
              📤 Export All Data (JSON)
            </button>
          </div>
          <div style={{ padding: '14px 18px' }}>
            {!showClearConfirm ? (
              <button className="btn btn-danger" style={{ width: '100%', height: 46, fontSize: 14 }} onClick={() => setShowClearConfirm(true)}>
                🗑 Clear All Data
              </button>
            ) : (
              <div className="glass-amber" style={{ borderRadius: 14, padding: 16 }}>
                <p className="font-dm" style={{ color: '#F0F2F7', fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
                  ⚠️ This will permanently delete all plans, tasks, and sessions.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, height: 44 }} onClick={() => setShowClearConfirm(false)}>Cancel</button>
                  <button className="btn btn-danger" style={{ flex: 1, height: 44 }} onClick={handleClearAll}>Confirm Delete</button>
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          {canInstall && (
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <button className="btn btn-primary" style={{ width: '100%', height: 46, fontSize: 14 }} onClick={install}>
                📲 Install Xecute as App
              </button>
            </div>
          )}
          {isInstalled && (
            <Row label="✅ Xecute is installed" sublabel="Running as standalone PWA" noBorder right={null} />
          )}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button className="btn btn-ghost" style={{ width: '100%', height: 46, fontSize: 14 }} onClick={handleShare}>
              🔗 Share Xecute
            </button>
          </div>
          <Row label="Version" right={<span className="font-dm" style={{ color: '#4B5060', fontSize: 13 }}>1.0.0</span>} />
          <Row label="Tagline" noBorder right={<span className="font-dm" style={{ color: '#F5A623', fontSize: 13, fontStyle: 'italic' }}>Do it now.</span>} />
        </Section>

        {/* Save indicator */}
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 9999, padding: '8px 18px', zIndex: 40,
            }}
          >
            <span className="font-dm" style={{ color: '#22C55E', fontSize: 13 }}>✓ Saved</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
