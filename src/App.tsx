import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth, googleProvider } from './firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { UserProfile } from './types';
import Dashboard from './components/Dashboard';
import WhiteboardCanvas from './components/WhiteboardCanvas';
import { Sparkles, ArrowRight } from 'lucide-react';

const COLLABORATOR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', 
  '#ec4899', '#f43f5e'
];

export default function App() {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState<string>('Whiteboard Canvas');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Quick link join variables
  const [linkBoardId, setLinkBoardId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [colorInput, setColorInput] = useState(COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)]);

  useEffect(() => {
    // Check if joining via shareable link parameter
    const params = new URLSearchParams(window.location.search);
    const urlBoardId = params.get('board');

    // Subscribe to Firebase Auth State Changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      let activeProfile: UserProfile | null = null;

      if (user) {
        // Logged in with Google
        const googleName = user.displayName || user.email?.split('@')[0] || 'Google User';
        const savedColor = localStorage.getItem('lucid_spark_user_color') || colorInput;
        const savedRole = (localStorage.getItem('lucid_spark_user_role') || 'student') as 'student' | 'teacher';

        localStorage.setItem('lucid_spark_user_id', user.uid);
        localStorage.setItem('lucid_spark_user_name', googleName);

        activeProfile = {
          id: user.uid,
          name: googleName,
          color: savedColor,
          role: savedRole,
          photoURL: user.photoURL || undefined
        };
        setProfile(activeProfile);

        if (urlBoardId) {
          joinBoardDirectly(urlBoardId, activeProfile);
        }
      } else {
        // Not logged in (guest / anonymous mode)
        const savedName = localStorage.getItem('lucid_spark_user_name');
        
        if (savedName) {
          const savedId = localStorage.getItem('lucid_spark_user_id') || 'u-' + Math.floor(Math.random() * 1000000);
          const savedColor = localStorage.getItem('lucid_spark_user_color') || colorInput;
          const savedRole = (localStorage.getItem('lucid_spark_user_role') || 'student') as 'student' | 'teacher';

          if (!localStorage.getItem('lucid_spark_user_id')) {
            localStorage.setItem('lucid_spark_user_id', savedId);
          }

          activeProfile = {
            id: savedId,
            name: savedName,
            color: savedColor,
            role: savedRole
          };
          setProfile(activeProfile);

          if (urlBoardId) {
            joinBoardDirectly(urlBoardId, activeProfile);
          }
        } else if (urlBoardId) {
          // Direct link join but guest needs to enter their nickname
          setLinkBoardId(urlBoardId);
        }
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignInGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      alert('Failed to sign in with Google: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('lucid_spark_user_name');
      localStorage.removeItem('lucid_spark_user_id');
      setProfile(null);
    } catch (err) {
      console.error('Sign-Out Error:', err);
    }
  };

  const joinBoardDirectly = async (targetId: string, userProfile: UserProfile) => {
    setBoardId(targetId);
    // Fetch board name from Firestore
    try {
      const boardDoc = await getDoc(doc(db, 'whiteboards', targetId));
      if (boardDoc.exists()) {
        setBoardName(boardDoc.data().name || 'Collaborative Whiteboard');
      }
    } catch (err) {
      console.error('Error fetching board name:', err);
    }
  };

  const handleSelectBoard = async (targetId: string, selectedProfile: UserProfile) => {
    setProfile(selectedProfile);
    setBoardId(targetId);
    
    // Fetch board info
    try {
      const boardDoc = await getDoc(doc(db, 'whiteboards', targetId));
      if (boardDoc.exists()) {
        setBoardName(boardDoc.data().name || 'Collaborative Whiteboard');
      }
    } catch (err) {
      console.error('Error fetching board:', err);
    }

    // Set URL parameter so browser refresh maintains state
    const newUrl = `${window.location.origin}/?board=${targetId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  };

  const handleBackToDashboard = () => {
    setBoardId(null);
    // Clear URL parameters
    const cleanUrl = window.location.origin;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
  };

  const handleLinkJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nicknameInput.trim() || !linkBoardId) return;

    const savedId = localStorage.getItem('lucid_spark_user_id') || 'u-' + Math.floor(Math.random() * 1000000);
    const savedRole = (localStorage.getItem('lucid_spark_user_role') || 'student') as 'student' | 'teacher';
    localStorage.setItem('lucid_spark_user_name', nicknameInput.trim());
    localStorage.setItem('lucid_spark_user_color', colorInput);
    localStorage.setItem('lucid_spark_user_role', savedRole); // preserve role or default to student

    const userProfile: UserProfile = {
      id: savedId,
      name: nicknameInput.trim(),
      color: colorInput,
      role: savedRole
    };

    setProfile(userProfile);
    joinBoardDirectly(linkBoardId, userProfile);
    setLinkBoardId(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 bg-blue-600 rounded flex items-center justify-center animate-bounce shadow-lg shadow-blue-600/20">
          <div className="w-6 h-6 bg-white rotate-45"></div>
        </div>
        <p className="mt-4 text-sm text-slate-600 font-semibold font-mono animate-pulse">
          Loading Whiteboard Canvas...
        </p>
      </div>
    );
  }

  // If joining via link directly but needs to set their profile details
  if (linkBoardId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-6 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600" />
          
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded flex items-center justify-center shadow-lg shadow-blue-600/10">
            <div className="w-6 h-6 bg-white rotate-45"></div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">You're Invited to Collaborate!</h1>
            <p className="text-xs text-slate-500 mt-1">Set your nickname and color to join this shared whiteboard room.</p>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col items-center justify-center space-y-3">
            <p className="text-[11px] text-slate-500 text-center">Want to bypass this setup and log in securely with your Google profile?</p>
            <button
              onClick={handleSignInGoogle}
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200 shadow-sm text-slate-700 hover:text-slate-900 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.6 15 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3C6.2 6.8 8.9 5.04 12 5.04z"/>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.9-3z"/>
                <path fill="#34A853" d="M12 24c3.2 0 6-1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-1.8-6.7-4.6l-3.9 3C3.3 21.3 7.3 24 12 24z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-bold uppercase tracking-wider">or join as guest</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <form onSubmit={handleLinkJoinSubmit} className="space-y-5 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                Your Guest Nickname
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Clara Oswald"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                Select Your Cursor Color
              </label>
              <div className="flex flex-wrap gap-2.5 mt-2">
                {COLLABORATOR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorInput(c)}
                    className={`w-8 h-8 rounded-full border transition-all transform hover:scale-110 flex items-center justify-center ${
                      colorInput === c ? 'ring-2 ring-blue-600 border-white scale-105' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {colorInput === c && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-md shadow-blue-600/10 hover:shadow-lg transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer"
            >
              <span>Join Whiteboard Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 flex flex-col">
      {boardId && profile ? (
        <WhiteboardCanvas
          boardId={boardId}
          boardName={boardName}
          currentUser={profile}
          onBackToDashboard={handleBackToDashboard}
        />
      ) : (
        <Dashboard
          onSelectBoard={handleSelectBoard}
          currentUserProfile={profile}
          onSignInGoogle={handleSignInGoogle}
          onSignOut={handleSignOut}
        />
      )}
    </div>
  );
}

