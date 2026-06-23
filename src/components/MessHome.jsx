import { useState, useEffect, useCallback } from 'react';
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

  // ─── Date Helpers ─────────────────────────────────────────────────────────

  // Format a Date object to YYYY-MM-DD
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

  /**
   * Returns the "active voting date":
   *   Before 7:00 PM  → today   (voting for today's meals)
   *   At/after 7:00 PM → tomorrow (voting for next day's meals)
   *
   * Recalculated fresh on every render so it reacts to time passing.
   */
  const getVoteDate = () => {
    const now = new Date();
    if (now.getHours() >= 19) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return now;
  };

  const today = new Date();
  const todayKey = formatDateKey(today); // physical today — used only for "View Voters"

  const voteDate = getVoteDate();
  const voteDateKey = formatDateKey(voteDate);
  const isVotingForTomorrow = voteDateKey !== todayKey;
  const voteDateLabel = voteDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  console.log('[VoteDate] Active voting date key:', voteDateKey, '| Is tomorrow?', isVotingForTomorrow);

  // Calendar helpers
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ─── Announcement Listener ────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'announcements', 'current'), (d) => {
      if (d.exists()) setAnnouncement(d.data().text || '');
    }, () => {});
    return () => unsub();
  }, []);

  // ─── Main Vote Card: Real-time listener on voteDateKey ───────────────────

  useEffect(() => {
    if (!auth.currentUser) return;

    const docId = `${auth.currentUser.uid}_${voteDateKey}`;
    console.log('[FirestoreRead] Attaching listener for main vote doc:', docId);

    const unsub = onSnapshot(
      doc(db, 'foodSelections', docId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setBreakfast(data.breakfast || false);
          setLunch(data.lunch || false);
          setDinner(data.dinner || false);
          console.log('[FirestoreRead] Loaded main vote:', data);
        } else {
          setBreakfast(false);
          setLunch(false);
          setDinner(false);
          console.log('[FirestoreRead] No existing vote for', voteDateKey);
        }
      },
      (error) => {
        console.error('[FirestoreRead] Error loading main vote:', error);
      }
    );

    return () => unsub();
  }, [voteDateKey]); // re-runs when the vote date changes (e.g. at 7 PM)

  // ─── Advance Selections: Load for current calendar month ─────────────────

  const loadAdvanceSelections = useCallback(async () => {
    if (!auth.currentUser) return;

    try {
      const uid = auth.currentUser.uid;
      const selections = {};
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const days = new Date(year, month + 1, 0).getDate();

      console.log('[AdvanceLoad] Loading selections for month:', monthName);

      for (let d = 1; d <= days; d++) {
        const date = new Date(year, month, d);
        const dk = formatDateKey(date);
        const snap = await getDoc(doc(db, 'foodSelections', `${uid}_${dk}`));
        if (snap.exists()) {
          const data = snap.data();
          selections[dk] = {
            breakfast: data.breakfast || false,
            lunch: data.lunch || false,
            dinner: data.dinner || false,
          };
        }
      }

      setSelectedDates(selections);
      console.log('[AdvanceLoad] Loaded', Object.keys(selections).length, 'selections:', selections);
    } catch (err) {
      console.error('[AdvanceLoad] Error loading advance selections:', err);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadAdvanceSelections();
  }, [loadAdvanceSelections]);

  // ─── Save Main Vote (uses voteDateKey) ────────────────────────────────────

  const saveTodaySelection = async (mealType, value) => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      const nb = mealType === 'breakfast' ? value : breakfast;
      const nl = mealType === 'lunch'     ? value : lunch;
      const nd = mealType === 'dinner'    ? value : dinner;

      const payload = {
        userId: auth.currentUser.uid,
        date: voteDateKey,
        breakfast: nb,
        lunch: nl,
        dinner: nd,
        timestamp: new Date(),
      };

      const docId = `${auth.currentUser.uid}_${voteDateKey}`;
      console.log('[VotePayload] Saving main vote →', docId, payload);

      await setDoc(doc(db, 'foodSelections', docId), payload, { merge: true });

      console.log('[FirestoreWrite] Main vote saved successfully for', voteDateKey);
    } catch (err) {
      console.error('[FirestoreWrite] Error saving main vote:', err);
      alert('Failed to save: ' + err.message);
      // Revert optimistic UI
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

  // ─── Calendar Date Click: Load existing vote for that date ────────────────

  const handleDateClick = (dateKey) => {
    const currentSel = selectedDates[dateKey] || { breakfast: false, lunch: false, dinner: false };
    console.log('[Calendar] Clicked date:', dateKey, '| Existing selection:', currentSel);
    setModalMeals({ ...currentSel });
    setShowModal(dateKey);
  };

  // ─── Save Advance Selection ───────────────────────────────────────────────

  const handleSaveAdvanceSelection = async () => {
    if (!auth.currentUser || !showModal) return;

    const docId = `${auth.currentUser.uid}_${showModal}`;
    const payload = {
      userId: auth.currentUser.uid,
      date: showModal,
      breakfast: modalMeals.breakfast,
      lunch: modalMeals.lunch,
      dinner: modalMeals.dinner,
      timestamp: new Date(),
    };

    console.log('[AdvanceSave] Saving advance vote →', docId, payload);

    try {
      await setDoc(doc(db, 'foodSelections', docId), payload, { merge: true });

      console.log('[FirestoreWrite] Advance vote saved successfully for', showModal);

      // Update local state immediately
      setSelectedDates(prev => ({
        ...prev,
        [showModal]: {
          breakfast: modalMeals.breakfast,
          lunch: modalMeals.lunch,
          dinner: modalMeals.dinner,
        },
      }));

      // Re-load from Firestore to confirm persistence
      console.log('[AdvanceSave] Verifying persistence — re-loading month selections...');
      await loadAdvanceSelections();

    } catch (err) {
      console.error('[FirestoreWrite] Error saving advance selection:', err);
      alert('Failed to save: ' + err.message);
    }

    setShowModal(null);
  };

  // ─── View Today's Voters (always physical today) ──────────────────────────

  const loadTodayVoters = async () => {
    setVotersLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'foodSelections'), where('date', '==', todayKey))
      );
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
    } catch {
      alert('Failed to load voters');
    } finally {
      setVotersLoading(false);
    }
  };

  // ─── Calendar Renderer ────────────────────────────────────────────────────

  const renderCalendar = () => {
    const cells = [];
    ['S','M','T','W','T','F','S'].forEach(d => cells.push(<div key={`h-${d}`} className="calendar-day">{d}</div>));
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} className="calendar-date empty" />);

    for (let date = 1; date <= daysInMonth; date++) {
      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), date);
      const dk = formatDateKey(dateObj);
      const selection = selectedDates[dk];
      const isToday = date === today.getDate() &&
        currentMonth.getMonth() === today.getMonth() &&
        currentMonth.getFullYear() === today.getFullYear();
      const isVoteDay = dk === voteDateKey;

      const hasBreakfast = selection && selection.breakfast;
      const hasLunch = selection && selection.lunch;
      const hasDinner = selection && selection.dinner;
      const hasAnySelection = hasBreakfast || hasLunch || hasDinner;

      let cls = 'calendar-date';
      if (hasAnySelection) cls += ' selected-any';
      if (isToday) cls += ' today';
      if (isVoteDay && !isToday) cls += ' vote-day'; // highlight tomorrow if after 7 PM

      cells.push(
        <div key={date} className={cls} onClick={() => handleDateClick(dk)}>
          <span>{date}</span>
          {hasAnySelection && (
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

  // ─── Status Message ───────────────────────────────────────────────────────

  const getMealStatusMessage = () => {
    const forDate = isVotingForTomorrow ? 'tomorrow' : 'today';
    if (breakfast && lunch && dinner) return `All meals selected for ${forDate}`;
    if (breakfast && dinner) return `Breakfast & Dinner selected for ${forDate}`;
    if (breakfast && lunch) return `Breakfast & Lunch selected for ${forDate}`;
    if (lunch && dinner) return `Lunch & Dinner selected for ${forDate}`;
    if (breakfast) return `Breakfast selected for ${forDate}`;
    if (lunch) return `Lunch selected for ${forDate}`;
    if (dinner) return `Dinner selected for ${forDate}`;
    return `No meals selected for ${forDate}`;
  };

  // ─── Render ───────────────────────────────────────────────────────────────

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

      {/* Main Voting Card */}
      <div className="card">
        <h2 className="card-title">
          Food Selection for {voteDateLabel}
        </h2>
        {isVotingForTomorrow && (
          <p className="card-subtitle" style={{ color: '#f59e0b', fontWeight: '600', fontSize: '12px', marginBottom: '4px' }}>
            🌙 After 7 PM — voting for tomorrow
          </p>
        )}
        <p className="card-subtitle">{voteDateLabel}</p>

        <div className="toggle-row">
          <span className="toggle-label">Breakfast</span>
          <div
            className={`toggle-switch ${breakfast ? 'active' : ''} ${loading ? 'disabled' : ''}`}
            onClick={!loading ? handleBreakfastToggle : undefined}
          >
            <div className="toggle-slider" />
          </div>
        </div>
        <div className="toggle-row">
          <span className="toggle-label">Lunch</span>
          <div
            className={`toggle-switch ${lunch ? 'active' : ''} ${loading ? 'disabled' : ''}`}
            onClick={!loading ? handleLunchToggle : undefined}
          >
            <div className="toggle-slider" />
          </div>
        </div>
        <div className="toggle-row">
          <span className="toggle-label">Dinner</span>
          <div
            className={`toggle-switch ${dinner ? 'active' : ''} ${loading ? 'disabled' : ''}`}
            onClick={!loading ? handleDinnerToggle : undefined}
          >
            <div className="toggle-slider" />
          </div>
        </div>

        <div className="status-message">{getMealStatusMessage()}</div>

        {/* View Voters — always shows physical today's voters */}
        <button
          onClick={loadTodayVoters}
          disabled={votersLoading}
          style={{
            width: '100%', marginTop: '16px', padding: '12px', background: '#6366f1',
            color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px',
            fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '8px', opacity: votersLoading ? 0.6 : 1,
          }}
        >
          <UserIcon style={{ width: '18px', height: '18px' }} />
          {votersLoading ? 'Loading…' : "View Today's Voters"}
        </button>
      </div>

      {/* Advance Planning Calendar */}
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

      {/* Advance Voting Modal — mobile-first bottom sheet */}
      {showModal && (
        <div className="adv-modal-overlay" onClick={() => setShowModal(null)}>
          <div className="adv-modal" onClick={e => e.stopPropagation()}>

            {/* Drag handle (hidden on desktop) */}
            <div className="adv-modal-handle" />

            {/* Fixed header */}
            <div className="adv-modal-header">
              <div className="adv-modal-title-wrap">
                <div className="adv-modal-title">Select Meals</div>
                <div className="adv-modal-date-lbl">
                  {parseDate(showModal)?.toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </div>
              </div>
              <button className="adv-modal-close" onClick={() => setShowModal(null)}>
                <CloseIcon />
              </button>
            </div>

            {/* Scrollable meals */}
            <div className="adv-modal-body">
              <div className="adv-modal-meal-row">
                <div className="adv-modal-meal-label">
                  <span className="adv-modal-meal-emoji">🌅</span>
                  Breakfast
                </div>
                <div
                  className={`toggle-switch ${modalMeals.breakfast ? 'active' : ''}`}
                  onClick={() => setModalMeals(prev => ({ ...prev, breakfast: !prev.breakfast }))}
                >
                  <div className="toggle-slider" />
                </div>
              </div>

              <div className="adv-modal-meal-row">
                <div className="adv-modal-meal-label">
                  <span className="adv-modal-meal-emoji">🍱</span>
                  Lunch
                </div>
                <div
                  className={`toggle-switch ${modalMeals.lunch ? 'active' : ''}`}
                  onClick={() => setModalMeals(prev => ({ ...prev, lunch: !prev.lunch }))}
                >
                  <div className="toggle-slider" />
                </div>
              </div>

              <div className="adv-modal-meal-row">
                <div className="adv-modal-meal-label">
                  <span className="adv-modal-meal-emoji">🌙</span>
                  Dinner
                </div>
                <div
                  className={`toggle-switch ${modalMeals.dinner ? 'active' : ''}`}
                  onClick={() => setModalMeals(prev => ({ ...prev, dinner: !prev.dinner }))}
                >
                  <div className="toggle-slider" />
                </div>
              </div>
            </div>

            {/* Fixed footer — always visible */}
            <div className="adv-modal-footer">
              <button className="adv-modal-save-btn" onClick={handleSaveAdvanceSelection}>
                Save Vote
              </button>
              <button className="adv-modal-cancel-btn" onClick={() => setShowModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Voters Modal */}
      {showVotersModal && (
        <div className="modal-overlay" onClick={() => setShowVotersModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Today's Voters</h3>
              <button className="modal-close" onClick={() => setShowVotersModal(false)}><CloseIcon /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Breakfast */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🌅 Breakfast ({todayVoters.breakfast.length})
                </div>
                {todayVoters.breakfast.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.breakfast.map((voter, index) => (
                      <div key={index} className="selection-item"><div className="selection-name">{voter.name}</div></div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', fontSize: '14px', color: '#6b7280' }}>No votes for breakfast yet</div>
                )}
              </div>

              {/* Lunch */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🍱 Lunch ({todayVoters.lunch?.length || 0})
                </div>
                {todayVoters.lunch && todayVoters.lunch.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.lunch.map((voter, index) => (
                      <div key={index} className="selection-item"><div className="selection-name">{voter.name}</div></div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', fontSize: '14px', color: '#6b7280' }}>No votes for lunch yet</div>
                )}
              </div>

              {/* Dinner */}
              <div>
                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🌙 Dinner ({todayVoters.dinner.length})
                </div>
                {todayVoters.dinner.length > 0 ? (
                  <div className="selection-list">
                    {todayVoters.dinner.map((voter, index) => (
                      <div key={index} className="selection-item"><div className="selection-name">{voter.name}</div></div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', fontSize: '14px', color: '#6b7280' }}>No votes for dinner yet</div>
                )}
              </div>

              <button className="cancel-btn" onClick={() => setShowVotersModal(false)} style={{ marginTop: '16px', width: '100%' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessHome;
