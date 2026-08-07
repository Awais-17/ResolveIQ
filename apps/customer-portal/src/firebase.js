import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "DEMO_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "resolveiq-demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000000000",
};

export const firebaseApp = initializeApp(firebaseConfig);

let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentMultipleTabManager(),
  });
} catch {
  db = getFirestore(firebaseApp);
}

export { db };

export const ORCHESTRATOR_URL = import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:8080";
