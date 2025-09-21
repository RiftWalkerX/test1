import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC4P1r33xXYm1Kkj_lyBuh1uFEuVN-l_DY",
  authDomain: "zero-fake-53803.firebaseapp.com",
  projectId: "zero-fake-53803",
  storageBucket: "zero-fake-53803.firebasestorage.app",
  messagingSenderId: "57462237987",
  appId: "1:57462237987:web:8a490742f8665d47cbba96",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Export Firestore functions that are used in multiple files
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export {
  db,
  auth,
  googleProvider,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDoc,
  addDoc,
  serverTimestamp,
};
