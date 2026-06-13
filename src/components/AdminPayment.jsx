import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import {
  collection, getDocs, doc, setDoc, updateDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { CloseIcon } from './Icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const RENT_AMOUNT      = 2500;
const FOOD_COST_PER_DAY = 65;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      year:  d.getFullYear(),
      month: d.getMonth(),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return opts;
}

function fmtRupee(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  if (status === 'paid')           return <span className="ap-status-pill paid">✅ Paid</span>;
  if (status === 'pending_review') return <span className="ap-status-pill review">🔍 Review</span>;
  if (status === 'rejected')       return <span className="ap-status-pill rejected">❌ Rejected</span>;
  return                                  <span className="ap-status-pill pending">⏳ Pending</span>;
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ user, selectedMonth, onClose, onStatusChange }) {
  const { year, month } = selectedMonth;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [saving, setSaving] = useState(false);

  const selMap = {};
  (user.selections || []).forEach(s => { selMap[s.date] = s; });

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const sel = selMap[dateKey];
    if (sel && (sel.breakfast || sel.dinner)) {
      days.push({ d, dateKey, breakfast: sel.breakfast, dinner: sel.dinner });
    }
  }

  const handleMarkStatus = async (newStatus) => {
    setSaving(true);
    try {
      const payRef = doc(db, 'payments', `${user.uid}_${selectedMonth.key}`);
      if (user.payment) {
        await updateDoc(payRef, {
          verificationStatus: newStatus,
          verificationReason: `Manually ${newStatus === 'paid' ? 'verified' : newStatus} by admin`,
          adminReviewedAt:    serverTimestamp(),
        });
      } else {
        // Create a minimal payment record when admin manually marks
        await setDoc(payRef, {
          userId:             user.uid,
          userType:           user.userType,
          userName:           user.displayName,
          username:           user.username || '',
          amount:             user.total,
          rent:               user.rent,
          foodCost:           user.foodCost,
          foodDays:           user.foodDays,
          paymentMonth:       selectedMonth.key,
          verificationStatus: newStatus,
          verificationReason: 'Manually marked by admin',
          adminReviewedAt:    serverTimestamp(),
          createdAt:          serverTimestamp(),
        });
      }
      await onStatusChange();
      onClose();
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const pay = user.payment;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ap-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{user.displayName}</h3>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>@{user.username || '—'}</div>
          </div>
          <button className="modal-close" onClick={onClose}><CloseIcon /></button>
        </div>

        <div className="modal-body ap-detail-body">
          {/* Role badge */}
          <div className={`payment-type-badge ${user.userType === 'pg_member' ? 'pg' : 'mess'}`} style={{ marginBottom: '16px' }}>
            {user.userType === 'pg_member' ? '🏠 PG Member' : '🍽 Mess Member'}
          </div>

          {/* Bill summary */}
          <div className="payment-breakdown-card" style={{ margin: '0 0 16px 0' }}>
            <h3 className="breakdown-title">Bill — {selectedMonth.label}</h3>
            {user.userType === 'pg_member' && (
              <>
                <div className="breakdown-row">
                  <div className="breakdown-label">Monthly Rent</div>
                  <div className="breakdown-value">{fmtRupee(RENT_AMOUNT)}</div>
                </div>
                <div className="breakdown-separator" />
              </>
            )}
            <div className="breakdown-row">
              <div className="breakdown-label">
                Food Charges
                <span className="breakdown-detail">{user.foodDays} days × ₹{FOOD_COST_PER_DAY}</span>
              </div>
              <div className="breakdown-value">{fmtRupee(user.foodCost)}</div>
            </div>
            <div className="breakdown-meals">
              <div className="meal-count"><span className="meal-icon">🍳</span> Breakfast: {user.breakfast} days</div>
              <div className="meal-count"><span className="meal-icon">🍽️</span> Dinner: {user.dinner} days</div>
            </div>
            <div className="breakdown-separator" />
            <div className="breakdown-row breakdown-total">
              <div className="breakdown-label">Total Due</div>
              <div className="breakdown-value total">{fmtRupee(user.total)}</div>
            </div>
          </div>

          {/* Payment info from payments collection */}
          {pay ? (
            <>
              {/* Status bar */}
              <div className={`ap-detail-status-bar ${pay.verificationStatus || 'pending'}`} style={{ marginBottom: '16px' }}>
                <StatusPill status={pay.verificationStatus} />
                <span className="ap-detail-status-text">{pay.verificationReason || '—'}</span>
              </div>

              {/* Payment details */}
              <div className="ap-payment-details">
                {pay.utr && (
                  <div className="ap-detail-row">
                    <span className="ap-detail-key">UTR / Txn ID</span>
                    <span className="ap-detail-val mono">{pay.utr}</span>
                  </div>
                )}
                <div className="ap-detail-row">
                  <span className="ap-detail-key">Amount Paid</span>
                  <span className="ap-detail-val">{fmtRupee(pay.amount)}</span>
                </div>
                {pay.createdAt && (
                  <div className="ap-detail-row">
                    <span className="ap-detail-key">Submitted On</span>
                    <span className="ap-detail-val">
                      {pay.createdAt.toDate
                        ? pay.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                  </div>
                )}
              </div>

              {/* Screenshot */}
              {pay.screenshotUrl && (
                <div className="ap-receipt-wrap">
                  <div className="ap-receipt-label">📷 Payment Screenshot</div>
                  <img src={pay.screenshotUrl} alt="Receipt" className="ap-receipt-img" />
                  <a href={pay.screenshotUrl} target="_blank" rel="noreferrer" className="screenshot-view-link">
                    View full image ↗
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className={`ap-detail-status-bar pending`} style={{ marginBottom: '16px' }}>
              <StatusPill status="pending" />
              <span className="ap-detail-status-text">No payment submitted yet for this month</span>
            </div>
          )}

          {/* Admin override buttons */}
          <div className="ap-admin-actions">
            <div className="ap-admin-actions-label">Admin Override</div>
            <div className="ap-admin-btns">
              <button
                className="ap-admin-btn paid"
                onClick={() => handleMarkStatus('paid')}
                disabled={saving || user.paymentStatus === 'paid'}
              >
                ✅ Mark Paid
              </button>
              <button
                className="ap-admin-btn rejected"
                onClick={() => handleMarkStatus('rejected')}
                disabled={saving || user.paymentStatus === 'rejected'}
              >
                ❌ Reject
              </button>
              <button
                className="ap-admin-btn review"
                onClick={() => handleMarkStatus('pending_review')}
                disabled={saving}
              >
                🔍 Flag Review
              </button>
            </div>
            {saving && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>Saving…</div>}
          </div>

          {/* Daily food breakdown */}
          <div className="ap-daily-section" style={{ marginTop: '20px' }}>
            <div className="ap-daily-title">📅 Daily Food Selections ({days.length} days)</div>
            {days.length > 0 ? (
              <>
                <div className="ap-daily-grid">
                  {days.map(day => (
                    <div key={day.dateKey} className="ap-daily-chip">
                      <span className="ap-daily-num">{day.d}</span>
                      <div className="ap-daily-meals">
                        {day.breakfast && <span className="ap-meal-dot b" title="Breakfast" />}
                        {day.dinner    && <span className="ap-meal-dot d" title="Dinner" />}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ap-daily-legend">
                  <span><span className="ap-meal-dot b" /> Breakfast</span>
                  <span><span className="ap-meal-dot d" /> Dinner</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: '#9ca3af', padding: '12px 0' }}>No food selections this month</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── User Card ────────────────────────────────────────────────────────────────
function UserCard({ user, onClick }) {
  const color = user.userType === 'pg_member' ? '#10b981' : '#f59e0b';
  return (
    <div className="ap-user-card" onClick={() => onClick(user)}>
      <div className="ap-user-avatar" style={{ background: color }}>
        {(user.displayName[0] || '?').toUpperCase()}
      </div>
      <div className="ap-user-info">
        <div className="ap-user-name">{user.displayName}</div>
        <div className="ap-user-sub">
          @{user.username || '—'} &nbsp;·&nbsp; {user.foodDays} food day{user.foodDays !== 1 ? 's' : ''}
        </div>
        {user.payment?.utr && (
          <div className="ap-user-sub-detail">UTR: {user.payment.utr}</div>
        )}
      </div>
      <div className="ap-user-right">
        <div className="ap-user-amount">{fmtRupee(user.total)}</div>
        <StatusPill status={user.paymentStatus} />
      </div>
      <div className="ap-chevron">›</div>
    </div>
  );
}

// ─── Group Section ────────────────────────────────────────────────────────────
function GroupSection({ label, users, onUserClick, color }) {
  if (users.length === 0) return null;
  const groupTotal = users.reduce((s, u) => s + u.total, 0);
  const pending    = users.filter(u => u.paymentStatus === 'pending').length;
  const paid       = users.filter(u => u.paymentStatus === 'paid').length;

  return (
    <div className="ap-group">
      <div className="ap-group-header" style={{ borderLeftColor: color }}>
        <div className="ap-group-info">
          <span className="ap-group-label">{label}</span>
          <span className="ap-group-count">{users.length} member{users.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="ap-group-stats">
          <span className="ap-group-total">{fmtRupee(groupTotal)}</span>
          {paid > 0    && <span className="ap-group-badge paid">{paid} paid</span>}
          {pending > 0 && <span className="ap-group-pending">{pending} pending</span>}
        </div>
      </div>
      {users.map(u => <UserCard key={u.uid} user={u} onClick={onUserClick} />)}
    </div>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(users, monthLabel) {
  const headers = ['Name','Username','Role','Food Days','Breakfast','Dinner','Rent (₹)','Food Cost (₹)','Total (₹)','UTR','Payment Status'];
  const rows = users.map(u => [
    u.displayName,
    u.username || '',
    u.userType === 'pg_member' ? 'PG Member' : 'Mess Member',
    u.foodDays,
    u.breakfast,
    u.dinner,
    u.rent,
    u.foodCost,
    u.total,
    u.payment?.utr || '',
    u.paymentStatus === 'paid' ? 'Paid' :
    u.paymentStatus === 'pending_review' ? 'Pending Review' :
    u.paymentStatus === 'rejected' ? 'Rejected' : 'Pending',
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `payment_report_${monthLabel.replace(/\s/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main AdminPayment Component ──────────────────────────────────────────────
function AdminPayment() {
  const MONTH_OPTIONS = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0]);
  const [allUsers,      setAllUsers]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [roleFilter,    setRoleFilter]    = useState('all');
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [detailUser,    setDetailUser]    = useState(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { year, month, key } = selectedMonth;
      const pad   = String(month + 1).padStart(2, '0');
      const days  = new Date(year, month + 1, 0).getDate();
      const start = `${year}-${pad}-01`;
      const end   = `${year}-${pad}-${days}`;

      // 1. All non-admin users
      const usersSnap = await getDocs(collection(db, 'users'));
      const members   = usersSnap.docs
        .map(d => ({
          uid:      d.id,
          ...d.data(),
          userType: d.data().userType || (d.data().role === 'admin' ? 'admin' : 'pg_member'),
        }))
        .filter(u => u.userType !== 'admin');

      // 2. Food selections for this month (efficient batch)
      const foodSnap = await getDocs(
        query(collection(db, 'foodSelections'),
          where('date', '>=', start),
          where('date', '<=', end))
      );
      const foodByUser = {};
      foodSnap.docs.forEach(d => {
        const data = d.data();
        if (!foodByUser[data.userId]) foodByUser[data.userId] = [];
        foodByUser[data.userId].push(data);
      });

      // 3. Payments for this month (new payments collection)
      const paymentsSnap = await getDocs(
        query(collection(db, 'payments'), where('paymentMonth', '==', key))
      );
      const paymentByUser = {};
      paymentsSnap.docs.forEach(d => {
        const data = d.data();
        paymentByUser[data.userId] = data;
      });

      // 4. Compute per-user
      const computed = members.map(u => {
        const sels      = foodByUser[u.uid] || [];
        const breakfast = sels.filter(s => s.breakfast).length;
        const dinner    = sels.filter(s => s.dinner).length;
        const foodDays  = sels.filter(s => s.breakfast || s.dinner).length;
        const foodCost  = foodDays * FOOD_COST_PER_DAY;
        const rent      = u.userType === 'pg_member' ? RENT_AMOUNT : 0;
        const total     = rent + foodCost;
        const payment   = paymentByUser[u.uid] || null;
        const paymentStatus = payment?.verificationStatus || 'pending';

        return {
          ...u,
          displayName:   u.fullName || u.name || u.username || 'Unknown',
          breakfast, dinner, foodDays, foodCost, rent, total,
          payment,       // full payment object (or null)
          paymentStatus, // 'paid' | 'pending_review' | 'rejected' | 'pending'
          selections:    sels,
        };
      });

      setAllUsers(computed);
    } catch (err) {
      console.error('AdminPayment load error:', err);
      alert('Failed to load: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter & Group ──────────────────────────────────────────────────────────
  const filtered = allUsers
    .filter(u => roleFilter === 'all' || u.userType === roleFilter)
    .filter(u => statusFilter === 'all' || u.paymentStatus === statusFilter)
    .filter(u => !search ||
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.payment?.utr || '').toLowerCase().includes(search.toLowerCase())
    );

  const pgMembers   = filtered.filter(u => u.userType === 'pg_member');
  const messMembers = filtered.filter(u => u.userType === 'mess_member');

  // ── Summary stats ───────────────────────────────────────────────────────────
  const totalOutstanding = allUsers.filter(u => u.paymentStatus !== 'paid').reduce((s, u) => s + u.total, 0);
  const countPending     = allUsers.filter(u => u.paymentStatus === 'pending').length;
  const countReview      = allUsers.filter(u => u.paymentStatus === 'pending_review').length;
  const countPaid        = allUsers.filter(u => u.paymentStatus === 'paid').length;

  return (
    <div className="ap-container" id="ap-printable">

      {/* ── Header ── */}
      <div className="ap-header no-print">
        <div>
          <h2 className="ap-title">Payment Report</h2>
          <p className="ap-subtitle">
            {selectedMonth.label} &nbsp;·&nbsp; {allUsers.length} member{allUsers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="ap-export-btns">
          <button className="ap-export-btn csv" onClick={() => exportCSV(filtered, selectedMonth.label)}>
            📊 CSV
          </button>
          <button className="ap-export-btn pdf" onClick={() => window.print()}>
            🖨 PDF
          </button>
        </div>
      </div>

      {/* ── Month selector ── */}
      <div className="ap-month-row no-print">
        <select
          className="ap-month-select"
          value={selectedMonth.key}
          onChange={e => {
            const m = MONTH_OPTIONS.find(o => o.key === e.target.value);
            if (m) setSelectedMonth(m);
          }}
        >
          {MONTH_OPTIONS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <button className="ap-refresh-btn" onClick={loadData} disabled={loading}>
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {/* ── Print header ── */}
      <div className="print-only ap-print-header">
        <h2>PG Manager — Payment Report</h2>
        <p>{selectedMonth.label} &nbsp;·&nbsp; Generated {new Date().toLocaleDateString('en-IN')}</p>
      </div>

      {/* ── Summary cards ── */}
      <div className="ap-summary-row">
        <div className="ap-summary-card" style={{ borderTopColor: '#6366f1' }}>
          <div className="ap-summary-num purple">{fmtRupee(totalOutstanding)}</div>
          <div className="ap-summary-lbl">Outstanding</div>
        </div>
        <div className="ap-summary-card" style={{ borderTopColor: '#ef4444' }}>
          <div className="ap-summary-num red">{countPending}</div>
          <div className="ap-summary-lbl">Pending</div>
        </div>
        <div className="ap-summary-card" style={{ borderTopColor: '#f59e0b' }}>
          <div className="ap-summary-num amber">{countReview}</div>
          <div className="ap-summary-lbl">Review</div>
        </div>
        <div className="ap-summary-card" style={{ borderTopColor: '#10b981' }}>
          <div className="ap-summary-num green">{countPaid}</div>
          <div className="ap-summary-lbl">Paid ✅</div>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="ap-toolbar no-print">
        <input
          className="ap-search"
          placeholder="🔍 Search by name, @username or UTR…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="ap-filter-row">
          <select className="ap-filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="pg_member">🏠 PG Members</option>
            <option value="mess_member">🍽 Mess Members</option>
          </select>
          <select className="ap-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="pending_review">🔍 Review</option>
            <option value="paid">✅ Paid</option>
            <option value="rejected">❌ Rejected</option>
          </select>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="ap-loading no-print">
          <div className="chat-spinner" />
          <div className="ap-loading-text">Loading payment data…</div>
        </div>
      ) : (
        <div className="ap-content">
          <GroupSection
            label="🏠 PG Members"
            users={pgMembers}
            onUserClick={setDetailUser}
            color="#10b981"
          />
          <GroupSection
            label="🍽 Mess Members"
            users={messMembers}
            onUserClick={setDetailUser}
            color="#f59e0b"
          />
          {filtered.length === 0 && (
            <div className="ap-empty">
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📋</div>
              <div className="ap-empty-text">No members match your filters</div>
            </div>
          )}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailUser && (
        <DetailModal
          user={detailUser}
          selectedMonth={selectedMonth}
          onClose={() => setDetailUser(null)}
          onStatusChange={loadData}
        />
      )}
    </div>
  );
}

export default AdminPayment;
