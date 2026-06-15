import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { 
  collection, query, where, orderBy, onSnapshot, 
  doc, updateDoc, writeBatch, getDocs, deleteDoc 
} from 'firebase/firestore';

const CATEGORIES = [
  { id: 'all',              label: 'All 🔔' },
  { id: 'announcements',    label: 'Announcements 📢' },
  { id: 'chat',             label: 'Chat Messages 💬' },
  { id: 'payment_reminder', label: 'Reminders ⏳' },
  { id: 'payment_status',   label: 'Payments 💳' },
  { id: 'system',           label: 'System ⚙️' }
];

const CATEGORY_STYLES = {
  announcements:    { color: '#6366f1', bg: '#ede9fe', icon: '📢' },
  chat:             { color: '#10b981', bg: '#d1fae5', icon: '💬' },
  payment_reminder: { color: '#f59e0b', bg: '#fef3c7', icon: '⏳' },
  payment_status:   { color: '#ec4899', bg: '#fce7f3', icon: '💳' },
  system:           { color: '#6b7280', bg: '#f3f4f6', icon: '⚙️' }
};

function NotificationsPage({ currentUser }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');

  // Load user notifications in real-time
  useEffect(() => {
    if (!currentUser?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(d.data().createdAt)
      })));
      setLoading(false);
    }, (err) => {
      console.error('Error fetching notifications:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const handleMarkAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleClearNotification = async (notificationId) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      if (unread.length === 0) return;

      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error('Error marking all as read:', err);
    }
  };

  const handleClearAll = async () => {
    const confirmClear = window.confirm('Are you sure you want to clear all notifications?');
    if (!confirmClear) return;
    
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => {
        batch.delete(doc(db, 'notifications', n.id));
      });
      await batch.commit();
    } catch (err) {
      console.error('Error clearing all notifications:', err);
    }
  };

  const filtered = notifications.filter(n => {
    if (activeCategory === 'all') return true;
    return n.type === activeCategory;
  });

  const formatDate = (date) => {
    if (!date) return '';
    try {
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="nt-container">
      {/* Header */}
      <div className="nt-header">
        <div>
          <h2 className="nt-title">Notifications</h2>
          <p className="nt-subtitle">Stay updated with PG events and alerts</p>
        </div>
        {notifications.length > 0 && (
          <div className="nt-header-actions">
            <button className="nt-action-btn read" onClick={handleMarkAllRead}>
              ✓ Mark All Read
            </button>
            <button className="nt-action-btn clear" onClick={handleClearAll}>
              🗑 Clear All
            </button>
          </div>
        )}
      </div>

      {/* Category Pills */}
      <div className="nt-categories">
        {CATEGORIES.map(cat => {
          const count = cat.id === 'all' 
            ? notifications.filter(n => !n.read).length
            : notifications.filter(n => n.type === cat.id && !n.read).length;

          return (
            <button
              key={cat.id}
              className={`nt-category-pill ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
              {count > 0 && <span className="nt-pill-badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Feed List */}
      {loading ? (
        <div className="nt-loading">
          <div className="chat-spinner" />
          <div className="nt-loading-text">Loading notifications…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="nt-empty">
          <div className="nt-empty-icon">🔔</div>
          <div className="nt-empty-title">No notifications</div>
          <div className="nt-empty-sub">
            {activeCategory === 'all' 
              ? "You're all caught up! No notifications found." 
              : "No notifications in this category."}
          </div>
        </div>
      ) : (
        <div className="nt-list">
          {filtered.map(item => {
            const style = CATEGORY_STYLES[item.type] || CATEGORY_STYLES.system;
            return (
              <div 
                key={item.id} 
                className={`nt-card ${item.read ? 'read' : 'unread'}`}
              >
                {/* Category Icon */}
                <div 
                  className="nt-icon-wrapper" 
                  style={{ background: style.bg, color: style.color }}
                >
                  {style.icon}
                </div>

                {/* Content */}
                <div className="nt-content">
                  <div className="nt-card-header">
                    <span className="nt-card-title">{item.title}</span>
                    <span className="nt-card-time">{formatDate(item.createdAt)}</span>
                  </div>
                  <p className="nt-card-message">{item.message}</p>
                </div>

                {/* Action buttons */}
                <div className="nt-card-actions">
                  {!item.read && (
                    <button 
                      className="nt-btn-read" 
                      onClick={() => handleMarkAsRead(item.id)}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button 
                    className="nt-btn-clear" 
                    onClick={() => handleClearNotification(item.id)}
                    title="Clear notification"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default NotificationsPage;
