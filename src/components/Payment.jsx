import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { uploadToSupabase } from '../supabase';
import {
  doc, getDoc, setDoc, getDocs,
  collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { RupeeIcon, CalendarIcon, ImageIcon, CloseIcon } from './Icons';

// ─── Constants ────────────────────────────────────────────────────────────────
const RENT_AMOUNT    = 2500;
const BREAKFAST_COST = 35;
const DINNER_COST    = 40;
const UPI_ID         = 'nishanpoojary1515@oksbi';
const UPI_NAME       = 'PG%20Management';
const MAX_SS_SIZE     = 5 * 1024 * 1024; // 5 MB

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatusBanner({ status }) {
  const cfg = {
    paid:           { bg: '#f0fdf4', border: '#bbf7d0', icon: '✅', color: '#15803d', text: 'Payment Verified — PAID' },
    pending_review: { bg: '#fffbeb', border: '#fde68a', icon: '🔍', color: '#b45309', text: 'Under Review by Admin' },
    rejected:       { bg: '#fef2f2', border: '#fecaca', icon: '❌', color: '#b91c1c', text: 'Payment Rejected — Contact Admin' },
  };
  const c = cfg[status] || cfg.pending_review;
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: '12px',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px',
      marginBottom: '16px',
    }}>
      <span style={{ fontSize: '22px' }}>{c.icon}</span>
      <div>
        <div style={{ fontWeight: '800', fontSize: '15px', color: c.color }}>{c.text}</div>
        {status === 'paid' && (
          <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>
            UTR verified successfully — no duplicate found
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Payment Component ───────────────────────────────────────────────────
function Payment({ userType, currentUser }) {
  const resolvedType = userType || 'pg_member';

  const isMess       = resolvedType === 'mess_member';

  const now          = new Date();
  const currentYear  = now.getFullYear();
  const currentMonth = now.getMonth();
  const monthKey     = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // ── Billing state ──────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true);
  const [monthlyData, setMonthlyData] = useState({
    month: '', rent: isMess ? 0 : RENT_AMOUNT,
    foodDays: 0, foodCost: 0, total: isMess ? 0 : RENT_AMOUNT,
    breakfastCount: 0, dinnerCount: 0,
  });

  // ── Payment state ──────────────────────────────────────────────────────────
  const [existingPayment, setExistingPayment] = useState(null); // from 'payments' collection
  const [payLoading,      setPayLoading]      = useState(true);
  const [showPayForm,     setShowPayForm]     = useState(false);
  const [utr,             setUtr]             = useState('');
  const [ssFile,          setSsFile]          = useState(null);
  const [ssPreview,       setSsPreview]       = useState(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitError,     setSubmitError]     = useState('');

  const ssInputRef = useRef(null);

  useEffect(() => {
    loadBilling();
    loadExistingPayment();
  }, []);

  // ── Load billing calculation ───────────────────────────────────────────────
  const loadBilling = async () => {
    if (!auth.currentUser) { setLoading(false); return; }
    setLoading(true);
    try {
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      let totalBreakfast = 0, totalDinner = 0, daysWithFood = 0;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        try {
          const snap = await getDoc(doc(db, 'foodSelections', `${auth.currentUser.uid}_${dateKey}`));
          if (snap.exists()) {
            const d = snap.data();
            if (d.breakfast) totalBreakfast++;
            if (d.dinner)    totalDinner++;
            if (d.breakfast || d.dinner) daysWithFood++;
          }
        } catch { /* skip */ }
      }

      const foodCost    = (totalBreakfast * BREAKFAST_COST) + (totalDinner * DINNER_COST);
      const rent        = isMess ? 0 : RENT_AMOUNT;
      const totalAmount = rent + foodCost;

      setMonthlyData({
        month:          now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        rent, foodDays: daysWithFood, foodCost,
        total: totalAmount,
        breakfastCount: totalBreakfast,
        dinnerCount:    totalDinner,
      });
    } catch (err) {
      console.error('Billing error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load existing payment from 'payments' collection ──────────────────────
  const loadExistingPayment = async () => {
    if (!auth.currentUser) { setPayLoading(false); return; }
    setPayLoading(true);
    try {
      const snap = await getDoc(doc(db, 'payments', `${auth.currentUser.uid}_${monthKey}`));
      setExistingPayment(snap.exists() ? snap.data() : null);
    } catch (err) {
      console.error('Payment load error:', err);
    } finally {
      setPayLoading(false);
    }
  };

  // ── UPI Pay Now ────────────────────────────────────────────────────────────
  const handlePayNow = () => {
    const upiUrl = `upi://pay?pa=${UPI_ID}&pn=${UPI_NAME}&am=${monthlyData.total}&tn=PG%20Payment%20${monthKey}&cu=INR`;
    // Try to open UPI app
    const a = document.createElement('a');
    a.href = upiUrl;
    a.click();
    // Show submission form immediately so user can fill in while app opens
    setTimeout(() => setShowPayForm(true), 400);
  };

  // ── Screenshot picker ──────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > MAX_SS_SIZE) { alert('File too large (max 5 MB)'); return; }
    const reader = new FileReader();
    reader.onload = ev => setSsPreview(ev.target.result);
    reader.readAsDataURL(file);
    setSsFile(file);
    e.target.value = '';
  };

  // ── Submit payment ────────────────────────────────────────────────────────
  const handleSubmitPayment = async () => {
    setSubmitError('');
    const utrClean = utr.trim().toUpperCase();

    if (!utrClean)        { setSubmitError('Please enter your UTR / Transaction number'); return; }
    if (utrClean.length < 8) { setSubmitError('UTR number looks too short — please check'); return; }
    if (!ssFile)          { setSubmitError('Please upload your payment screenshot'); return; }
    if (!auth.currentUser) return;

    setSubmitting(true);
    try {
      // 1. Check for duplicate UTR across all payments
      const dupSnap = await getDocs(
        query(collection(db, 'payments'), where('utr', '==', utrClean))
      );
      if (!dupSnap.empty) {
        setSubmitError('❌ This UTR number has already been used. If this is a mistake, contact admin.');
        setSubmitting(false);
        return;
      }

      // 2. Upload screenshot to Supabase
      const screenshotUrl = await uploadToSupabase(
        'payment-screenshots',
        auth.currentUser.uid,
        ssFile
      );

      // 3. Save to 'payments' collection — status = 'paid' (UTR is unique = verified)
      await setDoc(
        doc(db, 'payments', `${auth.currentUser.uid}_${monthKey}`),
        {
          userId:             auth.currentUser.uid,
          userType:           resolvedType,
          userName:           currentUser?.fullName || currentUser?.name || 'User',
          username:           currentUser?.username || '',
          amount:             monthlyData.total,
          rent:               monthlyData.rent,
          foodCost:           monthlyData.foodCost,
          foodDays:           monthlyData.foodDays,
          utr:                utrClean,
          screenshotUrl,
          paymentMonth:       monthKey,
          verificationStatus: 'paid',
          verificationReason: 'Auto-verified: UTR is unique — no duplicate found',
          createdAt:          serverTimestamp(),
        }
      );

      // 4. Reload
      await loadExistingPayment();
      setShowPayForm(false);
      setSsFile(null);
      setSsPreview(null);
      setUtr('');

    } catch (err) {
      console.error('Submit error:', err);
      setSubmitError('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (loading || payLoading) {
    return (
      <div className="payment-container">
        <div className="payment-header">
          <h2 className="payment-title">Payment</h2>
        </div>
        <div className="empty-state">
          <div className="chat-spinner" />
          <div className="empty-text" style={{ marginTop: '12px' }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-container">
      {/* Header */}
      <div className="payment-header">
        <h2 className="payment-title">Payment</h2>
        <div className="payment-subtitle">{monthlyData.month}</div>
        <div className={`payment-type-badge ${isMess ? 'mess' : 'pg'}`}>
          {isMess ? '🍽 Mess Member' : '🏠 PG Member'}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="payment-summary">
        <div className="summary-card total-due">
          <div className="summary-icon"><RupeeIcon /></div>
          <div className="summary-content">
            <div className="summary-label">Total Due</div>
            <div className="summary-amount">₹{monthlyData.total}</div>
          </div>
        </div>
        <div className="summary-card total-paid">
          <div className="summary-icon"><CalendarIcon /></div>
          <div className="summary-content">
            <div className="summary-label">Food Days</div>
            <div className="summary-amount">{monthlyData.foodDays}</div>
          </div>
        </div>
      </div>

      {/* Bill Breakdown */}
      <div className="payment-breakdown-card">
        <h3 className="breakdown-title">Bill Breakdown</h3>
        <div className="breakdown-row">
          <div className="breakdown-label">
            Monthly Rent
            {isMess && <span className="breakdown-na-badge">N/A</span>}
          </div>
          <div className={`breakdown-value ${isMess ? 'na-value' : ''}`}>
            {isMess ? '₹0' : `₹${RENT_AMOUNT}`}
          </div>
        </div>
        <div className="breakdown-separator" />
        <div className="breakdown-row">
          <div className="breakdown-label">
            Food Charges
            <span className="breakdown-detail">
              Breakfast: {monthlyData.breakfastCount} × ₹{BREAKFAST_COST} | Dinner: {monthlyData.dinnerCount} × ₹{DINNER_COST}
            </span>
          </div>
          <div className="breakdown-value">₹{monthlyData.foodCost}</div>
        </div>
        <div className="breakdown-meals">
          <div className="meal-count"><span className="meal-icon">🍳</span><span>Breakfast: {monthlyData.breakfastCount} days</span></div>
          <div className="meal-count"><span className="meal-icon">🍽️</span><span>Dinner: {monthlyData.dinnerCount} days</span></div>
        </div>
        <div className="breakdown-separator" />
        <div className="breakdown-row breakdown-total">
          <div className="breakdown-label">Total Amount</div>
          <div className="breakdown-value total">₹{monthlyData.total}</div>
        </div>
      </div>

      {/* ── Payment Section ── */}
      {existingPayment ? (
        /* Already submitted this month */
        <div className="pay-section">
          <StatusBanner status={existingPayment.verificationStatus} />
          <div className="pay-receipt-card">
            <div className="pay-receipt-row">
              <span className="pay-receipt-label">UTR / Transaction ID</span>
              <span className="pay-receipt-value mono">{existingPayment.utr || '—'}</span>
            </div>
            <div className="pay-receipt-row">
              <span className="pay-receipt-label">Amount Paid</span>
              <span className="pay-receipt-value">₹{existingPayment.amount}</span>
            </div>
            <div className="pay-receipt-row">
              <span className="pay-receipt-label">Payment Month</span>
              <span className="pay-receipt-value">{existingPayment.paymentMonth}</span>
            </div>
            {existingPayment.screenshotUrl && (
              <div className="pay-screenshot-wrap">
                <div className="pay-receipt-label" style={{ marginBottom: '8px' }}>📷 Screenshot</div>
                <img
                  src={existingPayment.screenshotUrl}
                  alt="Payment receipt"
                  className="pay-screenshot-thumb"
                />
                <a
                  href={existingPayment.screenshotUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="screenshot-view-link"
                >
                  View full image ↗
                </a>
              </div>
            )}
          </div>
          <button
            className="refresh-button"
            onClick={loadBilling}
            style={{ marginTop: '12px' }}
          >
            🔄 Refresh
          </button>
        </div>
      ) : showPayForm ? (
        /* Payment submission form */
        <div className="pay-section">
          <div className="pay-form-header">
            <span style={{ fontSize: '20px' }}>📤</span>
            <div>
              <div className="pay-form-title">Submit Payment Proof</div>
              <div className="pay-form-sub">Enter your UTR number and upload screenshot</div>
            </div>
          </div>

          {/* UTR input */}
          <div className="pay-field">
            <label className="pay-field-label">UTR / Transaction Number *</label>
            <input
              className="form-input pay-utr-input"
              placeholder="e.g. 512345678901"
              value={utr}
              onChange={e => { setUtr(e.target.value); setSubmitError(''); }}
              maxLength={30}
            />
            <div className="pay-field-hint">
              Find this in your UPI app — usually 12 digits (e.g. "UTR: 512345678901")
            </div>
          </div>

          {/* Screenshot upload */}
          <div className="pay-field">
            <label className="pay-field-label">Payment Screenshot *</label>
            {ssPreview ? (
              <div className="pay-preview-wrap">
                <img src={ssPreview} alt="Preview" className="pay-preview-img" />
                <button
                  className="pay-preview-remove"
                  onClick={() => { setSsFile(null); setSsPreview(null); }}
                >
                  <CloseIcon />
                </button>
              </div>
            ) : (
              <button
                className="pay-ss-pick-btn"
                onClick={() => ssInputRef.current?.click()}
              >
                <ImageIcon />
                <span>Choose Screenshot</span>
              </button>
            )}
            <input
              ref={ssInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* Error */}
          {submitError && (
            <div className="pay-error">{submitError}</div>
          )}

          {/* Submit */}
          <button
            className="pay-submit-btn"
            onClick={handleSubmitPayment}
            disabled={submitting}
          >
            {submitting ? '⏳ Verifying & Submitting…' : '✅ Submit Payment'}
          </button>

          <button
            className="cancel-btn"
            onClick={() => { setShowPayForm(false); setSubmitError(''); }}
            disabled={submitting}
            style={{ marginTop: '10px', width: '100%' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Pay Now section */
        <div className="pay-section">
          {/* UPI Info card */}
          <div className="pay-upi-card">
            <div className="pay-upi-header">
              <span style={{ fontSize: '28px' }}>📲</span>
              <div>
                <div className="pay-upi-title">Pay via UPI</div>
                <div className="pay-upi-sub">Tap below to open your UPI app</div>
              </div>
            </div>
            <div className="pay-upi-details">
              <div className="pay-upi-row">
                <span className="pay-upi-label">UPI ID</span>
                <span className="pay-upi-value mono">{UPI_ID.replace('%40', '@')}</span>
              </div>
              <div className="pay-upi-row">
                <span className="pay-upi-label">Amount</span>
                <span className="pay-upi-value amount">₹{monthlyData.total}</span>
              </div>
              <div className="pay-upi-row">
                <span className="pay-upi-label">Month</span>
                <span className="pay-upi-value">{monthlyData.month}</span>
              </div>
            </div>
          </div>

          {/* Pay Now button */}
          <button className="pay-now-btn" onClick={handlePayNow}>
            <span style={{ fontSize: '22px' }}>💳</span>
            Pay ₹{monthlyData.total} Now
          </button>

          <div className="pay-already-btn-wrap">
            <span className="pay-already-text">Already paid?</span>
            <button
              className="pay-already-btn"
              onClick={() => setShowPayForm(true)}
            >
              Submit proof →
            </button>
          </div>

          <div className="payment-info">
            <div className="info-icon">ℹ️</div>
            <div className="info-text">
              {isMess
                ? `Breakfast ₹${BREAKFAST_COST}, Dinner ₹${DINNER_COST}. Mess Members: food charges only.`
                : `Rent ₹2,500 + Breakfast ₹${BREAKFAST_COST}, Dinner ₹${DINNER_COST}. After paying, enter UTR & upload screenshot.`}
            </div>
          </div>
        </div>
      )}

      {/* Refresh billing */}
      {!existingPayment && (
        <button className="refresh-button" onClick={loadBilling} disabled={loading}>
          {loading ? 'Refreshing…' : '🔄 Refresh Billing'}
        </button>
      )}
    </div>
  );
}

export default Payment;