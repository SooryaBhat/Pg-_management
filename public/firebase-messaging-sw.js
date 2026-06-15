// Import Firebase scripts from CDN
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize Firebase App in service worker
firebase.initializeApp({
  apiKey: "AIzaSyCel-IRB04q6WGIQDFYmchr8E-lYkGK2RI",
  authDomain: "pg-food-rent-manager.firebaseapp.com",
  projectId: "pg-food-rent-manager",
  storageBucket: "pg-food-rent-manager.firebasestorage.app",
  messagingSenderId: "436841313513",
  appId: "1:436841313513:web:94de7a23fa8403e9f6ac78"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message payload:', payload);
  
  const title = payload.data?.title || payload.notification?.title || 'Notification';
  const body = payload.data?.body || payload.notification?.body || '';
  const icon = '/pg-logo.jpg';
  
  const notificationOptions = {
    body: body,
    icon: icon,
    badge: icon,
    tag: payload.data?.type || 'system',
    data: payload.data || {}
  };

  self.registration.showNotification(title, notificationOptions);
});
