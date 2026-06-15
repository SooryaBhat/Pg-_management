import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyCel-IRB04q6WGIQDFYmchr8E-lYkGK2RI",
  authDomain: "pg-food-rent-manager.firebaseapp.com",
  projectId: "pg-food-rent-manager",
  storageBucket: "pg-food-rent-manager.firebasestorage.app",
  messagingSenderId: "436841313513",
  appId: "1:436841313513:web:94de7a23fa8403e9f6ac78"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase Auth + Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Conditionally initialize Messaging to avoid crash in environments where FCM isn't supported (e.g. some webviews/incognito)
export let messaging = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch((err) => {
  console.warn("FCM isSupported check failed. FCM notifications will be unavailable.", err);
});
