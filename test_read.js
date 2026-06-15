import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCel-IRB04q6WGIQDFYmchr8E-lYkGK2RI",
  authDomain: "pg-food-rent-manager.firebaseapp.com",
  projectId: "pg-food-rent-manager",
  storageBucket: "pg-food-rent-manager.firebasestorage.app",
  messagingSenderId: "436841313513",
  appId: "1:436841313513:web:94de7a23fa8403e9f6ac78"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log("Fetching food selections...");
  const snap = await getDocs(collection(db, "foodSelections"));
  console.log(`Found ${snap.size} entries.`);
  const dates = [];
  snap.forEach(doc => {
    dates.push({ id: doc.id, date: doc.data().date });
  });
  console.log(JSON.stringify(dates, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
