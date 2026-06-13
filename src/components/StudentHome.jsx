import { useState, useEffect } from 'react';
import { MegaphoneIcon, ChevronLeft, ChevronRight, CloseIcon, UserIcon } from './Icons';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

function PGMemberHome() {
  const [breakfast, setBreakfast] = useState(false);
  const [dinner, setDinner] = useState(false);
  const [selectedDates, setSelectedDates] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showModal, setShowModal] = useState(null);
  const [showVotersModal, setShowVotersModal] = useState(false);
  const [todayVoters, setTodayVoters] = useState({ breakfast: [], dinner: [] });
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
          setDinner(data.dinner || false);
          console.log('✅ Loaded today selection:', data);
        } else {
          setBreakfast(false);
          setDinner(false);
        }
      },
      (error) => {
        console.error('Error loading selection:', error);
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
            if (data.breakfast && data.dinner) {
              selections[dateKey] = 'both';
            } else if (data.breakfast) {
              selections[dateKey] = 'breakfast';
            } else if (data.dinner) {
              selections[dateKey] = 'dinner';
            }
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
      const dinnerVoters = [];
      
      for (const docSnap of snapshot.docs) {
        const selection = docSnap.data();
        
        // Get user details
        const userDoc = await getDoc(doc(db, 'users', selection.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown';
        
        const voterInfo = { name: userName };
        
        if (selection.breakfast) breakfastVoters.push(voterInfo);
        if (selection.dinner) dinnerVoters.push(voterInfo);
      }
      
      setTodayVoters({ breakfast: breakfastVoters, dinner: dinnerVoters });
      setShowVotersModal(true);
    } catch (error) {
      console.error('Error loading voters:', error);
      alert('Failed to load voters');
    } finally {
      setVotersLoading(false);
    }
  };

  // Save today's selection
  const saveTodaySelection = async (isBreakfast, value) => {
    if (!auth.currentUser) return;
    
    setLoading(true);
    try {
      const newBreakfast = isBreakfast ? value : breakfast;
      const newDinner = !isBreakfast ? value : dinner;

      await setDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${todayKey}`), {
        userId: auth.currentUser.uid,
        date: todayKey,
        breakfast: newBreakfast,
        dinner: newDinner,
        timestamp: new Date()
      }, { merge: true });

      console.log('✅ Selection saved successfully');
    } catch (error) {
      console.error('❌ Error saving selection:', error);
      alert('Failed to save: ' + error.message);
      if (isBreakfast) {
        setBreakfast(!value);
      } else {
        setDinner(!value);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBreakfastToggle = () => {
    const newValue = !breakfast;
    setBreakfast(newValue);
    saveTodaySelection(true, newValue);
  };

  const handleDinnerToggle = () => {
    const newValue = !dinner;
    setDinner(newValue);
    saveTodaySelection(false, newValue);
  };

  const handleDateClick = (dateKey) => setShowModal(dateKey);

  const handleSelection = async (type) => {
    if (!auth.currentUser) return;

    try {
      if (type === null) {
        await setDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${showModal}`), {
          userId: auth.currentUser.uid,
          date: showModal,
          breakfast: false,
          dinner: false,
          timestamp: new Date()
        });

        const newDates = { ...selectedDates };
        delete newDates[showModal];
        setSelectedDates(newDates);
      } else {
        const breakfastValue = type === 'both' || type === 'breakfast';
        const dinnerValue = type === 'both' || type === 'dinner';

        await setDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${showModal}`), {
          userId: auth.currentUser.uid,
          date: showModal,
          breakfast: breakfastValue,
          dinner: dinnerValue,
          timestamp: new Date()
        });

        setSelectedDates({ ...selectedDates, [showModal]: type });
      }
      
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

      let className = 'calendar-date';
      if (selection === 'both') className += ' selected-both';
      else if (selection === 'breakfast') className += ' selected-breakfast';
      else if (selection === 'dinner') className += ' selected-dinner';
      if (isToday) className += ' today';

      dates.push(
        <div key={date} className={className} onClick={() => handleDateClick(dateKey)}>
          <span>{date}</span>
          {selection && (
            <div className="date-indicators">
              <div className="date-dot"></div>
              {selection === 'both' && <div className="date-dot"></div>}
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
          <span className="toggle-label">Dinner</span>
          <div 
            className={`toggle-switch ${dinner ? 'active' : ''}`}
            onClick={handleDinnerToggle}
          >
            <div className="toggle-slider"></div>
          </div>
        </div>

        <div className="status-message">
          {breakfast && dinner ? 'You have selected breakfast and dinner for today' :
           breakfast ? 'You have selected breakfast for today' :
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Select Meals</h3>
              <button className="modal-close" onClick={() => setShowModal(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="selection-options">
                <div className="selection-option" onClick={() => handleSelection('both')}>
                  Both (Breakfast & Dinner)
                </div>
                <div className="selection-option" onClick={() => handleSelection('breakfast')}>
                  Breakfast Only
                </div>
                <div className="selection-option" onClick={() => handleSelection('dinner')}>
                  Dinner Only
                </div>
                <div className="selection-option" onClick={() => handleSelection(null)}>
                  None
                </div>
                <button className="cancel-btn" onClick={() => setShowModal(null)}>
                  Cancel
                </button>
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
            <div className="modal-body">
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
                style={{ marginTop: '16px' }}
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