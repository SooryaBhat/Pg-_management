import { useState, useEffect } from 'react';
import { MegaphoneIcon, ChevronLeft, ChevronRight, CloseIcon, UserIcon } from './Icons';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

// Mess Members: food polling only — no rent, no PG-specific features

function MessHome() {
  const [breakfast, setBreakfast] = useState(false);
  const [lunch, setLunch] = useState(false);
  const [dinner, setDinner] = useState(false);
  const [selectedDates, setSelectedDates] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showModal, setShowModal] = useState(null);
  const [showVotersModal, setShowVotersModal] = useState(false);
  const [todayVoters, setTodayVoters] = useState({ breakfast: [], lunch: [], dinner: [] });
  const [modalMeals, setModalMeals] = useState({ breakfast: false, lunch: false, dinner: false });
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(false);
  const [votersLoading, setVotersLoading] = useState(false);

  const today = new Date();
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayDate = today.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
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
          const data = snap.data();
          setBreakfast(data.breakfast || false);
          setLunch(data.lunch || false);
          setDinner(data.dinner || false);
        } else {
          setBreakfast(false);
          setLunch(false);
          setDinner(false);
        }
      }
    );
    return () => unsub();
  }, [todayKey]);

  // Load advance selections for current month
  useEffect(() => {
    const loadAdvanceSelections = async () => {
      if (!auth.currentUser) return;
      try {
        const uid = auth.currentUser.uid;
        const selections = {};
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        
        for (let d = 1; d <= days; d++) {
          const date = new Date(year, month, d);
          const dk = formatDateKey(date);
          const snap = await getDoc(doc(db, 'foodSelections', `${uid}_${dk}`));
          if (snap.exists()) {
            const data = snap.data();
            selections[dk] = {
              breakfast: data.breakfast || false,
              lunch: data.lunch || false,
              dinner: data.dinner || false
            };
          }
        }
        setSelectedDates(selections);
      } catch (err) {
        console.error('Error loading advance selections:', err);
      }
    };
    loadAdvanceSelections();
  }, [currentMonth]);

  // Save today's selection
  const saveTodaySelection = async (mealType, value) => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const nb = mealType === 'breakfast' ? value : breakfast;
      const nl = mealType === 'lunch' ? value : lunch;
      const nd = mealType === 'dinner' ? value : dinner;
      await setDoc(
        doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`),
        {
          userId: auth.currentUser.uid,
          date: todayKey,
          breakfast: nb,
          lunch: nl,
          dinner: nd,
          timestamp: new Date()
        },
        { merge: true }
      );
    } catch (err) {
      alert('Failed to save: ' + err.message);
      if (mealType === 'breakfast') setBreakfast(!value);
      else if (mealType === 'lunch') setLunch(!value);
      else if (mealType === 'dinner') setDinner(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleBreakfastToggle = () => { const v = !breakfast; setBreakfast(v); saveTodaySelection('breakfast', v); };
  const handleLunchToggle     = () => { const v = !lunch;     setLunch(v);     saveTodaySelection('lunch', v); };
  const handleDinnerToggle    = () => { const v = !dinner;    setDinner(v);    saveTodaySelection('dinner', v); };

  const handleDateClick = (dateKey) => {
    const currentSel = selectedDates[dateKey] || { breakfast: false, lunch: false, dinner: false };
    setModalMeals({ ...currentSel });
    setShowModal(dateKey);
  };

  // Save advance selection
  const handleSaveAdvanceSelection = async () => {
    if (!auth.currentUser) return;
    try {
      await setDoc(
        doc(db, 'foodSelections', `${auth.currentUser.uid}_${showModal}`),
        {
          userId: auth.currentUser.uid,
          date: showModal,
          breakfast: modalMeals.breakfast,
          lunch: modalMeals.lunch,
          dinner: modalMeals.dinner,
          timestamp: new Date()
        }
      );
      setSelectedDates(prev => ({
        ...prev,
        [showModal]: { ...modalMeals }
      }));
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
      const bVoters = [], lVoters = [], dVoters = [];
      for (const s of snap.docs) {
        const sel  = s.data();
        const uDoc = await getDoc(doc(db, 'users', sel.userId));
        const name = uDoc.exists() ? (uDoc.data().fullName || uDoc.data().name || 'Unknown') : 'Unknown';
        const voterInfo = { name };
        if (sel.breakfast) bVoters.push(voterInfo);
        if (sel.lunch)     lVoters.push(voterInfo);
        if (sel.dinner)    dVoters.push(voterInfo);
      }
      setTodayVoters({ breakfast: bVoters, lunch: lVoters, dinner: dVoters });
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
      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), date);
      const dk = formatDateKey(dateObj);
      const selection = selectedDates[dk];
      const isTd = date === today.getDate() && currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear();
      
      const hasBreakfast = selection && selection.breakfast;
      const hasLunch = selection && selection.lunch;
      const hasDinner = selection && selection.dinner;
      const hasAnySelection = hasBreakfast || hasLunch || hasDinner;

      let cls = 'calendar-date';
      if (hasAnySelection) cls += ' selected-any';
      if (isTd) cls += ' today';
      
      cells.push(
        <div key={date} className={cls} onClick={() => handleDateClick(dk)}>
          <span>{date}</span>
          {selection && hasAnySelection && (
            <div className="date-indicators">
              {hasBreakfast && <div className="date-dot breakfast" title="Breakfast"></div>}
              {hasLunch && <div className="date-dot lunch" title="Lunch"></div>}
              {hasDinner && <div className="date-dot dinner" title="Dinner"></div>}
            </div>
          )}
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
          <span className="toggle-label">Lunch</span>
          <div className={`toggle-switch ${lunch ? 'active' : ''}`} onClick={handleLunchToggle}>
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
          {breakfast && lunch && dinner ? 'You have selected all meals for today' :
           breakfast && dinner ? 'You have selected breakfast and dinner for today' :
           breakfast && lunch ? 'You have selected breakfast and lunch for today' :
           lunch && dinner ? 'You have selected lunch and dinner for today' :
           breakfast ? 'You have selected breakfast for today' :
           lunch ? 'You have selected lunch for today' :
           dinner ? 'You have selected dinner for today' :
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
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Select Meals</h3>
              <button className="modal-close" onClick={() => setShowModal(null)}><CloseIcon /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                Toggle selections for {parseDate(showModal)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              
              <div className="selection-options" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="toggle-row" style={{ padding: '4px 0' }}>
                  <span className="toggle-label" style={{ fontSize: '15px', fontWeight: '500' }}>Breakfast</span>
                  <div 
                    className={`toggle-switch ${modalMeals.breakfast ? 'active' : ''}`}
                    onClick={() => setModalMeals(prev => ({ ...prev, breakfast: !prev.breakfast }))}
                  >
                    <div className="toggle-slider"></div>
                  </div>
                </div>

                <div className="toggle-row" style={{ padding: '4px 0' }}>
                  <span className="toggle-label" style={{ fontSize: '15px', fontWeight: '500' }}>Lunch</span>
                  <div 
                    className={`toggle-switch ${modalMeals.lunch ? 'active' : ''}`}
                    onClick={() => setModalMeals(prev => ({ ...prev, lunch: !prev.lunch }))}
                  >
                    <div className="toggle-slider"></div>
                  </div>
                </div>

                <div className="toggle-row" style={{ padding: '4px 0' }}>
                  <span className="toggle-label" style={{ fontSize: '15px', fontWeight: '500' }}>Dinner</span>
                  <div 
                    className={`toggle-switch ${modalMeals.dinner ? 'active' : ''}`}
                    onClick={() => setModalMeals(prev => ({ ...prev, dinner: !prev.dinner }))}
                  >
                    <div className="toggle-slider"></div>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button 
                    className="pay-submit-btn" 
                    onClick={handleSaveAdvanceSelection}
                    style={{ margin: 0, flex: 1 }}
                  >
                    Save
                  </button>
                  <button 
                    className="cancel-btn" 
                    onClick={() => setShowModal(null)}
                    style={{ margin: 0, flex: 1 }}
                  >
                    Cancel
                  </button>
                </div>
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
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Breakfast Voters */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🌅 Breakfast ({todayVoters.breakfast.length})
                </div>
                {todayVoters.breakfast.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.breakfast.map((voter, index) => (
                      <div key={index} className="selection-item">
                        <div className="selection-name">{voter.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '12px', 
                    background: '#f9fafb', 
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    No votes for breakfast yet
                  </div>
                )}
              </div>

              {/* Lunch Voters */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🍱 Lunch ({todayVoters.lunch?.length || 0})
                </div>
                {todayVoters.lunch && todayVoters.lunch.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.lunch.map((voter, index) => (
                      <div key={index} className="selection-item">
                        <div className="selection-name">{voter.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '12px', 
                    background: '#f9fafb', 
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    No votes for lunch yet
                  </div>
                )}
              </div>

              {/* Dinner Voters */}
              <div>
                <div style={{ 
                  fontSize: '16px', 
                  fontWeight: '600', 
                  marginBottom: '12px',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  🌙 Dinner ({todayVoters.dinner.length})
                </div>
                {todayVoters.dinner.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.dinner.map((voter, index) => (
                      <div key={index} className="selection-item">
                        <div className="selection-name">{voter.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '12px', 
                    background: '#f9fafb', 
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#6b7280'
                  }}>
                    No votes for dinner yet
                  </div>
                )}
              </div>

              <button className="cancel-btn" onClick={() => setShowVotersModal(false)} style={{ marginTop:'16px', width:'100%' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessHome;

