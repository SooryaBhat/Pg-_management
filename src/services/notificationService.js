import { db, messaging } from '../firebase';
import { 
  collection, addDoc, serverTimestamp, getDoc, doc, 
  updateDoc, setDoc, arrayUnion, getDocs, query, where 
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

/**
 * Registers notification permission and registers FCM token in Firestore.
 */
export async function requestNotificationPermission(userId) {
  if (!('Notification' in window)) {
    console.warn("This browser does not support notifications.");
    return false;
  }

  if (Notification.permission === 'granted') {
    await registerFCMToken(userId);
    return true;
  }

  if (Notification.permission === 'denied') {
    console.warn("Notification permission is denied.");
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerFCMToken(userId);
      return true;
    }
  } catch (err) {
    console.error("Error requesting notifications permission:", err);
  }
  return false;
}

/**
 * Gets FCM registration token and saves it in users/{userId}/fcmTokens.
 */
export async function registerFCMToken(userId) {
  if (!messaging) {
    console.warn("Firebase Messaging is not initialized or supported in this browser.");
    return;
  }
  try {
    // VAPID key is acquired from environment or defaults to common public VAPID
    const envVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    console.log("VITE_FIREBASE_VAPID_KEY value from env:", envVapidKey);
    if (envVapidKey) {
      console.log("VITE_FIREBASE_VAPID_KEY length:", envVapidKey.length);
    } else {
      console.warn("VITE_FIREBASE_VAPID_KEY is not defined in env!");
    }

    const vapidKey = envVapidKey || 'BEl5c93pP5H7rE0Z1456nQf_p787gW307e2Z-8n8fQ0c058778c8c78';
    console.log("VAPID key being passed to getToken():", vapidKey, "Length:", vapidKey.length);
    
    const token = await getToken(messaging, { vapidKey: vapidKey });
    if (token) {
      console.log("FCM registration token acquired:", token);
      await updateDoc(doc(db, 'users', userId), {
        fcmTokens: arrayUnion(token)
      });
    } else {
      console.warn("No FCM registration token received.");
    }
  } catch (err) {
    console.error("Error acquiring FCM registration token:", err);
  }
}

/**
 * Set up a listener for real-time foreground messaging pushes
 */
export function setupForegroundMessageListener() {
  if (!messaging) return;
  onMessage(messaging, (payload) => {
    console.log("Foreground message received:", payload);
    const title = payload.notification?.title || payload.data?.title || 'Notification';
    const body = payload.notification?.body || payload.data?.body || '';
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '/pg-logo.jpg'
      });
    }
  });
}

/**
 * Send a notification: creates a doc in Firestore, then pushes to user FCM token list.
 */
export async function sendNotificationToUser(userId, title, message, type) {
  const notificationDoc = {
    userId,
    title,
    message,
    type, // 'announcements' | 'chat' | 'payment_reminder' | 'payment_status' | 'system'
    read: false,
    createdAt: new Date()
  };

  try {
    // 1. Save to firestore notifications collection
    await addDoc(collection(db, 'notifications'), notificationDoc);
  } catch (err) {
    console.error('Error saving notification in firestore:', err);
  }

  try {
    // 2. Fetch target user's FCM tokens and send push
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const fcmTokens = userData.fcmTokens || [];
      const legacyKey = import.meta.env.VITE_FCM_SERVER_KEY;
      
      if (legacyKey && fcmTokens.length > 0) {
        for (const token of fcmTokens) {
          try {
            await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${legacyKey}`
              },
              body: JSON.stringify({
                to: token,
                notification: {
                  title,
                  body: message,
                  icon: '/pg-logo.jpg',
                  click_action: window.location.origin
                },
                data: {
                  type,
                  title,
                  body: message
                }
              })
            });
          } catch (e) {
            console.error('FCM HTTP legacy push dispatch failed:', e);
          }
        }
      }
    }
  } catch (err) {
    console.error('FCM push notification dispatch flow error:', err);
  }
}

/**
 * Utility to resolve user monthly billing plan with historical auto-continuation.
 * Default is Plan A.
 */
export function getUserPlanForMonth(monthlyPlans, targetMonthKey) {
  if (!monthlyPlans || typeof monthlyPlans !== 'object') {
    return 'A';
  }
  if (monthlyPlans[targetMonthKey]) {
    return monthlyPlans[targetMonthKey];
  }
  // Find the closest configured month chronologically <= targetMonthKey
  const keys = Object.keys(monthlyPlans).sort();
  let resolved = 'A';
  for (const k of keys) {
    if (k <= targetMonthKey) {
      resolved = monthlyPlans[k];
    } else {
      break;
    }
  }
  return resolved;
}

/**
 * Checks and triggers payment reminders if current day >= 28th and lastSentDate !== today.
 */
export async function runPaymentReminderCheck() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const dayOfMonth = today.getDate();

  // Payment reminders run daily starting on the 28th
  if (dayOfMonth < 28) return;

  try {
    const logRef = doc(db, 'reminders', 'payment_reminder_log');
    const logSnap = await getDoc(logRef);
    if (logSnap.exists() && logSnap.data().lastSentDate === dateStr) {
      console.log('Payment reminders already sent today.');
      return;
    }

    // Set lock date in Firestore
    await setDoc(logRef, { lastSentDate: dateStr }, { merge: true });

    // Load PG members and Mess members
    const usersSnap = await getDocs(collection(db, 'users'));
    const members = usersSnap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.userType === 'pg_member' || u.userType === 'mess_member');

    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const pad = String(today.getMonth() + 1).padStart(2, '0');
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const start = `${today.getFullYear()}-${pad}-01`;
    const end = `${today.getFullYear()}-${pad}-${daysInMonth}`;

    // Load food selections
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

    // Load payments
    const paymentsSnap = await getDocs(
      query(collection(db, 'payments'), where('paymentMonth', '==', monthKey))
    );
    const paymentsByUser = {};
    paymentsSnap.docs.forEach(d => {
      const data = d.data();
      paymentsByUser[data.userId] = data;
    });

    for (const member of members) {
      const payment = paymentsByUser[member.uid];
      const status = payment?.verificationStatus || 'pending';

      if (status !== 'paid') {
        let total = 0;
        if (member.userType === 'mess_member') {
          total = 3200;
        } else {
          // pg_member plan calculation
          const activePlan = getUserPlanForMonth(member.monthlyPlans, monthKey);
          if (activePlan === 'B') {
            total = 3000;
          } else { // Plan A (default)
            total = 5700;
          }
        }

        const title = 'Sri Sai PG: Payment Pending ⏳';
        const message = `Your PG payment of ₹${total} is pending.`;
        
        await sendNotificationToUser(member.uid, title, message, 'payment_reminder');
      }
    }
  } catch (err) {
    console.error('Error running daily payment reminders check:', err);
  }
}

