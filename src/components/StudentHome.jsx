import { useState, useEffect } from 'react';
import { MegaphoneIcon, ChevronLeft, ChevronRight, CloseIcon, UserIcon } from './Icons';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

function PGMemberHome() {
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
  
  // Proper date formatting with padding
  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const [year, month, day] = dateStr.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
  };

  const todayKey = formatDateKey(today);

  // Load announcement
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'announcements', 'current'), (doc) => {
      if (doc.exists()) {
        setAnnouncement(doc.data().text || '');
      }
    }, (error) => {
      console.log('Announcement error (normal if not created yet):', error.message);
    });
    return () => unsubscribe();
  }, []);

  // Load today's selection with real-time listener
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribe = onSnapshot(
      doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBreakfast(data.breakfast || false);
          setLunch(data.lunch || false);
          setDinner(data.dinner || false);
          console.log('✅ Loaded today selection:', data);
        } else {
          setBreakfast(false);
          setLunch(false);
          setDinner(false);
        }
      },
      (error) => {
        console.error('Error loading today selection:', error);
      }
    );

    return () => unsubscribe();
  }, [todayKey]);

  // Load only current month's advance selections
  useEffect(() => {
    const loadAdvanceSelections = async () => {
      if (!auth.currentUser) return;
      
      try {
        const userId = auth.currentUser.uid;
        const selections = {};
        
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
        
        for (let day = 1; day <= daysInCurrentMonth; day++) {
          const date = new Date(year, month, day);
          const dateKey = formatDateKey(date);
          
          const selectionDoc = await getDoc(
            doc(db, 'foodSelections', `${userId}_${dateKey}`)
          );
          
          if (selectionDoc.exists()) {
            const data = selectionDoc.data();
            selections[dateKey] = {
              breakfast: data.breakfast || false,
              lunch: data.lunch || false,
              dinner: data.dinner || false
            };
          }
        }
        
        setSelectedDates(selections);
        console.log('✅ Loaded advance selections:', Object.keys(selections).length);
      } catch (error) {
        console.error('❌ Error loading advance selections:', error);
      }
    };

    loadAdvanceSelections();
  }, [currentMonth]);

  // Load today's voters
  const loadTodayVoters = async () => {
    setVotersLoading(true);
    try {
      const q = query(
        collection(db, 'foodSelections'),
        where('date', '==', todayKey)
      );
      const snapshot = await getDocs(q);
      
      const breakfastVoters = [];
      const lunchVoters = [];
      const dinnerVoters = [];
      
      for (const docSnap of snapshot.docs) {
        const selection = docSnap.data();
        
        // Get user details
        const userDoc = await getDoc(doc(db, 'users', selection.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown';
        
        const voterInfo = { name: userName };
        
        if (selection.breakfast) breakfastVoters.push(voterInfo);
        if (selection.lunch)     lunchVoters.push(voterInfo);
        if (selection.dinner)    dinnerVoters.push(voterInfo);
      }
      
      setTodayVoters({ breakfast: breakfastVoters, lunch: lunchVoters, dinner: dinnerVoters });
      setShowVotersModal(true);
    } catch (error) {
      console.error('Error loading voters:', error);
      alert('Failed to load voters');
    } finally {
      setVotersLoading(false);
    }
  };

  // Save today's selection
  const saveTodaySelection = async (mealType, value) => {
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const newBreakfast = mealType === 'breakfast' ? value : breakfast;
      const newLunch     = mealType === 'lunch' ? value : lunch;
      const newDinner    = mealType === 'dinner' ? value : dinner;

      await setDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`), {
        userId: auth.currentUser.uid,
        date: todayKey,
        breakfast: newBreakfast,
        lunch: newLunch,
        dinner: newDinner,
        timestamp: new Date()
      }, { merge: true });

      console.log('✅ Selection saved successfully');
    } catch (error) {
      console.error('❌ Error saving selection:', error);
      alert('Failed to save: ' + error.message);
      if (mealType === 'breakfast') setBreakfast(!value);
      else if (mealType === 'lunch')     setLunch(!value);
      else if (mealType === 'dinner')    setDinner(!value);
    } finally {
      setLoading(false);
    }
  };

  const handleBreakfastToggle = () => {
    const newValue = !breakfast;
    setBreakfast(newValue);
    saveTodaySelection('breakfast', newValue);
  };

  const handleLunchToggle = () => {
    const newValue = !lunch;
    setLunch(newValue);
    saveTodaySelection('lunch', newValue);
  };

  const handleDinnerToggle = () => {
    const newValue = !dinner;
    setDinner(newValue);
    saveTodaySelection('dinner', newValue);
  };

  const handleDateClick = (dateKey) => {
    const currentSel = selectedDates[dateKey] || { breakfast: false, lunch: false, dinner: false };
    setModalMeals({ ...currentSel });
    setShowModal(dateKey);
  };

  const handleSaveAdvanceSelection = async () => {
    if (!auth.currentUser) return;

    try {
      await setDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${showModal}`), {
        userId: auth.currentUser.uid,
        date: showModal,
        breakfast: modalMeals.breakfast,
        lunch: modalMeals.lunch,
        dinner: modalMeals.dinner,
        timestamp: new Date()
      });

      setSelectedDates(prev => ({
        ...prev,
        [showModal]: { ...modalMeals }
      }));
      
      console.log('✅ Advance selection saved');
    } catch (error) {
      console.error('❌ Error saving advance selection:', error);
      alert('Failed to save: ' + error.message);
    }
    
    setShowModal(null);
  };

  const renderCalendar = () => {
    const dates = [];
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    days.forEach(day => dates.push(<div key={`day-${day}`} className="calendar-day">{day}</div>));

    for (let i = 0; i < firstDay; i++) {
      dates.push(<div key={`empty-${i}`} className="calendar-date empty"></div>);
    }

    for (let date = 1; date <= daysInMonth; date++) {
      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), date);
      const dateKey = formatDateKey(dateObj);
      const selection = selectedDates[dateKey];
      const isToday = date === today.getDate() &&
        currentMonth.getMonth() === today.getMonth() &&
        currentMonth.getFullYear() === today.getFullYear();

      const hasBreakfast = selection && selection.breakfast;
      const hasLunch = selection && selection.lunch;
      const hasDinner = selection && selection.dinner;
      const hasAnySelection = hasBreakfast || hasLunch || hasDinner;

      let className = 'calendar-date';
      if (hasAnySelection) className += ' selected-any';
      if (isToday) className += ' today';

      dates.push(
        <div key={date} className={className} onClick={() => handleDateClick(dateKey)}>
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

    return dates;
  };

  return (
    <div className="home-content">
      {/* PG Member badge */}
      <div className="user-type-banner pg-banner">
        <span>🏠 PG Member</span>
        <span className="banner-sub">Rent + food charges</span>
      </div>

      <div className="announcement-card">
        <div className="announcement-icon">
          <MegaphoneIcon />
        </div>
        <div className="announcement-content">
          <div className="announcement-title">Announcement</div>
          <div className="announcement-text">
            {announcement || 'No announcements'}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Today's Food Selection</h2>
        <p className="card-subtitle">{todayDate}</p>

        <div className="toggle-row">
          <span className="toggle-label">Breakfast</span>
          <div 
            className={`toggle-switch ${breakfast ? 'active' : ''}`}
            onClick={handleBreakfastToggle}
          >
            <div className="toggle-slider"></div>
          </div>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">Lunch</span>
          <div 
            className={`toggle-switch ${lunch ? 'active' : ''}`}
            onClick={handleLunchToggle}
          >
            <div className="toggle-slider"></div>
          </div>
        </div>

        <div className="toggle-row">
          <span className="toggle-label">Dinner</span>
          <div 
            className={`toggle-switch ${dinner ? 'active' : ''}`}
            onClick={handleDinnerToggle}
          >
            <div className="toggle-slider"></div>
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

        {/* View Voters Button */}
        <button 
          onClick={loadTodayVoters}
          disabled={votersLoading}
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '12px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: votersLoading ? 0.6 : 1
          }}
        >
          <UserIcon style={{ width: '18px', height: '18px' }} />
          {votersLoading ? 'Loading...' : "View Today's Voters"}
        </button>
      </div>

      <div className="card">
        <h2 className="card-title">Advance Food Planning</h2>
        <p className="card-subtitle">Select your meals for upcoming days</p>

        <div className="calendar-header">
          <button 
            className="calendar-nav"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
          >
            <ChevronLeft />
          </button>
          <span className="calendar-month">{monthName}</span>
          <button 
            className="calendar-nav"
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
          >
            <ChevronRight />
          </button>
        </div>

        <div className="calendar-grid">
          {renderCalendar()}
        </div>

        <div className="status-message">
          You can change or remove selections anytime
        </div>
      </div>

      {/* Date Selection Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Select Meals</h3>
              <button className="modal-close" onClick={() => setShowModal(null)}>
                <CloseIcon />
              </button>
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

      {/* Today's Voters Modal */}
      {showVotersModal && (
        <div className="modal-overlay" onClick={() => setShowVotersModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Today's Voters</h3>
              <button className="modal-close" onClick={() => setShowVotersModal(false)}>
                <CloseIcon />
              </button>
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

              <button 
                className="cancel-btn" 
                onClick={() => setShowVotersModal(false)}
                style={{ marginTop: '16px', width: '100%' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PGMemberHome;