import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// This apiKey is not a secret — Firebase web apps always ship it in
// client code. The actual security boundary is the Realtime Database
// rules (see firebase.rules.json) plus the login gate in AuthGate.jsx.
const firebaseConfig = {
  apiKey: "AIzaSyDgmKD_MBq81T3sxAKNFY_0B5Eq39qzHzQ",
  authDomain: "teaching-record-v2.firebaseapp.com",
  databaseURL: "https://teaching-record-v2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "teaching-record-v2",
  storageBucket: "teaching-record-v2.firebasestorage.app",
  messagingSenderId: "929672928545",
  appId: "1:929672928545:web:180a789d140ec60943f260",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
