import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { uploadToSupabase } from '../supabase';
import {
  doc, getDoc, setDoc, getDocs,
  collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { RupeeIcon, CalendarIcon, ImageIcon, CloseIcon } from './Icons';
import { getUserPlanForMonth } from '../services/notificationService';

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

  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextMonthKey  = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthLabel = nextMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isLocked      = now.getDate() > 25;

  // ── Billing state ──────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true);
  const [monthlyData, setMonthlyData] = useState({
    month: '', rent: isMess ? 0 : RENT_AMOUNT,
    foodDays: 0, foodCost: 0, total: isMess ? 0 : RENT_AMOUNT,
    breakfastCount: 0, lunchCount: 0, dinnerCount: 0, activePlan: 'A'
  });

  const [userPlans,   setUserPlans]   = useState({});
  const [planSaving,  setPlanSaving]  = useState(false);

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
      // Fetch user's monthlyPlans
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      let plans = {};
      if (userSnap.exists()) {
        plans = userSnap.data().monthlyPlans || {};
      }
      setUserPlans(plans);

      const activePlan = getUserPlanForMonth(plans, monthKey);

      let rent = 0;
      let foodCost = 0;
      let totalAmount = 0;
      let totalBreakfast = 0;
      let totalLunch = 0;
      let totalDinner = 0;
      let daysWithFood = 0;
      if (isMess) {
        rent = 0;
        foodCost = 3200;
        totalAmount = 3200;
      } else {
        if (activePlan === 'B') {
          rent = 3000;
          foodCost = 0;
          totalAmount = 3000;
        } else { // Default Plan A
          rent = 2500;
          foodCost = 3200;
          totalAmount = 5700;
        }
      }

      console.log(`[Billing Debug] Selected Plan: ${activePlan}`);
      console.log(`[Billing Debug] Calculated Amount: ${totalAmount}`);
      console.log(`[Billing Debug] Resolved Monthly Plan: ${activePlan}`);

      setMonthlyData({
        month:          now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        rent,
        foodDays:       daysWithFood,
        foodCost,
        total:          totalAmount,
        breakfastCount: totalBreakfast,
        lunchCount:     totalLunch,
        dinnerCount:    totalDinner,
        activePlan,
      });
    } catch (err) {
      console.error('Billing error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async (chosenPlan) => {
    if (isLocked) return;
    setPlanSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const updatedPlans = { 
        ...userPlans, 
        [monthKey]: chosenPlan,
        [nextMonthKey]: chosenPlan 
      };
      await setDoc(userRef, { monthlyPlans: updatedPlans }, { merge: true });
      setUserPlans(updatedPlans);
      console.log(`[Plan Selection] Saved chosenPlan: ${chosenPlan} for month: ${monthKey} and nextMonth: ${nextMonthKey}`);
      await loadBilling();
    } catch (err) {
      console.error('Save plan error:', err);
      alert('Failed to save plan: ' + err.message);
    } finally {
      setPlanSaving(false);
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
            <div className="summary-label">Food Plan</div>
            <div className="summary-amount">
              {isMess ? 'Flat' : (monthlyData.activePlan === 'A' ? 'Flat' : (monthlyData.activePlan === 'B' ? 'None' : monthlyData.foodDays))}
            </div>
          </div>
        </div>
      </div>

      {/* Plan selection card for PG Members */}
      {!isMess && (
        <div className="my-plan-card">
          <h3 className="plan-title">My Membership Plan</h3>
          <p className="plan-subtitle">Manage your billing plan selection</p>
          
          <div className="plan-status-row">
            <span className="plan-status-label">Current Plan ({monthlyData.month})</span>
            <span className="plan-status-value">Plan {monthlyData.activePlan}</span>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div className="plan-status-label" style={{ fontWeight: '600', marginBottom: '8px' }}>
              Next Month Plan ({nextMonthLabel})
            </div>

            {isLocked ? (
              <>
                <div className="plan-status-row" style={{ borderBottom: 'none' }}>
                  <span className="plan-status-label" style={{ color: '#b45309' }}>Confirmed Selection</span>
                  <span className="plan-status-value">Plan {userPlans[nextMonthKey] || monthlyData.activePlan}</span>
                </div>
                <div className="plan-lock-badge">
                  <span>🔒</span>
                  <span>Plan selection is locked for {nextMonthLabel}. Changes are not permitted after the 25th of the month.</span>
                </div>
              </>
            ) : (
              <>
                <div className="plan-options-grid">
                  <div 
                    className={`plan-option-item ${monthlyData.activePlan === 'A' ? 'selected' : ''}`}
                    onClick={() => handleSavePlan('A')}
                  >
                    <div className="plan-option-header">
                      <span className="plan-option-name">Plan A</span>
                      <span className="plan-option-cost">₹5,700/mo</span>
                    </div>
                    <span className="plan-option-desc">Rent + Food inclusive (Flat rate)</span>
                  </div>

                  <div 
                    className={`plan-option-item ${monthlyData.activePlan === 'B' ? 'selected' : ''}`}
                    onClick={() => handleSavePlan('B')}
                  >
                    <div className="plan-option-header">
                      <span className="plan-option-name">Plan B</span>
                      <span className="plan-option-cost">₹3,000/mo</span>
                    </div>
                    <span className="plan-option-desc">Rent Only (No food included)</span>
                  </div>
                </div>
                {planSaving && <div className="plan-saving-indicator">Saving selection...</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Bill Breakdown */}
      <div className="payment-breakdown-card">
        <h3 className="breakdown-title">Bill Breakdown {isMess ? '' : `— Plan ${monthlyData.activePlan}`}</h3>
        <div className="breakdown-status-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#4b5563' }}>
          <span>Current Plan:</span>
          <span style={{ fontWeight: '700' }}>
            {isMess ? 'Mess Member (Flat)' : (monthlyData.activePlan === 'B' ? 'Plan B (Rent Only)' : 'Plan A (Rent + Food)')}
          </span>
        </div>
        <div className="breakdown-separator" style={{ margin: '8px 0' }} />

        <>
          <div className="breakdown-row">
            <div className="breakdown-label">
              Monthly Rent
              {isMess && <span className="breakdown-na-badge">N/A</span>}
            </div>
            <div className={`breakdown-value ${isMess ? 'na-value' : ''}`}>
              {isMess ? '₹0' : `₹${monthlyData.rent}`}
            </div>
          </div>
          <div className="breakdown-separator" />
          <div className="breakdown-row">
            <div className="breakdown-label">
              Food Charges
              {isMess && <span className="breakdown-detail">Flat Mess Charge</span>}
              {!isMess && monthlyData.activePlan !== 'B' && <span className="breakdown-detail">Flat Food Charge</span>}
              {!isMess && monthlyData.activePlan === 'B' && <span className="breakdown-detail">No Food Plan</span>}
            </div>
            <div className="breakdown-value">₹{monthlyData.foodCost}</div>
          </div>
        </>

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
                ? `Flat Mess Charge: ₹3,200/month.`
                : monthlyData.activePlan === 'B'
                ? `Plan B: Flat Rent Only charge of ₹3,000/month.`
                : `Plan A: Flat Rent + Food charge of ₹5,700/month.`}
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