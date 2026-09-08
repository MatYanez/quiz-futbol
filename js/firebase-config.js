import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHWIFEtyCPsabSxmeOirno6xaAf7XQ8YA",
  authDomain: "soccer-8acce.firebaseapp.com",
  databaseURL: "https://soccer-8acce-default-rtdb.firebaseio.com",
  projectId: "soccer-8acce",
  storageBucket: "soccer-8acce.firebasestorage.app",
  messagingSenderId: "417657504224",
  appId: "1:417657504224:web:728014d45f44c57f71eb85"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, update, onValue };