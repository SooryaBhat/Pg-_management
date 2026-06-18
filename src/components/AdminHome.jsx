import { useState, useEffect } from 'react';
import { MegaphoneIcon, CloseIcon } from './Icons';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { sendNotificationToUser } from '../services/notificationService';

function AdminHome() {
  const [announcement, setAnnouncement] = useState('');
  const [showModal, setShowModal] = useState(null);
  const [modalData, setModalData] = useState([]);
  const [modalSearch, setModalSearch] = useState('');
  const [selections, setSelections] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Automatically update currentDate every 10 seconds (handles date changes and transitions)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Robust date parser to handle both YYYY-MM-DD and DD-MM-YYYY
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      const p2 = parts[2].trim();
      if (p0.length === 4) {
        // YYYY-MM-DD
        return new Date(Number(p0), Number(p1) - 1, Number(p2));
      } else if (p2.length === 4) {
        // DD-MM-YYYY
        return new Date(Number(p2), Number(p1) - 1, Number(p0));
      }
    }
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Helper to zero out hours/minutes/seconds/milliseconds
  const getCleanDate = (date) => {
    const clean = new Date(date);
    clean.setHours(0, 0, 0, 0);
    return clean;
  };

  const todayClean = getCleanDate(currentDate);
  const tomorrowClean = new Date(todayClean);
  tomorrowClean.setDate(tomorrowClean.getDate() + 1);

  // Load announcement
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'announcements', 'current'), (doc) => {
      if (doc.exists()) {
        setAnnouncement(doc.data().text || '');
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to real-time food selections (fetch all to avoid lexicographical comparison issues)
  useEffect(() => {
    const q = query(
      collection(db, 'foodSelections')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => doc.data());
      setSelections(list);
    }, (error) => {
      console.error('❌ Error listening to food selections:', error);
    });
    return () => unsubscribe();
  }, []);

  // Dynamically calculate Today's Count
  const todayCount = selections.reduce((acc, curr) => {
    const currDate = parseDate(curr.date);
    if (currDate) {
      const currClean = getCleanDate(currDate);
      if (currClean.getTime() === todayClean.getTime()) {
        if (curr.breakfast) acc.breakfast++;
        if (curr.dinner) acc.dinner++;
        acc.total++;
      }
    }
    return acc;
  }, { breakfast: 0, dinner: 0, total: 0 });

  // Dynamically calculate Tomorrow's Count
  const tomorrowCount = selections.reduce((acc, curr) => {
    const currDate = parseDate(curr.date);
    if (currDate) {
      const currClean = getCleanDate(currDate);
      if (currClean.getTime() === tomorrowClean.getTime()) {
        if (curr.breakfast) acc.breakfast++;
        if (curr.dinner) acc.dinner++;
        acc.total++;
      }
    }
    return acc;
  }, { breakfast: 0, dinner: 0, total: 0 });

  // Dynamically calculate Advance Count (unique dates with selections > tomorrow)
  const advanceDates = new Set();
  selections.forEach(curr => {
    const currDate = parseDate(curr.date);
    if (currDate) {
      const currClean = getCleanDate(currDate);
      if (currClean.getTime() > tomorrowClean.getTime()) {
        advanceDates.add(currClean.getTime());
      }
    }
  });
  const upcomingCount = advanceDates.size;

  const handleSaveAnnouncement = async () => {
    if (!announcement.trim()) {
      alert('Please enter an announcement');
      return;
    }

    try {
      await setDoc(doc(db, 'announcements', 'current'), {
        text: announcement,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Dispatch notifications to all members
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('userType', 'in', ['pg_member', 'mess_member']))
      );
      for (const uDoc of usersSnap.docs) {
        await sendNotificationToUser(
          uDoc.id,
          'New Announcement 📢',
          announcement.trim(),
          'announcements'
        );
      }

      alert('Announcement saved successfully!');
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert('Failed to save announcement');
    }
  };

  const handleCardClick = async (type) => {
    setModalSearch('');
    try {
      // Fetch all users in a single batch to perform fast memory lookups
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersMap = {};
      usersSnap.docs.forEach(doc => {
        usersMap[doc.id] = doc.data();
      });

      const targetTimeToday = todayClean.getTime();
      const targetTimeTomorrow = tomorrowClean.getTime();

      const filteredSelections = selections.filter(s => {
        const sDate = parseDate(s.date);
        if (!sDate) return false;
        const sTime = getCleanDate(sDate).getTime();
        
        if (type === 'today') return sTime === targetTimeToday;
        if (type === 'tomorrow') return sTime === targetTimeTomorrow;
        return sTime > targetTimeTomorrow; // upcoming
      });

      const data = filteredSelections.map(selection => {
        const userData = usersMap[selection.userId];
        let name = 'Unknown';
        let username = '';
        if (userData) {
          name = userData.fullName || userData.name || userData.username || 'Unknown';
          username = userData.username || '';
        }
        return {
          userId: selection.userId,
          name,
          username,
          breakfast: selection.breakfast || false,
          dinner: selection.dinner || false,
          date: selection.date, // YYYY-MM-DD string
          timestamp: parseDate(selection.date)?.getTime() || 0
        };
      });

      // Sort chronologically for upcoming
      if (type === 'upcoming') {
        data.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        // Sort alphabetically by name
        data.sort((a, b) => a.name.localeCompare(b.name));
      }

      setModalData(data);
      setShowModal(type);
    } catch (error) {
      console.error('Error loading modal data:', error);
      setModalData([]);
      setShowModal(type);
    }
  };

  const totalCount = modalData.length;
  const breakfastCountVal = modalData.filter(d => d.breakfast).length;
  const lunchCountVal = 0;
  const dinnerCountVal = modalData.filter(d => d.dinner).length;

  const filteredModalData = modalData.filter(item => {
    if (!modalSearch.trim()) return true;
    const s = modalSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(s) ||
      item.username.toLowerCase().includes(s)
    );
  });

  return (
    <div className="home-content">
      <div className="announcement-card">
        <div className="announcement-icon">
          <MegaphoneIcon />
        </div>
        <div className="announcement-content">
          <div className="announcement-title">Announcement</div>
          <input 
            type="text"
            className="announcement-input"
            placeholder="Type announcement message..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
          <button className="announcement-button" onClick={handleSaveAnnouncement}>
            Save Announcement
          </button>
        </div>
      </div>

      <div className="count-card" onClick={() => handleCardClick('today')}>
        <div className="count-label">Today's Food Count</div>
        <div className="count-number">{todayCount.total}</div>
        <div className="count-details">
          Breakfast: {todayCount.breakfast} • Dinner: {todayCount.dinner}
        </div>
      </div>

      <div className="count-card" onClick={() => handleCardClick('tomorrow')}>
        <div className="count-label">Tomorrow's Food Count</div>
        <div className="count-number">{tomorrowCount.total}</div>
        <div className="count-details">
          Breakfast: {tomorrowCount.breakfast} • Dinner: {tomorrowCount.dinner}
        </div>
      </div>

      <div className="count-card" onClick={() => handleCardClick('upcoming')}>
        <div className="count-label">Upcoming (Advance Votes)</div>
        <div className="count-number">{upcomingCount}</div>
        <div className="count-details">{upcomingCount} dates with selections</div>
      </div>

      {showModal && (
        <div className="vdm-overlay" onClick={() => { setShowModal(null); setModalSearch(''); }}>
          <div className="vdm-container" onClick={(e) => e.stopPropagation()}>
            <div className="vdm-header">
              <h3 className="vdm-title">
                {showModal === 'today' ? "Today's" :
                 showModal === 'tomorrow' ? "Tomorrow's" :
                 "Upcoming"} Selections
              </h3>
              <button className="vdm-close" onClick={() => { setShowModal(null); setModalSearch(''); }}>
                <CloseIcon />
              </button>
            </div>
            
            <div className="vdm-body">
              {/* Summary Banner */}
              <div className="vdm-summary-banner">
                <div className="vdm-summary-item">
                  <span className="vdm-summary-val">{totalCount}</span>
                  <span className="vdm-summary-lbl">Total</span>
                </div>
                <div className="vdm-summary-item">
                  <span className="vdm-summary-val">{breakfastCountVal}</span>
                  <span className="vdm-summary-lbl">Breakfast</span>
                </div>
                <div className="vdm-summary-item">
                  <span className="vdm-summary-val">{lunchCountVal}</span>
                  <span className="vdm-summary-lbl">Lunch</span>
                </div>
                <div className="vdm-summary-item">
                  <span className="vdm-summary-val">{dinnerCountVal}</span>
                  <span className="vdm-summary-lbl">Dinner</span>
                </div>
              </div>

              {/* Search input */}
              <div className="vdm-search-wrap">
                <input
                  type="text"
                  className="vdm-search-input"
                  placeholder="🔍 Search by name or username..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                />
              </div>

              {/* Member cards list */}
              {filteredModalData.length > 0 ? (
                <div className="vdm-list">
                  {filteredModalData.map((item, index) => (
                    <div key={index} className="vdm-card">
                      <div className="vdm-card-header">
                        <div>
                          <div className="vdm-member-name">{item.name}</div>
                          {item.username && (
                            <div className="vdm-member-user">@{item.username}</div>
                          )}
                        </div>
                        <div className="vdm-vote-date">
                          📅 {parseDate(item.date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      
                      <div className="vdm-meals-row">
                        <div className={`vdm-meal-status ${item.breakfast ? 'yes' : 'no'}`}>
                          <span>🍳 Breakfast:</span>
                          <strong>{item.breakfast ? 'Yes' : 'No'}</strong>
                        </div>
                        <div className="vdm-meal-status no">
                          <span>🥗 Lunch:</span>
                          <strong>No</strong>
                        </div>
                        <div className={`vdm-meal-status ${item.dinner ? 'yes' : 'no'}`}>
                          <span>🍽️ Dinner:</span>
                          <strong>{item.dinner ? 'Yes' : 'No'}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="vdm-empty">
                  <div className="vdm-empty-icon">🍽️</div>
                  <div className="vdm-empty-text">No votes found</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminHome;