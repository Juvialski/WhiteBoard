import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
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
    // 1. Check if joining via shareable link parameter
    const params = new URLSearchParams(window.location.search);
    const urlBoardId = params.get('board');

    // 2. Check if user profile already exists in localStorage
    const savedId = localStorage.getItem('lucid_spark_user_id') || 'u-' + Math.floor(Math.random() * 1000000);
    const savedName = localStorage.getItem('lucid_spark_user_name');
    const savedColor = localStorage.getItem('lucid_spark_user_color') || colorInput;

    if (!localStorage.getItem('lucid_spark_user_id')) {
      localStorage.setItem('lucid_spark_user_id', savedId);
    }

    if (savedName) {
      const activeProfile: UserProfile = {
        id: savedId,
        name: savedName,
        color: savedColor
      };
      setProfile(activeProfile);

      // If they also have a board ID in URL, join it immediately
      if (urlBoardId) {
        joinBoardDirectly(urlBoardId, activeProfile);
      }
    } else if (urlBoardId) {
      // Direct link join but needs nickname
      setLinkBoardId(urlBoardId);
    }

    setIsLoading(false);
  }, []);

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
    localStorage.setItem('lucid_spark_user_name', nicknameInput.trim());
    localStorage.setItem('lucid_spark_user_color', colorInput);

    const userProfile: UserProfile = {
      id: savedId,
      name: nicknameInput.trim(),
      color: colorInput
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

          <form onSubmit={handleLinkJoinSubmit} className="space-y-5 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                Your Collaborator Name
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
        <Dashboard onSelectBoard={handleSelectBoard} />
      )}
    </div>
  );
}
