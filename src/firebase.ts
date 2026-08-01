import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getStorage } from "firebase/storage";

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

// Initialize Firestore with multi-tab persistence support to prevent locking errors
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, "ai-studio-lucidsparkwhiteb-b0a1d487-a913-4112-b5dd-7cf4c33b5adf");

// Initialize Firebase Auth
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Initialize Storage
const storage = getStorage(app);

// Auto sign-in anonymously for guest users to satisfy security rules (request.auth != null)
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch((err) => {
      console.warn("Anonymous auth failed (sandbox/offline mode active):", err);
    });
  }
});

export { app, db, auth, googleProvider, storage };


