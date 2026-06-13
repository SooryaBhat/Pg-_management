import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { CloseIcon, UserIcon } from './Icons';

const USER_TYPE_LABELS = { admin: 'Admin', pg_member: 'PG Member', mess_member: 'Mess Member' };
const USER_TYPE_COLORS = { admin: '#6366f1', pg_member: '#10b981', mess_member: '#f59e0b' };

// ─── Edit modal ───────────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState({
    fullName: user.fullName || user.name || '',
    userType: user.userType || 'pg_member',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.fullName.trim()) { alert('Name cannot be empty'); return; }
    setSaving(true);
    try {
      await onSave(user.uid, {
        fullName: form.fullName.trim(),
        name:     form.fullName.trim(),   // legacy compat
        userType: form.userType,
        role:     form.userType, // matches userType — no 'student' value
      });
      onClose();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit User</h3>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="modal-body">
          <div className="um-field">
            <label className="um-label">Full Name</label>
            <input
              className="form-input"
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              placeholder="Full name"
            />
          </div>
          <div className="um-field">
            <label className="um-label">User Type</label>
            <div className="um-role-picker">
              {['pg_member', 'mess_member', 'admin'].map(t => (
                <button
                  key={t}
                  className={`um-role-btn ${form.userType === t ? 'selected' : ''}`}
                  style={{ '--role-color': USER_TYPE_COLORS[t] }}
                  onClick={() => setForm({ ...form, userType: t })}
                >
                  {USER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="um-actions">
            <button className="cancel-btn" onClick={onClose}>Cancel</button>
            <button className="um-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main UserManagement component ───────────────────────────────────────────
function UserManagement() {
  const [users,      setUsers]      = useState([]);
  const [tab,        setTab]        = useState('pg_member');   // 'pg_member' | 'mess_member' | 'admin'
  const [search,     setSearch]     = useState('');
  const [loading,    setLoading]    = useState(true);
  const [editUser,   setEditUser]   = useState(null);
  const [removing,   setRemoving]   = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list = snap.docs.map(d => ({
        uid: d.id,
        ...d.data(),
        // normalise userType for legacy users
        userType: d.data().userType || (d.data().role === 'admin' ? 'admin' : 'pg_member'),
        displayName: d.data().fullName || d.data().name || d.data().username || 'Unknown',
      }));
      setUsers(list);
    } catch (err) {
      alert('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSave = async (uid, updates) => {
    await updateDoc(doc(db, 'users', uid), updates);
    await loadUsers();
  };

  const handleRemove = async (user) => {
    if (!window.confirm(`Remove ${user.displayName}? This only removes their Firestore data. Firebase Auth account remains.`)) return;
    setRemoving(user.uid);
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await loadUsers();
    } catch (err) {
      alert('Failed to remove: ' + err.message);
    } finally {
      setRemoving(null);
    }
  };

  const filtered = users
    .filter(u => u.userType === tab)
    .filter(u =>
      !search ||
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase())
    );

  const counts = {
    pg_member:   users.filter(u => u.userType === 'pg_member').length,
    mess_member: users.filter(u => u.userType === 'mess_member').length,
    admin:       users.filter(u => u.userType === 'admin').length,
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="um-container">
      {/* Header */}
      <div className="um-header">
        <h2 className="um-title">User Management</h2>
        <p className="um-subtitle">Manage all members</p>
      </div>

      {/* Summary cards */}
      <div className="um-summary-row">
        <div className="um-summary-card" style={{ borderColor: '#10b981' }}>
          <div className="um-summary-num" style={{ color: '#10b981' }}>{counts.pg_member}</div>
          <div className="um-summary-lbl">PG Members</div>
        </div>
        <div className="um-summary-card" style={{ borderColor: '#f59e0b' }}>
          <div className="um-summary-num" style={{ color: '#f59e0b' }}>{counts.mess_member}</div>
          <div className="um-summary-lbl">Mess Members</div>
        </div>
        <div className="um-summary-card" style={{ borderColor: '#6366f1' }}>
          <div className="um-summary-num" style={{ color: '#6366f1' }}>{counts.admin}</div>
          <div className="um-summary-lbl">Admins</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="um-tabs">
        {[['pg_member', '🏠 PG Members'], ['mess_member', '🍽 Mess Members'], ['admin', '🔑 Admins']].map(([key, label]) => (
          <button
            key={key}
            className={`um-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            <span className="um-tab-count">{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="um-search-wrap">
        <input
          className="um-search"
          placeholder="Search by name or username…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="um-search-clear" onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* User list */}
      {loading ? (
        <div className="um-loading">
          <div className="chat-spinner" />
          <div className="um-loading-text">Loading users…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="um-empty">
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
          <div className="um-empty-text">
            {search ? 'No users match your search' : `No ${USER_TYPE_LABELS[tab]}s yet`}
          </div>
        </div>
      ) : (
        <div className="um-list">
          {filtered.map(user => (
            <div key={user.uid} className="um-card">
              {/* Avatar */}
              <div
                className="um-avatar"
                style={{ background: USER_TYPE_COLORS[user.userType] }}
              >
                {(user.displayName[0] || '?').toUpperCase()}
              </div>

              {/* Info */}
              <div className="um-info">
                <div className="um-name">{user.displayName}</div>
                <div className="um-username">@{user.username || '—'}</div>
                <div className="um-meta">
                  <span
                    className="um-role-badge"
                    style={{ background: USER_TYPE_COLORS[user.userType] + '20', color: USER_TYPE_COLORS[user.userType] }}
                  >
                    {USER_TYPE_LABELS[user.userType]}
                  </span>
                  <span className="um-date">Joined {formatDate(user.createdAt)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="um-card-actions">
                <button
                  className="um-edit-btn"
                  onClick={() => setEditUser(user)}
                >
                  ✏️
                </button>
                <button
                  className="um-remove-btn"
                  onClick={() => handleRemove(user)}
                  disabled={removing === user.uid}
                >
                  {removing === user.uid ? '…' : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refresh button */}
      <button className="refresh-button" onClick={loadUsers} disabled={loading} style={{ margin: '16px 0' }}>
        🔄 Refresh
      </button>

      {/* Edit modal */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

export default UserManagement;
