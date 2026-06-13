import { useState, useEffect } from 'react';
import { MegaphoneIcon, CloseIcon } from './Icons';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

function AdminHome() {
  const [announcement, setAnnouncement] = useState('');
  const [showModal, setShowModal] = useState(null);
  const [todayCount, setTodayCount] = useState({ breakfast: 0, dinner: 0, total: 0 });
  const [tomorrowCount, setTomorrowCount] = useState({ breakfast: 0, dinner: 0, total: 0 });
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [modalData, setModalData] = useState([]);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Proper date formatting with padding
  const formatDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const todayKey = formatDateKey(today);
  const tomorrowKey = formatDateKey(tomorrow);



  // Load announcement
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'announcements', 'current'), (doc) => {
      if (doc.exists()) {
        setAnnouncement(doc.data().text || '');
      }
    });
    return () => unsubscribe();
  }, []);

  // Load today's count
  useEffect(() => {
    const loadTodayCount = async () => {
      try {
        const q = query(
          collection(db, 'foodSelections'),
          where('date', '==', todayKey)
        );
        const snapshot = await getDocs(q);
        
        let breakfast = 0;
        let dinner = 0;
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.breakfast) breakfast++;
          if (data.dinner) dinner++;
        });
        
        setTodayCount({ breakfast, dinner, total: snapshot.size });
      } catch (error) {
        console.error('❌ Error loading today count:', error);
      }
    };

    loadTodayCount();
    const interval = setInterval(loadTodayCount, 30000);
    return () => clearInterval(interval);
  }, [todayKey]);

  // Load tomorrow's count
  useEffect(() => {
    const loadTomorrowCount = async () => {
      try {
        const q = query(
          collection(db, 'foodSelections'),
          where('date', '==', tomorrowKey)
        );
        const snapshot = await getDocs(q);
        
        let breakfast = 0;
        let dinner = 0;
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.breakfast) breakfast++;
          if (data.dinner) dinner++;
        });
        
        setTomorrowCount({ breakfast, dinner, total: snapshot.size });
      } catch (error) {
        console.error('❌ Error loading tomorrow count:', error);
      }
    };

    loadTomorrowCount();
    const interval = setInterval(loadTomorrowCount, 30000);
    return () => clearInterval(interval);
  }, [tomorrowKey]);

  // Load upcoming count
  useEffect(() => {
    const loadUpcomingCount = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'foodSelections'));
        
        const futureDates = new Set();
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const date = data.date;
          
          if (date > tomorrowKey) {
            futureDates.add(date);
          }
        });
        
        setUpcomingCount(futureDates.size);
      } catch (error) {
        console.error('❌ Error loading upcoming count:', error);
      }
    };

    loadUpcomingCount();
    const interval = setInterval(loadUpcomingCount, 60000);
    return () => clearInterval(interval);
  }, [tomorrowKey]);

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
      alert('Announcement saved successfully!');
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert('Failed to save announcement');
    }
  };

  const handleCardClick = async (type) => {
    let dateKey;
    if (type === 'today') dateKey = todayKey;
    else if (type === 'tomorrow') dateKey = tomorrowKey;
    
    try {
      if (type === 'today' || type === 'tomorrow') {
        const q = query(
          collection(db, 'foodSelections'),
          where('date', '==', dateKey)
        );
        const snapshot = await getDocs(q);
        
        const data = [];
        for (const docSnap of snapshot.docs) {
          const selection = docSnap.data();
          // Get user details
          const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', selection.userId)));
          let userName = 'Unknown';
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            userName = userData.name || userData.username || 'Unknown';
          }
          
          data.push({
            name: userName,
            breakfast: selection.breakfast,
            dinner: selection.dinner
          });
        }
        
        setModalData(data);
      } else if (type === 'upcoming') {
        const snapshot = await getDocs(collection(db, 'foodSelections'));
        
        const futureSelections = new Map();
        
        snapshot.forEach((doc) => {
          const selection = doc.data();
          const date = selection.date;
          
          if (date > tomorrowKey) {
            if (!futureSelections.has(date)) {
              futureSelections.set(date, { breakfast: 0, dinner: 0 });
            }
            const counts = futureSelections.get(date);
            if (selection.breakfast) counts.breakfast++;
            if (selection.dinner) counts.dinner++;
          }
        });
        
        const data = Array.from(futureSelections.entries()).map(([date, counts]) => {
          const [year, month, day] = date.split('-').map(Number);
          const dateObj = new Date(year, month - 1, day);
          return {
            date: dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            breakfast: counts.breakfast,
            dinner: counts.dinner,
            sortKey: date
          };
        }).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        
        setModalData(data);
      }
      
      setShowModal(type);
    } catch (error) {
      console.error('Error loading modal data:', error);
      setModalData([]);
      setShowModal(type);
    }
  };

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
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {showModal === 'today' ? "Today's" :
                 showModal === 'tomorrow' ? "Tomorrow's" :
                 "Upcoming"} Food Selections
              </h3>
              <button className="modal-close" onClick={() => setShowModal(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              {modalData.length > 0 ? (
                <div className="selection-list">
                  {showModal === 'upcoming' ? (
                    modalData.map((item, index) => (
                      <div key={index} className="selection-item">
                        <div className="selection-name">{item.date}</div>
                        <div className="selection-meals">
                          Breakfast: {item.breakfast} • Dinner: {item.dinner}
                        </div>
                      </div>
                    ))
                  ) : (
                    modalData.map((item, index) => (
                      <div key={index} className="selection-item">
                        <div className="selection-info">
                          <div className="selection-name">{item.name}</div>
                        </div>
                        <div className="selection-meals">
                          {item.breakfast && <span className="meal-badge">B</span>}
                          {item.dinner && <span className="meal-badge">D</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-text">No data available</div>
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