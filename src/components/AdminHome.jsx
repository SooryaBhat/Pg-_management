import { useState, useEffect } from 'react';
import { MegaphoneIcon, CloseIcon } from './Icons';
import { db } from '../firebase';
import { doc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { sendNotificationToUser } from '../services/notificationService';

function AdminHome() {
  const [announcement, setAnnouncement] = useState('');
  const [showModal, setShowModal] = useState(null);
  const [modalData, setModalData] = useState([]);
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
    try {
      if (type === 'today' || type === 'tomorrow') {
        const targetTime = type === 'today' ? todayClean.getTime() : tomorrowClean.getTime();
        const filteredSelections = selections.filter(s => {
          const sDate = parseDate(s.date);
          return sDate && getCleanDate(sDate).getTime() === targetTime;
        });
        
        const data = [];
        for (const selection of filteredSelections) {
          // Get user details
          const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', selection.userId)));
          let userName = 'Unknown';
          
          if (!userDoc.empty) {
            const userData = userDoc.docs[0].data();
            userName = userData.fullName || userData.name || userData.username || 'Unknown';
          }
          
          data.push({
            name: userName,
            breakfast: selection.breakfast,
            dinner: selection.dinner
          });
        }
        
        setModalData(data);
      } else if (type === 'upcoming') {
        const futureSelections = new Map();
        
        selections.forEach((selection) => {
          const sDate = parseDate(selection.date);
          if (sDate) {
            const cleanSDate = getCleanDate(sDate);
            const sTime = cleanSDate.getTime();
            if (sTime > tomorrowClean.getTime()) {
              if (!futureSelections.has(sTime)) {
                futureSelections.set(sTime, { breakfast: 0, dinner: 0, dateObj: cleanSDate });
              }
              const counts = futureSelections.get(sTime);
              if (selection.breakfast) counts.breakfast++;
              if (selection.dinner) counts.dinner++;
            }
          }
        });
        
        const data = Array.from(futureSelections.entries()).map(([timeKey, info]) => {
          return {
            date: info.dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            breakfast: info.breakfast,
            dinner: info.dinner,
            sortKey: timeKey
          };
        }).sort((a, b) => a.sortKey - b.sortKey);
        
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