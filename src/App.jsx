import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import AuthScreen     from './components/AuthScreen';
import PGMemberHome  from './components/StudentHome';

import MessHome       from './components/MessHome';
import AdminHome      from './components/AdminHome';
import UserManagement from './components/UserManagement';
import AdminPayment   from './components/AdminPayment';
import Chat           from './components/Chat';
import Payment        from './components/Payment';
import { HomeIcon, ChatIcon, PaymentIcon, UsersIcon } from './components/Icons';

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

  const handleLogin = (resolvedUserType) => setUserType(resolvedUserType);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUserType(null);
      setCurrentUser(null);
      setActiveTab('home');
    } catch {
      alert('Error signing out. Please try again.');
    }
  };

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

      {/* ── Top-right: role badge + logout ── */}
      <div style={{
        position: 'fixed', top: '12px', right: '12px',
        zIndex: 1000, display: 'flex', alignItems: 'center', gap: '8px',
      }} className="no-print">
        <div style={{
          padding: '4px 10px',
          background: USER_TYPE_COLORS[userType] + '20',
          color: USER_TYPE_COLORS[userType],
          borderRadius: '12px', fontSize: '12px', fontWeight: '700',
          border: `1px solid ${USER_TYPE_COLORS[userType]}40`,
        }}>
          {USER_TYPE_LABELS[userType]}
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 14px', background: '#ef4444', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>

      {/* ── Main content ── */}
      <div className="main-app">
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

        {/* Users — admin only */}
        {activeTab === 'users' && isAdmin && <UserManagement />}
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
            <ChatIcon className="nav-icon" />
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

        {/* Users — admin only */}
        {isAdmin && (
          <button
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <UsersIcon className="nav-icon" />
            <div className="nav-label">Users</div>
          </button>
        )}
      </div>
    </div>
  );
}

export default App;