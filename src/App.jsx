import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
  doc, getDoc, collection, query, where, onSnapshot, 
  updateDoc, serverTimestamp, getDocs, writeBatch 
} from 'firebase/firestore';
import { auth, db } from './firebase';
import AuthScreen     from './components/AuthScreen';
import PGMemberHome  from './components/StudentHome';

import MessHome       from './components/MessHome';
import AdminHome      from './components/AdminHome';
import AdminPayment   from './components/AdminPayment';
import Chat           from './components/Chat';
import Payment        from './components/Payment';
import SmartAssistant from './components/SmartAssistant';
import NotificationsPage from './components/NotificationsPage';
import { HomeIcon, ChatIcon, PaymentIcon, SparklesIcon, BellIcon } from './components/Icons';
import { 
  requestNotificationPermission, registerFCMToken, 
  setupForegroundMessageListener, runPaymentReminderCheck 
} from './services/notificationService';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const USER_TYPE_LABELS = {
  admin:       'Admin',
  pg_member:   'PG Member',
  mess_member: 'Mess Member',
};
const USER_TYPE_COLORS = {
  admin:       '#6366f1',
  pg_member:   '#10b981',
  mess_member: '#f59e0b',
};

function App() {
  const [userType,    setUserType]    = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab,   setActiveTab]   = useState('home');
  const [loading,     setLoading]     = useState(true);
  
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [lastReadChat, setLastReadChat] = useState(null);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activePopup, setActivePopup] = useState(null);

  // Swipe Gesture Navigation
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchEndX, setTouchEndX] = useState(0);
  const [touchEndY, setTouchEndY] = useState(0);

  const handleTouchStart = (e) => {
    const target = e.target;
    // Don't trigger swiping if touching inputs, textareas, scrollable suggestions, etc.
    const isInteractive = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.closest('input') || 
                          target.closest('textarea') || 
                          target.closest('.nt-categories') || 
                          target.closest('.sa-suggestions') || 
                          target.closest('.ap-summary-row') || 
                          target.closest('.chat-messages') || 
                          target.closest('.sa-messages-area') || 
                          target.closest('.calendar-grid');
    if (isInteractive) {
      setTouchStartX(0);
      setTouchStartY(0);
      setTouchEndX(0);
      setTouchEndY(0);
      return;
    }

    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e) => {
    if (!touchStartX) return;
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (!touchStartX || !touchEndX) return;
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    const minDistance = 60; // minimum horizontal pixels for swipe trigger

    // Make sure it's a primary horizontal swipe gesture
    if (Math.abs(diffX) > minDistance && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      const isAdmin    = userType === 'admin';
      const isPGMember = userType === 'pg_member';

      // Define tab order for current user
      const tabs = ['home'];
      if (isAdmin || isPGMember) {
        tabs.push('chat');
      }
      tabs.push('payment');
      if (!isAdmin) {
        tabs.push('assistant');
      }

      const currentIndex = tabs.indexOf(activeTab);
      if (currentIndex !== -1) {
        if (diffX > 0 && currentIndex < tabs.length - 1) {
          // Swipe Left -> Next Tab
          setActiveTab(tabs[currentIndex + 1]);
        } else if (diffX < 0 && currentIndex > 0) {
          // Swipe Right -> Previous Tab
          setActiveTab(tabs[currentIndex - 1]);
        }
      }
    }

    // Reset touch coordinates for next gesture
    setTouchStartX(0);
    setTouchStartY(0);
    setTouchEndX(0);
    setTouchEndY(0);
  };

  const handleTouchCancel = () => {
    setTouchStartX(0);
    setTouchStartY(0);
    setTouchEndX(0);
    setTouchEndY(0);
  };

  const handleLogin = (resolvedUserType) => setUserType(resolvedUserType);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserType(null);
      setCurrentUser(null);
      setActiveTab('home');
      setShowProfileModal(false);
    } catch {
      alert('Error signing out. Please try again.');
    }
  };



  // ── Listen to notification permission, background setup, active tab, and reminders ──
  useEffect(() => {
    if (currentUser?.uid) {
      if (Notification.permission === 'granted') {
        registerFCMToken(currentUser.uid);
      } else if (Notification.permission === 'default') {
        const hasAsked = localStorage.getItem('hasRequestedNotifications');
        if (!hasAsked) {
          setTimeout(() => setShowPermissionPrompt(true), 1500);
        }
      }

      setupForegroundMessageListener();
      runPaymentReminderCheck();
    }
  }, [currentUser?.uid]);

  // Keep Firestore active tab state synchronized
  useEffect(() => {
    if (currentUser?.uid) {
      updateDoc(doc(db, 'users', currentUser.uid), {
        currentActiveTab: activeTab,
        lastActiveAt: serverTimestamp()
      }).catch(err => console.error('Error updating active tab', err));
    }
  }, [activeTab, currentUser?.uid]);

  // Listen to unread notifications count
  useEffect(() => {
    if (!currentUser?.uid) {
      console.log("[Firestore Query Blocked] Collection: 'notifications' (unread count), Auth State: Unauthenticated (currentUser is null)");
      return;
    }
    console.log("[Firestore Query] Collection: 'notifications' (unread count), Auth State: Authenticated, User UID:", currentUser.uid);
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUser.uid),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      setUnreadNotificationsCount(snap.size);
    }, (err) => console.error('Notifications count listener error:', err));
    return () => unsub();
  }, [currentUser?.uid]);

  // Real-time listener for developer app updates popup
  useEffect(() => {
    if (!currentUser?.uid) {
      console.log("[Firestore Query Blocked] Collection: 'app_updates' (popup), Auth State: Unauthenticated (currentUser is null)");
      return;
    }
    console.log("[Firestore Query] Collection: 'app_updates' (popup), Auth State: Authenticated, User UID:", currentUser.uid);
    const q = query(
      collection(db, 'app_updates'),
      where('active', '==', true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (list.length === 0) {
        setActivePopup(null);
        return;
      }

      // Sort by createdAt descending (newest first)
      list.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt || 0);
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt || 0);
        return bTime - aTime;
      });

      // Show the latest update if not already dismissed by user
      const dismissed = JSON.parse(localStorage.getItem('dismissed_updates') || '[]');
      const latest = list[0];
      if (!dismissed.includes(latest.id)) {
        setActivePopup(latest);
      } else {
        setActivePopup(null);
      }
    }, (err) => console.error("Popup updates query error:", err));
    return () => unsub();
  }, [currentUser?.uid]);

  // Auto-mark notifications as read when entering notifications tab
  useEffect(() => {
    if (activeTab === 'notifications' && currentUser?.uid) {
      console.log("[Firestore Query] Collection: 'notifications' (mark read), Auth State: Authenticated, User UID:", currentUser.uid);
      const markAllAsRead = async () => {
        try {
          const q = query(
            collection(db, 'notifications'),
            where('userId', '==', currentUser.uid),
            where('read', '==', false)
          );
          const snap = await getDocs(q);
          if (snap.empty) return;
          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            batch.update(doc(db, 'notifications', d.id), { read: true });
          });
          await batch.commit();
        } catch (err) {
          console.error('Error marking notifications read on tab enter:', err);
        }
      };
      markAllAsRead();
    }
  }, [activeTab, currentUser?.uid]);

  // Listen to user lastReadChatTimestamp
  useEffect(() => {
    if (!currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLastReadChat(data.lastReadChatTimestamp ? (data.lastReadChatTimestamp.toDate ? data.lastReadChatTimestamp.toDate() : new Date(data.lastReadChatTimestamp)) : new Date(0));
      }
    });
    return () => unsub();
  }, [currentUser?.uid]);

  // Listen to messages to count unread messages
  useEffect(() => {
    if (!currentUser?.uid || lastReadChat === null) {
      console.log("[Firestore Query Blocked] Collection: 'messages' (unread count), Auth State: Unauthenticated or lastReadChat is null");
      return;
    }
    console.log("[Firestore Query] Collection: 'messages' (unread count), Auth State: Authenticated, User UID:", currentUser.uid);
    const q = query(collection(db, 'messages'));
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        const senderId = data.userId;
        if (senderId === currentUser.uid) return; // ignore own messages

        const msgTime = data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)) : null;
        if (msgTime && msgTime > lastReadChat) {
          count++;
        }
      });
      setUnreadChatCount(count);
    });
    return () => unsub();
  }, [currentUser?.uid, lastReadChat]);

  // Reset chat count when viewing chat
  useEffect(() => {
    if (activeTab === 'chat' && currentUser?.uid && unreadChatCount > 0) {
      updateDoc(doc(db, 'users', currentUser.uid), {
        lastReadChatTimestamp: new Date()
      }).catch(e => console.error("Error updating lastReadChatTimestamp", e));
    }
  }, [activeTab, currentUser?.uid, unreadChatCount]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            const resolvedType =
              data.userType ||
              (data.role === 'admin' ? 'admin' : 'pg_member');

            setUserType(resolvedType);
            setCurrentUser({
              uid:      user.uid,
              userType: resolvedType,
              role:     resolvedType, // same as userType — no more 'student'
              name:     data.fullName || data.name || data.username || 'User',
              fullName: data.fullName || data.name || '',
              username: data.username || '',
              ...data,
            });
          } else {
            setUserType(null);
            setCurrentUser(null);
          }
        } catch (err) {
          console.error('Error fetching user:', err);
          setUserType(null);
          setCurrentUser(null);
        }
      } else {
        setUserType(null);
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', gap: '16px',
      }}>
        <div className="chat-spinner" style={{ width: '40px', height: '40px', borderWidth: '4px' }} />
        <div style={{ color: '#6b7280', fontSize: '15px' }}>Loading…</div>
      </div>
    );
  }

  if (!userType) return <AuthScreen onLogin={handleLogin} />;

  const isAdmin    = userType === 'admin';
  const isPGMember = userType === 'pg_member';
  const isMess     = userType === 'mess_member';

  return (
    <div className="app-container">

      {/* ── Top Header Bar ── */}
      <div className="top-header no-print">
        <div className="top-header-brand">
          Sri Sai PG
        </div>
        <div className="top-header-actions">
          {/* Bell Icon button */}
          <button
            onClick={() => setActiveTab('notifications')}
            className={`bell-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            title="Notifications"
          >
            <BellIcon className="nav-icon" style={{ width: '20px', height: '20px', color: activeTab === 'notifications' ? '#4f46e5' : '#4b5563' }} />
            {unreadNotificationsCount > 0 && (
              <span className="wa-badge bell-badge">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          <div
            className="role-badge"
            style={{
              background: USER_TYPE_COLORS[userType] + '20',
              color: USER_TYPE_COLORS[userType],
              border: `1px solid ${USER_TYPE_COLORS[userType]}40`,
              cursor: 'pointer'
            }}
            onClick={() => setShowProfileModal(true)}
            title="View Profile & Settings"
          >
            {USER_TYPE_LABELS[userType]}
          </div>
          <button
            onClick={handleLogout}
            className="logout-btn"
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div 
        className="main-app"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Home tab */}
        {activeTab === 'home' && (
          isAdmin    ? <AdminHome  currentUser={currentUser} /> :
          isPGMember ? <PGMemberHome currentUser={currentUser} /> :

                       <MessHome   currentUser={currentUser} />
        )}

        {/* Chat — PG Members and Admin only (NOT mess members) */}
        {activeTab === 'chat' && (isAdmin || isPGMember) && (
          <Chat currentUser={currentUser} />
        )}

        {/* Payment — members see their own bill; admin sees full report */}
        {activeTab === 'payment' && !isAdmin && (
          <Payment userType={userType} currentUser={currentUser} />
        )}
        {activeTab === 'payment' && isAdmin && (
          <AdminPayment />
        )}

        {/* Smart Assistant — PG Members + Mess Members only (not admin) */}
        {activeTab === 'assistant' && !isAdmin && (
          <SmartAssistant currentUser={currentUser} />
        )}

        {/* Notifications tab */}
        {activeTab === 'notifications' && (
          <NotificationsPage currentUser={currentUser} />
        )}

      </div>

      {/* ── Bottom navigation ── */}
      <div className="bottom-nav no-print">
        {/* Home — all users */}
        <button
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <HomeIcon className="nav-icon" />
          <div className="nav-label">Home</div>
        </button>

        {/* Chat — PG Members + Admin only */}
        {(isAdmin || isPGMember) && (
          <button
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <div style={{ position: 'relative' }}>
              <ChatIcon className="nav-icon" />
              {unreadChatCount > 0 && (
                <span className="wa-badge chat-badge">
                  {unreadChatCount}
                </span>
              )}
            </div>
            <div className="nav-label">Chat</div>
          </button>
        )}

        {/* Payment — all users (admin sees full report, members see own bill) */}
        <button
          className={`nav-item ${activeTab === 'payment' ? 'active' : ''}`}
          onClick={() => setActiveTab('payment')}
        >
          <PaymentIcon className="nav-icon" />
          <div className="nav-label">{isAdmin ? 'Payments' : 'Payment'}</div>
        </button>

        {/* Smart Assistant — members only */}
        {!isAdmin && (
          <button
            className={`nav-item ${activeTab === 'assistant' ? 'active' : ''}`}
            onClick={() => setActiveTab('assistant')}
          >
            <SparklesIcon className="nav-icon" />
            <div className="nav-label">Assistant</div>
          </button>
        )}
      </div>

      {/* ── Custom Notification Permission Modal ── */}
      {showPermissionPrompt && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal" style={{ maxWidth: '400px', padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
            <h3 style={{ fontSize: '18px', fontWeight: '800', marginBottom: '8px' }}>Enable Notifications</h3>
            <p style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.5', marginBottom: '24px' }}>
              Allow notifications to receive announcements, payment reminders, and chat updates.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="cancel-btn"
                style={{ flex: 1, padding: '10px' }}
                onClick={() => {
                  localStorage.setItem('hasRequestedNotifications', 'true');
                  setShowPermissionPrompt(false);
                }}
              >
                Not Now
              </button>
              <button
                style={{
                  flex: 1,
                  padding: '10px',
                  background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
                onClick={async () => {
                  localStorage.setItem('hasRequestedNotifications', 'true');
                  setShowPermissionPrompt(false);
                  await requestNotificationPermission(currentUser.uid);
                }}
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── My Profile & Settings Modal ── */}
      {showProfileModal && (
        <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setShowProfileModal(false)}>
          <div className="modal profile-modal" style={{ maxWidth: '380px', padding: '24px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#111827' }}>My Profile</h3>
              <button className="modal-close" onClick={() => setShowProfileModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#9ca3af' }}>✕</button>
            </div>
            
            <div style={{ marginBottom: '20px', padding: '16px', background: '#f9fafb', borderRadius: '12px', textAlign: 'left', border: '1px solid #f3f4f6' }}>
              <div style={{ fontSize: '17px', fontWeight: '800', color: '#111827', marginBottom: '4px' }}>
                {currentUser?.fullName || currentUser?.name || 'User'}
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px', fontFamily: 'monospace' }}>
                @{currentUser?.username || 'username'}
              </div>
              <div style={{ display: 'inline-block', padding: '4px 10px', background: USER_TYPE_COLORS[userType] + '20', color: USER_TYPE_COLORS[userType], borderRadius: '8px', fontSize: '11px', fontWeight: '700', border: `1px solid ${USER_TYPE_COLORS[userType]}40` }}>
                {USER_TYPE_LABELS[userType]}
              </div>
            </div>

            <button
              className="cancel-btn"
              style={{ width: '100%', padding: '12px', fontSize: '14px' }}
              onClick={() => setShowProfileModal(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Custom In-App Developer Update Popup Modal ── */}
      {activePopup && (
        <div className="modal-overlay popup-overlay" style={{ zIndex: 3000 }}>
          <div className="modal popup-modal" style={{ maxWidth: '440px', padding: '28px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
            <div className="popup-badge" style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#e0e7ff', color: '#4f46e5' }}>
              What's New {activePopup.version ? `v${activePopup.version}` : ''}
            </div>
            
            <h3 className="popup-title" style={{ fontSize: '20px', fontWeight: '900', color: '#111827', marginBottom: '12px', lineHeight: '1.3' }}>
              {activePopup.title}
            </h3>
            
            <p className="popup-message" style={{ fontSize: '14px', color: '#4b5563', lineHeight: '1.6', marginBottom: '28px', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
              {activePopup.message}
            </p>
            
            <button
              className="popup-got-it-btn"
              style={{
                width: '100%',
                padding: '12px',
                background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
                transition: 'all 0.2s'
              }}
              onClick={() => {
                const dismissed = JSON.parse(localStorage.getItem('dismissed_updates') || '[]');
                dismissed.push(activePopup.id);
                localStorage.setItem('dismissed_updates', JSON.stringify(dismissed));
                setActivePopup(null);
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;