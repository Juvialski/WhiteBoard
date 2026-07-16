import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Whiteboard, UserProfile } from '../types';
import { Plus, Trash2, ArrowRight, User, BookOpen, GraduationCap, Users, Sparkles, Copy, Check } from 'lucide-react';

interface DashboardProps {
  onSelectBoard: (boardId: string, profile: UserProfile) => void;
  currentUserProfile: UserProfile | null;
  onSignInGoogle: () => void;
  onSignOut: () => void;
}

const COLLABORATOR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', 
  '#ec4899', '#f43f5e'
];

export default function Dashboard({ 
  onSelectBoard, 
  currentUserProfile, 
  onSignInGoogle, 
  onSignOut 
}: DashboardProps) {
  const [boards, setBoards] = useState<Whiteboard[]>([]);
  const [userName, setUserName] = useState('');
  const [userColor, setUserColor] = useState(COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)]);
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  
  // Board creation fields
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [assignedStudent, setAssignedStudent] = useState('');
  
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync state with Google User Profile when it changes
  useEffect(() => {
    if (currentUserProfile) {
      setUserName(currentUserProfile.name);
      if (currentUserProfile.color) setUserColor(currentUserProfile.color);
      if (currentUserProfile.role) setRole(currentUserProfile.role);
    } else {
      // Restore guest values if any
      const savedName = localStorage.getItem('lucid_spark_user_name') || '';
      const savedColor = localStorage.getItem('lucid_spark_user_color') || COLLABORATOR_COLORS[Math.floor(Math.random() * COLLABORATOR_COLORS.length)];
      const savedRole = (localStorage.getItem('lucid_spark_user_role') || 'student') as 'student' | 'teacher';
      setUserName(savedName);
      setUserColor(savedColor);
      setRole(savedRole);
    }
  }, [currentUserProfile]);

  // Load username from localStorage if exists initially
  useEffect(() => {
    if (!currentUserProfile) {
      const savedName = localStorage.getItem('lucid_spark_user_name');
      const savedColor = localStorage.getItem('lucid_spark_user_color');
      const savedRole = localStorage.getItem('lucid_spark_user_role');
      
      if (savedName) setUserName(savedName);
      if (savedColor) setUserColor(savedColor);
      if (savedRole === 'teacher' || savedRole === 'student') setRole(savedRole);
    }
  }, []);

  // Fetch whiteboards in real time
  useEffect(() => {
    const q = query(collection(db, 'whiteboards'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedBoards: Whiteboard[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        loadedBoards.push({
          id: docSnap.id,
          name: data.name || 'Untitled Board',
          description: data.description || '',
          createdAt: data.createdAt || Date.now(),
          createdBy: data.createdBy || 'Unknown',
          studentId: data.studentId || '',
          studentName: data.studentName || '',
        });
      });
      // Sort by newest
      loadedBoards.sort((a, b) => b.createdAt - a.createdAt);
      setBoards(loadedBoards);
    });

    return () => unsubscribe();
  }, []);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    const finalUserName = userName.trim() || 'Anonymous User';

    try {
      await addDoc(collection(db, 'whiteboards'), {
        name: newBoardName.trim(),
        description: newBoardDesc.trim(),
        createdAt: Date.now(),
        createdBy: finalUserName,
        studentId: assignedStudent ? assignedStudent.toLowerCase().replace(/\s+/g, '-') : '',
        studentName: assignedStudent.trim() || 'All Collaborative',
        studentsCanWrite: true,
      });

      setNewBoardName('');
      setNewBoardDesc('');
      setAssignedStudent('');
    } catch (err) {
      console.error('Error creating whiteboard:', err);
    }
  };

  const handleDeleteBoard = async (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering board selection
    if (!window.confirm('Are you sure you want to delete this whiteboard?')) return;
    try {
      await deleteDoc(doc(db, 'whiteboards', boardId));
    } catch (err) {
      console.error('Error deleting board:', err);
    }
  };

  const handleJoinBoard = (board: Whiteboard) => {
    const finalName = userName.trim() || (role === 'teacher' ? 'Teacher' : 'Student-' + Math.floor(Math.random() * 1000));
    
    // Save to localStorage
    localStorage.setItem('lucid_spark_user_name', finalName);
    localStorage.setItem('lucid_spark_user_color', userColor);
    localStorage.setItem('lucid_spark_user_role', role);

    const profile: UserProfile = {
      id: currentUserProfile?.id || localStorage.getItem('lucid_spark_user_id') || 'u-' + Math.floor(Math.random() * 1000000),
      name: finalName,
      color: userColor,
      role: role,
      photoURL: currentUserProfile?.photoURL
    };
    if (!localStorage.getItem('lucid_spark_user_id')) {
      localStorage.setItem('lucid_spark_user_id', profile.id);
    }

    onSelectBoard(board.id, profile);
  };

  const copyLink = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = `${window.location.origin}/?board=${boardId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(boardId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentName = currentUserProfile?.name || userName;
  const normalizedName = currentName.toLowerCase().replace(/\s+/g, '-');
  
  const visibleBoards = boards.filter(board => {
    // If not logged in or no name, don't show any boards
    if (!currentName) return false;
    // Visible if created by current user
    if (board.createdBy === currentName) return true;
    // Visible if assigned to current user
    if (board.studentId && board.studentId === normalizedName) return true;
    // If it's a shared board (no student assigned), only the creator can see it in their dashboard
    // Others must use the direct link to join
    return false;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans" id="lucid-dashboard">
      {/* Navigation Header */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-sm">
            <div className="w-4 h-4 bg-white rotate-45"></div>
          </div>
          <div className="h-4 w-[1px] bg-slate-200"></div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold leading-tight text-slate-900">Whiteboard Workspace</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Synced to Firebase: Active Session</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center space-x-1.5 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button 
              onClick={() => setRole('student')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                role === 'student' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Student Mode</span>
            </button>
            <button 
              onClick={() => setRole('teacher')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center space-x-1 transition-all ${
                role === 'teacher' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Teacher Mode</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto p-6 md:p-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* User Settings Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center space-x-2">
              <User className="w-4.5 h-4.5 text-blue-600" />
              <span>Collaborator Profile</span>
            </h2>
            
            <div className="space-y-4">
              {/* Google Auth Status / Actions */}
              {currentUserProfile ? (
                <div className="bg-emerald-50/45 border border-emerald-100 rounded-xl p-3.5 flex items-center justify-between shadow-sm">
                  <div className="flex items-center space-x-2.5">
                    {currentUserProfile.photoURL ? (
                      <img 
                        src={currentUserProfile.photoURL} 
                        alt={currentUserProfile.name} 
                        className="w-8 h-8 rounded-full border border-emerald-200 shadow-xs"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                        {currentUserProfile.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-slate-800 line-clamp-1 leading-snug">{currentUserProfile.name}</span>
                      <span className="text-[9px] text-emerald-600 font-bold flex items-center uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 inline-block animate-pulse"></span>
                        Google Connected
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={onSignOut}
                    className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline font-bold cursor-pointer shrink-0 ml-2"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 rounded-xl p-4 flex flex-col items-center justify-center space-y-2.5 text-center shadow-xs">
                  <span className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Log in securely with Google to verify your identity and unlock instant profile sync.
                  </span>
                  <button
                    onClick={onSignInGoogle}
                    className="w-full flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200/80 shadow-xs text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-150 transform active:scale-98"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5.04c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.6 15 0 12 0 7.3 0 3.3 2.7 1.4 6.6l3.9 3C6.2 6.8 8.9 5.04 12 5.04z"/>
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"/>
                      <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4l-3.9-3C.5 8.2 0 10 0 12s.5 3.8 1.4 5.4l3.9-3z"/>
                      <path fill="#34A853" d="M12 24c3.2 0 6-1 8-2.9l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-1.8-6.7-4.6l-3.9 3C3.3 21.3 7.3 24 12 24z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </button>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  {currentUserProfile ? "Your Profile Nickname" : "Your Guest Nickname"}
                </label>
                <input
                  type="text"
                  placeholder={role === 'teacher' ? 'e.g. Mrs. Smith' : 'e.g. Leo Parker'}
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value);
                    if (!currentUserProfile) {
                      localStorage.setItem('lucid_spark_user_name', e.target.value);
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Your Cursor Color
                </label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {COLLABORATOR_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setUserColor(c);
                        localStorage.setItem('lucid_spark_user_color', c);
                      }}
                      className={`w-7 h-7 rounded-full border transition-all transform hover:scale-110 flex items-center justify-center ${
                        userColor === c ? 'ring-2 ring-blue-600 border-white scale-105' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                      title="Select Color"
                    >
                      {userColor === c && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex items-start space-x-3 mt-4">
                <div className="bg-blue-600 text-white rounded p-1.5 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-blue-800">Ready to Collaborate</h3>
                  <p className="text-[11px] text-blue-600 mt-0.5 leading-relaxed">
                    This profile determines how your cursor, comments, and board edits appear to other students in real time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Teacher Board Creation Tool (Available to anyone, but tailored for layout separation) */}
          {role === 'teacher' && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-2xl -mr-6 -mt-6"></div>
              
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center space-x-2">
                <Plus className="w-4.5 h-4.5 text-blue-600" />
                <span>Create Student Whiteboard</span>
              </h2>

              <form onSubmit={handleCreateBoard} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    Whiteboard Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science Experiment Board"
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    Description / Instructions
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brainstorm your lab ideas here..."
                    value={newBoardDesc}
                    onChange={(e) => setNewBoardDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">
                    Assign to Student (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Clara Oswald (blank for Shared Board)"
                    value={assignedStudent}
                    onChange={(e) => setAssignedStudent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Deploy New Whiteboard</span>
                </button>
              </form>
            </div>
          )}

          {role === 'student' && (
            <div className="bg-slate-100/50 p-5 rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Need a Private Board?</span>
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                If you are a student, you can search for a board assigned to you below, or ask your teacher to launch a separate whiteboard with your name!
              </p>
              <button 
                onClick={() => setRole('teacher')} 
                className="text-xs font-bold text-blue-600 hover:text-blue-700 underline flex items-center space-x-1 cursor-pointer"
              >
                <span>Switch to Teacher Mode to create a board</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Board Listings */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>Active Whiteboard Rooms</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Select a digital whiteboard to join real-time collaboration.</p>
            </div>
            
            {/* Quick Create option for Students */}
            {role === 'student' && (
              <button
                onClick={() => {
                  const name = prompt("Enter a name for your new whiteboard:", "My Practice Whiteboard");
                  if (name) {
                    addDoc(collection(db, 'whiteboards'), {
                      name: name,
                      description: 'Student created workspace',
                      createdAt: Date.now(),
                      createdBy: userName || 'Student',
                      studentId: userName ? userName.toLowerCase().replace(/\s+/g, '-') : '',
                      studentName: userName || 'Student Practice',
                    });
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg font-bold text-xs shadow-sm transition-all flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Board</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleBoards.length === 0 ? (
              <div className="col-span-full bg-white border border-dashed border-slate-200 rounded-xl py-16 text-center space-y-3">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">No Whiteboards Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    {currentName 
                      ? "Create a whiteboard in teacher mode, or tap the button in the corner to spin up a collaborative canvas!"
                      : "Please set your nickname or log in with Google to view your whiteboards."}
                  </p>
                </div>
              </div>
            ) : (
              visibleBoards.map((board) => {
                const isAssigned = !!board.studentId;
                return (
                  <div
                    key={board.id}
                    onClick={() => handleJoinBoard(board)}
                    className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-500/50 hover:shadow-xs transition-all duration-200 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          isAssigned 
                            ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                            : 'bg-green-50 text-green-700 border border-green-100'
                        }`}>
                          {isAssigned ? `Student: ${board.studentName}` : 'Collaborative Shared'}
                        </span>
                        
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => copyLink(board.id, e)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors"
                            title="Copy link"
                          >
                            {copiedId === board.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          
                          <button
                            onClick={(e) => handleDeleteBoard(board.id, e)}
                            className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete Board"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors text-sm line-clamp-1">
                        {board.name}
                      </h3>
                      
                      <p className="text-xs text-slate-500 line-clamp-2 h-8 leading-normal">
                        {board.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span>By: <strong className="text-slate-600 font-medium">{board.createdBy}</strong></span>
                      <span className="flex items-center text-blue-600 font-semibold group-hover:translate-x-1 transition-transform">
                        <span>Enter Board</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
