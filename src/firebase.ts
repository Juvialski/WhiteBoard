import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, memoryLocalCache } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence } from "firebase/auth";
import { isSandboxEnvironment } from "./utils/firebaseSandboxGuard";

const firebaseConfig = {
  projectId: "whiteboard-ee02a",
  appId: "1:406924510345:web:c7d7414b10faa9e108f258",
  apiKey: "AIzaSyDQxUZfvqw0AA9f4ACaCdN_d_lC3GhHCJM",
  authDomain: "whiteboard-ee02a.firebaseapp.com",
  storageBucket: "whiteboard-ee02a.firebasestorage.app",
  messagingSenderId: "406924510345"
};

// Initialize Firebase app
const app = initializeApp(firebaseConfig);

// Initialize Firestore using persistentLocalCache with memoryLocalCache fallback
// to prevent QuotaExceededError and localStorage sequence number quota crashes
let db: any;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache()
  }, "ai-studio-lucidsparkwhiteb-b0a1d487-a913-4112-b5dd-7cf4c33b5adf");
} catch (e) {
  console.warn("Persistent cache initialization failed, falling back to memoryLocalCache:", e);
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache()
  }, "ai-studio-lucidsparkwhiteb-b0a1d487-a913-4112-b5dd-7cf4c33b5adf");
}

// Initialize Firebase Auth
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Explicitly preserve the Firebase Auth UID across reloads. Without this, a board
// created by an anonymous user can become invisible to its owner after refresh.
const authPersistenceReady = isSandboxEnvironment()
  ? Promise.resolve()
  : setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn("Unable to enable local Firebase Auth persistence:", err);
    });

// Auto sign-in anonymously for guest users to satisfy security rules (request.auth != null) when not in sandbox
authPersistenceReady.then(() => onAuthStateChanged(auth, (user) => {
  if (!user && !isSandboxEnvironment()) {
    signInAnonymously(auth).catch((err) => {
      // Silently handle auth/admin-restricted-operation when anonymous auth is disabled in Firebase Console
      if (err?.code !== "auth/admin-restricted-operation") {
        console.debug("Anonymous auth notice:", err);
      }
    });
  }
}));

export { app, db, auth, googleProvider, authPersistenceReady };


