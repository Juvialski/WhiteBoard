import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

// Initialize Firestore with specific database ID as 2nd parameter
const db = getFirestore(app, "ai-studio-lucidsparkwhiteb-b0a1d487-a913-4112-b5dd-7cf4c33b5adf");

export { app, db };
