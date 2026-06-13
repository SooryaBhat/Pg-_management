import { useState, useEffect } from 'react';
import { MegaphoneIcon, ChevronLeft, ChevronRight, CloseIcon, UserIcon } from './Icons';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

// Mess Members: food polling only — no rent, no PG-specific features

function MessHome() {
  const [breakfast,      setBreakfast]      = useState(false);
  const [dinner,         setDinner]         = useState(false);
  const [selectedDates,  setSelectedDates]  = useState({});
  const [currentMonth,   setCurrentMonth]   = useState(new Date());
  const [showModal,      setShowModal]      = useState(null);
  const [showVotersModal,setShowVotersModal]= useState(false);
  const [todayVoters,    setTodayVoters]    = useState({ breakfast: [], dinner: [] });
  const [announcement,   setAnnouncement]   = useState('');
  const [loading,        setLoading]        = useState(false);
  const [votersLoading,  setVotersLoading]  = useState(false);

  const today       = new Date();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay    = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthName   = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayDate   = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const todayKey = formatDateKey(today);

  // Announcement listener
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'announcements', 'current'), (d) => {
      if (d.exists()) setAnnouncement(d.data().text || '');
    }, () => {});
    return () => unsub();
  }, []);

  // Today's food selection listener
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(
      doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`),
      (snap) => {
        if (snap.exists()) {
          setBreakfast(snap.data().breakfast || false);
          setDinner(snap.data().dinner || false);
        } else {
          setBreakfast(false);
          setDinner(false);
        }
      }
    );
    return () => unsub();
  }, [todayKey]);

  // Load advance selections for current month
  useEffect(() => {
    const load = async () => {
      if (!auth.currentUser) return;
      const uid      = auth.currentUser.uid;
      const year     = currentMonth.getFullYear();
      const month    = currentMonth.getMonth();
      const days     = new Date(year, month + 1, 0).getDate();
      const result   = {};
      for (let d = 1; d <= days; d++) {
        const dk = formatDateKey(new Date(year, month, d));
        const snap = await getDoc(doc(db, 'foodSelections', `${uid}_${dk}`));
        if (snap.exists()) {
          const { breakfast: b, dinner: d2 } = snap.data();
          if (b && d2) result[dk] = 'both';
          else if (b)  result[dk] = 'breakfast';
          else if (d2) result[dk] = 'dinner';
        }
      }
      setSelectedDates(result);
    };
    load();
  }, [currentMonth]);

  // Save today's selection
  const saveTodaySelection = async (isBreakfast, value) => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const nb = isBreakfast ? value : breakfast;
      const nd = !isBreakfast ? value : dinner;
      await setDoc(
        doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`),
        { userId: auth.currentUser.uid, date: todayKey, breakfast: nb, dinner: nd, timestamp: new Date() },
        { merge: true }
      );
    } catch (err) {
      alert('Failed to save: ' + err.message);
      if (isBreakfast) setBreakfast(!value);
      else setDinner(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleBreakfastToggle = () => { const v = !breakfast; setBreakfast(v); saveTodaySelection(true, v); };
  const handleDinnerToggle    = () => { const v = !dinner;    setDinner(v);    saveTodaySelection(false, v); };

  // Save advance selection
  const handleSelection = async (type) => {
    if (!auth.currentUser) return;
    try {
      const b = type === 'both' || type === 'breakfast';
      const d = type === 'both' || type === 'dinner';
      await setDoc(
        doc(db, 'foodSelections', `${auth.currentUser.uid}_${showModal}`),
        { userId: auth.currentUser.uid, date: showModal, breakfast: b || false, dinner: d || false, timestamp: new Date() }
      );
      if (!type) {
        const nd = { ...selectedDates }; delete nd[showModal]; setSelectedDates(nd);
      } else {
        setSelectedDates({ ...selectedDates, [showModal]: type });
      }
    } catch (err) {
      alert('Failed to save: ' + err.message);
    }
    setShowModal(null);
  };

  // View today's voters
  const loadTodayVoters = async () => {
    setVotersLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'foodSelections'), where('date', '==', todayKey)));
      const bVoters = [], dVoters = [];
      for (const s of snap.docs) {
        const sel  = s.data();
        const uDoc = await getDoc(doc(db, 'users', sel.userId));
        const name = uDoc.exists() ? (uDoc.data().fullName || uDoc.data().name || 'Unknown') : 'Unknown';
        if (sel.breakfast) bVoters.push({ name });
        if (sel.dinner)    dVoters.push({ name });
      }
      setTodayVoters({ breakfast: bVoters, dinner: dVoters });
      setShowVotersModal(true);
    } catch { alert('Failed to load voters'); }
    finally { setVotersLoading(false); }
  };

  // Calendar
  const renderCalendar = () => {
    const cells = [];
    ['S','M','T','W','T','F','S'].forEach(d => cells.push(<div key={`h-${d}`} className="calendar-day">{d}</div>));
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} className="calendar-date empty" />);
    for (let date = 1; date <= daysInMonth; date++) {
      const dk  = formatDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), date));
      const sel = selectedDates[dk];
      const isTd = date === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
      let cls = 'calendar-date';
      if (sel === 'both')      cls += ' selected-both';
      else if (sel === 'breakfast') cls += ' selected-breakfast';
      else if (sel === 'dinner')    cls += ' selected-dinner';
      if (isTd) cls += ' today';
      cells.push(
        <div key={date} className={cls} onClick={() => setShowModal(dk)}>
          <span>{date}</span>
          {sel && <div className="date-indicators"><div className="date-dot" />{sel === 'both' && <div className="date-dot" />}</div>}
        </div>
      );
    }
    return cells;
  };

  return (
    <div className="home-content">
      {/* Mess Member badge */}
      <div className="user-type-banner mess-banner">
        <span>🍽 Mess Member</span>
        <span className="banner-sub">Food charges only</span>
      </div>

      {/* Announcement */}
      <div className="announcement-card">
        <div className="announcement-icon"><MegaphoneIcon /></div>
        <div className="announcement-content">
          <div className="announcement-title">Announcement</div>
          <div className="announcement-text">{announcement || 'No announcements'}</div>
        </div>
      </div>

      {/* Today's food selection */}
      <div className="card">
        <h2 className="card-title">Today's Food Selection</h2>
        <p className="card-subtitle">{todayDate}</p>

        <div className="toggle-row">
          <span className="toggle-label">Breakfast</span>
          <div className={`toggle-switch ${breakfast ? 'active' : ''}`} onClick={handleBreakfastToggle}>
            <div className="toggle-slider" />
          </div>
        </div>
        <div className="toggle-row">
          <span className="toggle-label">Dinner</span>
          <div className={`toggle-switch ${dinner ? 'active' : ''}`} onClick={handleDinnerToggle}>
            <div className="toggle-slider" />
          </div>
        </div>
        <div className="status-message">
          {breakfast && dinner ? 'Breakfast & dinner selected' :
           breakfast ? 'Breakfast selected' :
           dinner    ? 'Dinner selected' :
           'No meals selected for today'}
        </div>

        <button
          onClick={loadTodayVoters}
          disabled={votersLoading}
          style={{ width:'100%', marginTop:'16px', padding:'12px', background:'#6366f1', color:'white',
                   border:'none', borderRadius:'8px', fontSize:'14px', fontWeight:'600', cursor:'pointer',
                   display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
                   opacity: votersLoading ? 0.6 : 1 }}
        >
          <UserIcon style={{ width:'18px', height:'18px' }} />
          {votersLoading ? 'Loading…' : "View Today's Voters"}
        </button>
      </div>

      {/* Advance planning calendar */}
      <div className="card">
        <h2 className="card-title">Advance Food Planning</h2>
        <p className="card-subtitle">Select your meals for upcoming days</p>
        <div className="calendar-header">
          <button className="calendar-nav" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}><ChevronLeft /></button>
          <span className="calendar-month">{monthName}</span>
          <button className="calendar-nav" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}><ChevronRight /></button>
        </div>
        <div className="calendar-grid">{renderCalendar()}</div>
        <div className="status-message">You can change or remove selections anytime</div>
      </div>

      {/* Date selection modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Select Meals</h3>
              <button className="modal-close" onClick={() => setShowModal(null)}><CloseIcon /></button>
            </div>
            <div className="modal-body">
              <div className="selection-options">
                {['both','breakfast','dinner',null].map((opt) => (
                  <div key={String(opt)} className="selection-option" onClick={() => handleSelection(opt)}>
                    {opt === 'both' ? 'Both (Breakfast & Dinner)' : opt === 'breakfast' ? 'Breakfast Only' : opt === 'dinner' ? 'Dinner Only' : 'None'}
                  </div>
                ))}
                <button className="cancel-btn" onClick={() => setShowModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voters modal */}
      {showVotersModal && (
        <div className="modal-overlay" onClick={() => setShowVotersModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Today's Voters</h3>
              <button className="modal-close" onClick={() => setShowVotersModal(false)}><CloseIcon /></button>
            </div>
            <div className="modal-body">
              {[['🌅 Breakfast', todayVoters.breakfast], ['🌙 Dinner', todayVoters.dinner]].map(([label, voters]) => (
                <div key={label} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize:'16px', fontWeight:'600', marginBottom:'12px', color:'#111827' }}>
                    {label} ({voters.length})
                  </div>
                  {voters.length > 0
                    ? <div className="selection-list">{voters.map((v, i) => <div key={i} className="selection-item"><div className="selection-name">{v.name}</div></div>)}</div>
                    : <div style={{ padding:'12px', background:'#f9fafb', borderRadius:'8px', fontSize:'14px', color:'#6b7280' }}>No votes yet</div>
                  }
                </div>
              ))}
              <button className="cancel-btn" onClick={() => setShowVotersModal(false)} style={{ marginTop:'8px' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessHome;
