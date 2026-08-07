import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentMultipleTabManager,
} from "firebase/firestore";

// Prefer Vite env vars (see project root .env.example); fall back to demo
// placeholder values so the dashboard boots in dev without setup.
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
  // Enable persistent cache (default-on for web SDK v12) — but tolerate
  // environments where IndexedDB is unavailable (private mode).
  db = initializeFirestore(firebaseApp, {
    localCache: persistentMultipleTabManager(),
  });
} catch {
  db = getFirestore(firebaseApp);
}

export const auth = getAuth(firebaseApp);
export { db };

// ─── Emulator wiring for local dev ─────────────────────────────────
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "1") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectAuthEmulator(auth, "http://localhost:9090", { disableWarnings: true });
}

// Where the orchestrator lives (Cloud Run in prod).
export const ORCHESTRATOR_URL =
  import.meta.env.VITE_ORCHESTRATOR_URL || "http://localhost:8080";
