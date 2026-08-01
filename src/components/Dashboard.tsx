import React, { useState, useEffect, useRef } from 'react';
import { collection, query, getDocs, onSnapshot, addDoc, deleteDoc, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Whiteboard, UserProfile } from '../types';
import { Plus, Trash2, ArrowRight, User, BookOpen, GraduationCap, Users, Sparkles, Copy, Check, FileUp, Loader2, ChevronDown, ChevronUp, Calendar, BarChart2, List, RefreshCw, ShieldCheck } from 'lucide-react';
import { isSandboxEnvironment, getSandboxLocalBoards, saveSandboxLocalBoards, saveSandboxLocalElements } from '../utils/firebaseSandboxGuard';

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
  const [boardToDelete, setBoardToDelete] = useState<string | null>(null);
  
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  const [pdfUploadState, setPdfUploadState] = useState<{
    file: File;
    images: { src: string, width: number, height: number }[];
    selectedPages: boolean[];
    layout: 'vertical' | 'horizontal';
  } | null>(null);

  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  // Admin Panel states
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminAppEnabled, setAdminAppEnabled] = useState(true);
  const [presenceList, setPresenceList] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Historical stats states
  const [selectedHistoryBoardId, setSelectedHistoryBoardId] = useState<string>('all');
  const [historyDaysLimit, setHistoryDaysLimit] = useState<number>(7);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [historyTab, setHistoryTab] = useState<'chart' | 'table'>('chart');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load presence and settings for admin
  useEffect(() => {
    if (isSandboxEnvironment()) return;
    const isAdmin = currentUserProfile?.email === 'al.matubis17@gmail.com';
    if (!isAdmin) return;

    // Listen to admin settings
    const settingsRef = doc(db, 'admin_settings', 'global');
    const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (typeof data.appEnabled === 'boolean') {
          setAdminAppEnabled(data.appEnabled);
        }
      }
    }, (err) => {
      console.error('Settings snapshot error:', err);
    });

    // Fetch users presence
    const fetchPresence = async () => {
      try {
        const presenceRef = collection(db, 'presence');
        const snapshot = await import('firebase/firestore').then(m => m.getDocs(query(presenceRef)));
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            uid: docSnap.id,
            ...docSnap.data()
          });
        });
        // Sort: online first, then by lastActive descending
        list.sort((a, b) => {
          if (a.isOnline && !b.isOnline) return -1;
          if (!a.isOnline && b.isOnline) return 1;
          return (b.lastActive || 0) - (a.lastActive || 0);
        });
        setPresenceList(list);
      } catch (err) {
        console.error('Presence fetch error:', err);
      }
    };
    
    fetchPresence();

    return () => {
      unsubscribeSettings();
    };
  }, [currentUserProfile, refreshTrigger]);

  const handleToggleAppEnabled = async () => {
    try {
      const settingsRef = doc(db, 'admin_settings', 'global');
      await setDoc(settingsRef, {
        appEnabled: !adminAppEnabled,
        updatedAt: Date.now(),
        updatedBy: currentUserProfile?.email || 'Admin'
      }, { merge: true });
    } catch (err) {
      console.error('Error toggling app access:', err);
      alert('Failed to update app access: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRemovePresence = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'presence', uid));
    } catch (err) {
      console.error('Error removing presence document:', err);
      alert('Failed to remove presence: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const formatLastActive = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 30000) return 'Just now';
    if (diff < 60000) return '30s ago';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    try {
      const { pdfToImages } = await import('../utils/pdf');
      const images = await pdfToImages(file);
      setPdfUploadState({
        file,
        images,
        selectedPages: new Array(images.length).fill(true),
        layout: 'vertical'
      });
    } catch (err) {
      console.error('Error uploading PDF:', err);
      alert('Failed to process PDF.');
    } finally {
      setIsUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const submitPdfBoard = async () => {
    if (!pdfUploadState) return;
    setIsUploadingPdf(true);
    try {
      const finalUserName = userName.trim() || 'Anonymous User';
      let docId = `pdf-${Date.now()}`;
      
      if (!isSandboxEnvironment()) {
        const docRef = await addDoc(collection(db, 'whiteboards'), {
          name: `PDF: ${pdfUploadState.file.name.replace('.pdf', '')}`,
          description: 'PDF Workspace',
          createdAt: Date.now(),
          createdBy: finalUserName,
          studentId: assignedStudent ? assignedStudent.toLowerCase().replace(/\s+/g, '-') : '',
          studentName: assignedStudent.trim() || 'All Collaborative',
          studentsCanWrite: true,
          schemaVersion: 2,
          currentRevision: 1,
          chunkIds: ['chunk_0'],
          totalElements: 0,
          migrationStatus: 'complete',
          dailyWrites: {},
          dailyReads: {},
          teacherDailyWrites: {},
        });
        docId = docRef.id;
      }

      let currentX = 0;
      let currentY = 0;
      const gap = 40;
      const pdfBlobMap: Record<string, any> = {};
      
      for (let i = 0; i < pdfUploadState.images.length; i++) {
        if (!pdfUploadState.selectedPages[i]) continue;
        const img = pdfUploadState.images[i];
        const elementId = `pdf-page-${i}-${Date.now()}`;
        
        pdfBlobMap[elementId] = {
          type: "image",
          x: currentX,
          y: currentY,
          width: img.width,
          height: img.height,
          src: img.src,
          zIndex: -1, // background
          locked: true,
          updatedAt: Date.now()
        };
        
        if (pdfUploadState.layout === 'vertical') {
          currentY += img.height + gap;
        } else {
          currentX += img.width + gap;
        }
      }

      const totalPdfElements = Object.keys(pdfBlobMap).length;
      
      if (isSandboxEnvironment()) {
        const currentBoards = getSandboxLocalBoards();
        const newBoard = {
          id: docId,
          name: `PDF: ${pdfUploadState.file.name.replace('.pdf', '')}`,
          description: 'PDF Workspace',
          createdAt: Date.now(),
          createdBy: finalUserName,
          studentId: assignedStudent ? assignedStudent.toLowerCase().replace(/\s+/g, '-') : '',
          studentName: assignedStudent.trim() || 'All Collaborative',
          studentsCanWrite: true,
          schemaVersion: 2,
          currentRevision: 1,
          chunkIds: ['chunk_0'],
          totalElements: totalPdfElements,
          migrationStatus: 'complete',
        };
        saveSandboxLocalBoards([newBoard, ...currentBoards]);
        saveSandboxLocalElements(docId, Object.values(pdfBlobMap));
      } else {
        await setDoc(doc(db, 'whiteboards', docId, 'stateChunks', 'chunk_0'), {
          chunkId: 'chunk_0',
          elements: pdfBlobMap,
          elementCount: totalPdfElements,
          updatedAt: Date.now(),
        });
        await setDoc(doc(db, 'whiteboards', docId), {
          totalElements: totalPdfElements,
        }, { merge: true });
      }

      const finalName = userName.trim() || (role === 'teacher' ? 'Teacher' : 'Student-' + Math.floor(Math.random() * 1000));
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
      
      onSelectBoard(docId, profile);
      setPdfUploadState(null);
    } catch (err) {
      console.error('Error creating PDF board:', err);
      alert('Failed to process PDF.');
    } finally {
      setIsUploadingPdf(false);
    }
  };

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

  // Fetch whiteboards with getDocs (quota-optimized to prevent multi-user read cascades)
  const fetchBoards = React.useCallback(async () => {
    if (isSandboxEnvironment()) {
      const loadedBoards = getSandboxLocalBoards();
      setBoards(loadedBoards);
      return;
    }
    try {
      const q = query(collection(db, 'whiteboards'));
      const snapshot = await getDocs(q);
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
          teacherDailyWrites: data.teacherDailyWrites || {},
          dailyWrites: data.dailyWrites || {},
          dailyReads: data.dailyReads || {},
        });
      });
      // Sort by newest
      loadedBoards.sort((a, b) => b.createdAt - a.createdAt);
      setBoards(loadedBoards);
    } catch (err) {
      console.error("Error fetching whiteboards:", err);
    }
  }, []);

  useEffect(() => {
    fetchBoards();

    // Listen to local board updates in sandbox mode
    const handleLocalUpdate = () => {
      if (isSandboxEnvironment()) {
        fetchBoards();
      }
    };
    window.addEventListener('lucid_spark_boards_updated', handleLocalUpdate);

    // Periodic poll every 2 minutes (120s) when window is active to save reads
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isSandboxEnvironment()) {
        fetchBoards();
      }
    }, 120000);

    return () => {
      window.removeEventListener('lucid_spark_boards_updated', handleLocalUpdate);
      clearInterval(interval);
    };
  }, [fetchBoards, refreshTrigger]);

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    const finalUserName = userName.trim() || 'Anonymous User';

    if (isSandboxEnvironment()) {
      const current = getSandboxLocalBoards();
      const newBoard = {
        id: 'sandbox-board-' + Date.now(),
        name: newBoardName.trim(),
        description: newBoardDesc.trim(),
        createdAt: Date.now(),
        createdBy: finalUserName,
        studentId: assignedStudent ? assignedStudent.toLowerCase().replace(/\s+/g, '-') : '',
        studentName: assignedStudent.trim() || 'All Collaborative',
        studentsCanWrite: true,
        dailyWrites: {},
        dailyReads: {},
        teacherDailyWrites: {},
      };
      saveSandboxLocalBoards([newBoard, ...current]);
      setNewBoardName('');
      setNewBoardDesc('');
      setAssignedStudent('');
      fetchBoards();
      return;
    }

    try {
      await addDoc(collection(db, 'whiteboards'), {
        name: newBoardName.trim(),
        description: newBoardDesc.trim(),
        createdAt: Date.now(),
        createdBy: finalUserName,
        studentId: assignedStudent ? assignedStudent.toLowerCase().replace(/\s+/g, '-') : '',
        studentName: assignedStudent.trim() || 'All Collaborative',
        studentsCanWrite: true,
        schemaVersion: 2,
        currentRevision: 0,
        chunkIds: [],
        totalElements: 0,
        migrationStatus: 'complete',
        dailyWrites: {},
        dailyReads: {},
        teacherDailyWrites: {},
      });

      setNewBoardName('');
      setNewBoardDesc('');
      setAssignedStudent('');
      await fetchBoards();
    } catch (err) {
      console.error('Error creating whiteboard:', err);
    }
  };

  const handleDeleteBoard = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering board selection
    setBoardToDelete(boardId);
  };

  const confirmDeleteBoard = async () => {
    if (!boardToDelete) return;
    if (isSandboxEnvironment()) {
      const current = getSandboxLocalBoards();
      saveSandboxLocalBoards(current.filter(b => b.id !== boardToDelete));
      setBoardToDelete(null);
      fetchBoards();
      return;
    }
    try {
      await deleteDoc(doc(db, 'whiteboards', boardToDelete));
      setBoardToDelete(null);
      await fetchBoards();
    } catch (err) {
      console.error('Error deleting board:', err);
      alert('Failed to delete board.');
      setBoardToDelete(null);
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

  const getTodayDateStr = () => {
    return new Date().toISOString().split('T')[0];
  };

  const todayStr = getTodayDateStr();
  const localDateStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  let totalWritesToday = 0;
  let totalReadsToday = 0;
  let totalTeacherWritesToday = 0;
  let totalWritesAllTime = 0;
  let totalReadsAllTime = 0;

  boards.forEach((b) => {
    const writesToday = (b.dailyWrites?.[todayStr] || 0) + (todayStr !== localDateStr ? (b.dailyWrites?.[localDateStr] || 0) : 0);
    const readsToday = (b.dailyReads?.[todayStr] || 0) + (todayStr !== localDateStr ? (b.dailyReads?.[localDateStr] || 0) : 0);
    const teacherWritesToday = (b.teacherDailyWrites?.[todayStr] || 0) + (todayStr !== localDateStr ? (b.teacherDailyWrites?.[localDateStr] || 0) : 0);

    totalWritesToday += writesToday;
    totalReadsToday += readsToday;
    totalTeacherWritesToday += teacherWritesToday;

    if (b.dailyWrites) {
      Object.values(b.dailyWrites).forEach((v) => { totalWritesAllTime += (v || 0); });
    }
    if (b.dailyReads) {
      Object.values(b.dailyReads).forEach((v) => { totalReadsAllTime += (v || 0); });
    }
  });

  // Generate a list of dates for the last N days
  const getPastDaysList = (numDays: number) => {
    const list: string[] = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      list.push(`${year}-${month}-${day}`);
    }
    return list; // Newest first
  };

  const historyDates = getPastDaysList(historyDaysLimit);

  // Compute stats for each date
  const historicalStats = historyDates.map(dateStr => {
    let reads = 0;
    let writes = 0;
    let teacherWrites = 0;

    // Filter boards based on selection
    const targetBoards = selectedHistoryBoardId === 'all' 
      ? boards 
      : boards.filter(b => b.id === selectedHistoryBoardId);

    const boardBreakdown = targetBoards.map(b => {
      const bReads = b.dailyReads?.[dateStr] || 0;
      const bWrites = b.dailyWrites?.[dateStr] || 0;
      const bTeacherWrites = b.teacherDailyWrites?.[dateStr] || 0;
      return {
        id: b.id,
        name: b.name,
        reads: bReads,
        writes: bWrites,
        teacherWrites: bTeacherWrites,
        studentWrites: Math.max(0, bWrites - bTeacherWrites)
      };
    }).filter(item => item.reads > 0 || item.writes > 0);

    targetBoards.forEach(b => {
      reads += b.dailyReads?.[dateStr] || 0;
      writes += b.dailyWrites?.[dateStr] || 0;
      teacherWrites += b.teacherDailyWrites?.[dateStr] || 0;
    });

    return {
      date: dateStr,
      reads,
      writes,
      teacherWrites,
      studentWrites: Math.max(0, writes - teacherWrites),
      boardBreakdown
    };
  });

  return (
    <div className="h-full bg-slate-50 text-slate-800 flex flex-col font-sans overflow-y-auto" id="lucid-dashboard">
      {/* Navigation Header */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-sm">
            <div className="w-4 h-4 bg-white rotate-45"></div>
          </div>
          <div className="h-4 w-[1px] bg-slate-200"></div>
          <div className="flex flex-col">
            <h1 className="text-sm font-semibold leading-tight text-slate-900">Whiteboard Workspace</h1>
            <p className="text-[10px] text-amber-600 uppercase tracking-wider font-bold flex items-center space-x-1">
              {isSandboxEnvironment() ? (
                <>
                  <ShieldCheck className="w-3 h-3 inline text-amber-600" />
                  <span>Sandbox Mode: 0 Firebase Operations</span>
                </>
              ) : (
                <span>Synced to Firebase: Active Session</span>
              )}
            </p>
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

          {/* Admin Control Entry */}
          {currentUserProfile?.email === 'al.matubis17@gmail.com' && (
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl border border-slate-700 shadow-md relative overflow-hidden text-white mt-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl -mr-6 -mt-6"></div>
              
              <div className="flex items-center space-x-2.5 mb-2">
                <div className="p-1.5 bg-red-500 rounded text-white shadow-sm animate-pulse">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6v2m0-5a7 7 0 110 14 7 7 0 010-14z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold tracking-wide">Admin Control Deck</h2>
              </div>
              <p className="text-[11px] text-slate-300 mb-4 leading-relaxed">
                As the master administrator, you have permission to monitor active users, view board usage stats, and control global system access.
              </p>

              <div className="flex items-center justify-between mb-4 bg-slate-800/60 p-2.5 rounded-lg border border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Status:</span>
                <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                  adminAppEnabled 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}>
                  {adminAppEnabled ? '● Fully Operational' : '● System Locked'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(true)}
                className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-2.5 rounded-lg transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer shadow-md shadow-red-900/20"
              >
                <span>Launch Admin Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* PDF Upload Mode Tool */}
          {role === 'teacher' && (
            <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-600/5 rounded-full blur-2xl -mr-6 -mt-6"></div>
              
              <h2 className="text-sm font-bold text-slate-900 mb-2 flex items-center space-x-2">
                <FileUp className="w-4.5 h-4.5 text-indigo-600" />
                <span>PDF Whiteboard Mode</span>
              </h2>
              <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                Upload a PDF to automatically generate a whiteboard with all pages embedded. Perfect for annotating worksheets.
              </p>

              <input 
                type="file"
                accept="application/pdf"
                className="hidden"
                ref={pdfInputRef}
                onChange={handlePdfUpload}
              />

              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={isUploadingPdf}
                className="w-full bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 font-semibold py-2.5 rounded-lg shadow-sm transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-70 disabled:cursor-wait"
              >
                {isUploadingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing PDF...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Upload & Create PDF Board</span>
                  </>
                )}
              </button>
            </div>
          )}

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
            <div className="flex items-center space-x-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span>Active Whiteboard Rooms</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Select a digital whiteboard to join real-time collaboration.</p>
              </div>
              <button
                onClick={() => setRefreshTrigger(prev => prev + 1)}
                className="px-2 py-1 text-xs font-medium bg-white border border-slate-200 text-slate-600 rounded hover:bg-slate-50 hover:text-slate-900 flex items-center space-x-1 shadow-sm transition-all"
                title="Refresh Boards"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
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
                      studentsCanWrite: true,
                      schemaVersion: 2,
                      currentRevision: 0,
                      chunkIds: [],
                      totalElements: 0,
                      migrationStatus: 'complete',
                      dailyWrites: {},
                      dailyReads: {},
                      teacherDailyWrites: {},
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
                        
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 opacity-100 transition-opacity">
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
    
      {pdfUploadState && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Configure PDF Board</h2>
                <p className="text-sm text-slate-500 mt-1">Select pages and choose how they will be laid out.</p>
              </div>
              <button 
                onClick={() => setPdfUploadState(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 flex">
              {/* Sidebar Settings */}
              <div className="w-64 shrink-0 pr-6 border-r border-slate-200 space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">Layout Options</label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-white" 
                      style={{
                        borderColor: pdfUploadState.layout === 'vertical' ? '#3b82f6' : '#e2e8f0',
                        backgroundColor: pdfUploadState.layout === 'vertical' ? '#eff6ff' : 'transparent'
                      }}>
                      <input 
                        type="radio" 
                        name="layout" 
                        value="vertical"
                        checked={pdfUploadState.layout === 'vertical'}
                        onChange={() => setPdfUploadState({ ...pdfUploadState, layout: 'vertical' })}
                        className="text-blue-600 focus:ring-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Vertical (Default)</span>
                    </label>
                    <label className="flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-colors hover:bg-white"
                       style={{
                        borderColor: pdfUploadState.layout === 'horizontal' ? '#3b82f6' : '#e2e8f0',
                        backgroundColor: pdfUploadState.layout === 'horizontal' ? '#eff6ff' : 'transparent'
                      }}>
                      <input 
                        type="radio" 
                        name="layout" 
                        value="horizontal"
                        checked={pdfUploadState.layout === 'horizontal'}
                        onChange={() => setPdfUploadState({ ...pdfUploadState, layout: 'horizontal' })}
                        className="text-blue-600 focus:ring-blue-600"
                      />
                      <span className="text-sm font-medium text-slate-700">Horizontal (Kami Style)</span>
                    </label>
                  </div>
                </div>

                <div>
                   <label className="block text-xs font-bold text-slate-500 uppercase mb-3 tracking-wider">Page Selection</label>
                   <div className="flex items-center gap-2">
                     <button 
                       onClick={() => setPdfUploadState({...pdfUploadState, selectedPages: new Array(pdfUploadState.images.length).fill(true)})}
                       className="flex-1 text-xs py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium transition-colors"
                     >
                       Select All
                     </button>
                     <button 
                       onClick={() => setPdfUploadState({...pdfUploadState, selectedPages: new Array(pdfUploadState.images.length).fill(false)})}
                       className="flex-1 text-xs py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium transition-colors"
                     >
                       Deselect All
                     </button>
                   </div>
                   <p className="text-[11px] text-slate-500 mt-2">
                     {pdfUploadState.selectedPages.filter(Boolean).length} of {pdfUploadState.images.length} selected
                   </p>
                </div>
              </div>

              {/* Main Content: Thumbnails */}
              <div className="flex-1 pl-6">
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                   {pdfUploadState.images.map((img, i) => (
                     <div 
                       key={i} 
                       className={`relative aspect-[3/4] bg-white border-2 rounded-lg overflow-hidden cursor-pointer group transition-all ${pdfUploadState.selectedPages[i] ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'border-slate-200 opacity-60 hover:opacity-100'}`}
                       onClick={() => {
                         const newSelected = [...pdfUploadState.selectedPages];
                         newSelected[i] = !newSelected[i];
                         setPdfUploadState({...pdfUploadState, selectedPages: newSelected});
                       }}
                     >
                       <img src={img.src} alt={`Page ${i+1}`} className="w-full h-full object-cover" />
                       <div className="absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center bg-white shadow-sm transition-colors"
                            style={{
                              borderColor: pdfUploadState.selectedPages[i] ? '#3b82f6' : '#cbd5e1',
                              backgroundColor: pdfUploadState.selectedPages[i] ? '#3b82f6' : 'white'
                            }}>
                          {pdfUploadState.selectedPages[i] && <Check className="w-3.5 h-3.5 text-white" />}
                       </div>
                       <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded">
                         Page {i + 1}
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end items-center gap-3">
              <button 
                onClick={() => setPdfUploadState(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={submitPdfBoard}
                disabled={isUploadingPdf || pdfUploadState.selectedPages.filter(Boolean).length === 0}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploadingPdf ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating Board...</>
                ) : (
                  <>Create Board <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {boardToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-slate-900">Delete Whiteboard?</h3>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                This will permanently remove the board and all its content. This action cannot be undone.
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={confirmDeleteBoard}
                className="w-full bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold py-3 rounded-xl transition-all shadow-sm shadow-rose-200 cursor-pointer"
              >
                Delete Permanently
              </button>
              <button 
                onClick={() => setBoardToDelete(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200" id="admin-panel-overlay">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl md:max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-200">
                  <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6v2m0-5a7 7 0 110 14 7 7 0 010-14z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Admin Control Console</h2>
                  <p className="text-[11px] text-slate-500 font-medium">Exclusively authorized for al.matubis17@gmail.com</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAdminPanelOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-white">
              {/* Quick Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Cursors / Online Now</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-slate-900">
                      {presenceList.filter(u => u.isOnline && (Date.now() - (u.lastActive || 0) < 60000)).length}
                    </span>
                    <span className="text-xs text-emerald-600 font-bold flex items-center">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                      live users
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Registered Accounts</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-slate-900">{presenceList.length}</span>
                    <span className="text-xs text-slate-500 font-medium">unique sessions</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deployed Boards</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-black text-slate-900">{boards.length}</span>
                    <span className="text-xs text-slate-500 font-medium">collaborative rooms</span>
                  </div>
                </div>
              </div>

              {/* Direct Firestore Database Metrics & Quotas Overview */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Firestore Free-Tier Quotas & Live Database Metrics</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Real-time resource tracking synchronized directly with Firestore documents.</p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                    Date: {todayStr}
                  </span>
                </div>

                {/* Quota Progress Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Daily Writes Quota card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Daily Writes Quota</span>
                        <h4 className="text-2xl font-black text-slate-800">
                          {totalWritesToday.toLocaleString()} <span className="text-xs font-semibold text-slate-500">/ 40,000 write units</span>
                        </h4>
                      </div>
                      <div className="bg-blue-50 text-blue-700 font-bold text-[10px] uppercase px-3 py-1.5 rounded-xl border border-blue-100 self-start">
                        {Math.max(0, 40000 - totalWritesToday).toLocaleString()} Left to consume
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (totalWritesToday / 40000) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                        <span>{((totalWritesToday / 40000) * 100).toFixed(2)}% consumed</span>
                        <span>Limit: 40,000/day</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">Teacher Writes:</span>
                        <strong className="text-slate-700 block mt-0.5 font-bold">{totalTeacherWritesToday.toLocaleString()} units</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Student Writes:</span>
                        <strong className="text-slate-700 block mt-0.5 font-bold">{Math.max(0, totalWritesToday - totalTeacherWritesToday).toLocaleString()} units</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">All-Time Tracked:</span>
                        <strong className="text-slate-700 block mt-0.5 font-bold">{totalWritesAllTime.toLocaleString()} units</strong>
                      </div>
                    </div>
                  </div>

                  {/* Daily Reads Quota card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Daily Reads Quota</span>
                        <h4 className="text-2xl font-black text-slate-800">
                          {totalReadsToday.toLocaleString()} <span className="text-xs font-semibold text-slate-500">/ 50,000 read units</span>
                        </h4>
                      </div>
                      <div className="bg-indigo-50 text-indigo-700 font-bold text-[10px] uppercase px-3 py-1.5 rounded-xl border border-indigo-100 self-start">
                        {Math.max(0, 50000 - totalReadsToday).toLocaleString()} Left to consume
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="space-y-1.5">
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (totalReadsToday / 50000) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-semibold text-slate-500">
                        <span>{((totalReadsToday / 50000) * 100).toFixed(2)}% consumed</span>
                        <span>Limit: 50,000/day</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[11px] border-t border-slate-200 pt-3">
                      <span className="text-slate-400 font-medium">All-Time Tracked Reads:</span>
                      <strong className="text-slate-700 font-bold">{totalReadsAllTime.toLocaleString()} units</strong>
                    </div>
                  </div>
                </div>

                {/* Units Explanation Callout */}
                <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex gap-3 text-xs text-blue-950 leading-relaxed">
                  <div className="p-1.5 bg-blue-100 rounded-lg text-blue-700 shrink-0 h-fit">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-blue-950 block">Understanding "Unit" Reads and Writes in Firestore</span>
                    <p className="text-blue-900 text-[11px]">
                      <strong>1 Unit = 1 Document Operation.</strong> Google Cloud Firestore tracks daily usage and billing by discrete document operations:
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-blue-800">
                      <li><strong>1 Write Unit:</strong> Creating, updating, or deleting 1 document in Firestore.</li>
                      <li><strong>1 Read Unit:</strong> Fetching or listening to 1 document returned by a query or listener.</li>
                      <li><strong>Blob Optimization Saving Quota:</strong> Because our app batches drawing paths and whiteboard elements into document blobs (shards), writing 50 shapes in 1 blob counts as <strong>only 1 Write Unit</strong> instead of 50 separate write operations!</li>
                    </ul>
                  </div>
                </div>

                {/* Database Optimization Highlights Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Storage Architecture</span>
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">100:1 Sharded Blobs</span>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold">Batched Element & Drawing Storage</p>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      Drawings and elements are consolidated into <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">elements_blob</code> documents. A 1,000-point stroke issues only 1 batched write instead of 1,000 document writes.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Transient Sync</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">WebSockets</span>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold">Zero-Database Live Cursors</p>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      High-frequency cursor movements and active pen streams bypass Firestore completely and stream over WebSockets on port 3000, incurring 0 database write charges.
                    </p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Presence Heartbeats</span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">Throttled (120s)</span>
                    </div>
                    <p className="text-xs text-slate-700 font-semibold">Idle Write Protection</p>
                    <p className="text-[11px] text-slate-500 leading-normal">
                      User presence in <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">/presence</code> is updated at most once every 2 minutes or when tab visibility changes, protecting the 20,000 write free tier limit.
                    </p>
                  </div>
                </div>

                {/* Direct Room Inventory Table */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Direct Firestore Room Inventory & Operation Breakdown</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Live records queried directly from the <code className="bg-slate-200/80 px-1 py-0.5 rounded font-mono">/whiteboards</code> collection.</p>
                    </div>
                    <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-md font-semibold self-start sm:self-auto">
                      Total Active Rooms: {boards.length}
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50/75 backdrop-blur-xs border-b border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider sticky top-0 z-10">
                          <th className="p-3 pl-4">Board Name</th>
                          <th className="p-3">Created By</th>
                          <th className="p-3">Assigned Student</th>
                          <th className="p-3 text-center">Reads Today</th>
                          <th className="p-3 text-center">Writes Today</th>
                          <th className="p-3 text-center">Teacher Writes</th>
                          <th className="p-3 text-right pr-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {boards.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                              No boards found in Firestore.
                            </td>
                          </tr>
                        ) : (
                          boards.map((b) => {
                            const bReads = b.dailyReads?.[todayStr] || 0;
                            const bWrites = b.dailyWrites?.[todayStr] || 0;
                            const bTeacherWrites = b.teacherDailyWrites?.[todayStr] || 0;
                            return (
                              <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-3 pl-4 font-bold text-slate-800 max-w-[200px] truncate">{b.name}</td>
                                <td className="p-3 text-slate-500 font-medium">{b.createdBy}</td>
                                <td className="p-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                    {b.studentName || 'All Students'}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-mono font-bold text-indigo-600">
                                  {bReads.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-mono font-bold text-blue-600">
                                  {bWrites.toLocaleString()}
                                </td>
                                <td className="p-3 text-center font-mono text-slate-600">
                                  {bTeacherWrites.toLocaleString()}
                                </td>
                                <td className="p-3 text-right pr-4 space-x-2">
                                  <button
                                    onClick={() => {
                                      setIsAdminPanelOpen(false);
                                      handleJoinBoard(b);
                                    }}
                                    className="text-[11px] bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                                  >
                                    Open
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteBoard(b.id, e)}
                                    className="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-600 px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Historical Resource Usage & Analytics */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Historical Operations Log & Analytics</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Audit previous days' read and write loads across individual rooms.</p>
                    </div>
                  </div>
                  
                  {/* Controls / Filter row */}
                  <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                    {/* Board selector */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Room:</span>
                      <select
                        value={selectedHistoryBoardId}
                        onChange={(e) => {
                          setSelectedHistoryBoardId(e.target.value);
                          setHoveredIndex(null);
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer max-w-[160px]"
                      >
                        <option value="all">All Collaborative Rooms</option>
                        {boards.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Days selector */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Range:</span>
                      <select
                        value={historyDaysLimit}
                        onChange={(e) => {
                          setHistoryDaysLimit(Number(e.target.value));
                          setHoveredIndex(null);
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-xs px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                      >
                        <option value={7}>7 Days</option>
                        <option value={14}>14 Days</option>
                        <option value={30}>30 Days</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Subheader / Tabs */}
                <div className="flex items-center justify-between">
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setHistoryTab('chart')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        historyTab === 'chart'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      <span>Visual Trends</span>
                    </button>
                    <button
                      onClick={() => setHistoryTab('table')}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        historyTab === 'table'
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>Detailed Daily Log</span>
                    </button>
                  </div>
                  
                  <span className="text-[10px] text-slate-400 font-medium italic">
                    Historical figures reflect archived document syncing logs.
                  </span>
                </div>

                {/* Historical Content Area */}
                {historyTab === 'chart' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-50/50 border border-slate-200 rounded-2xl p-5">
                    {/* SVG Chart area */}
                    <div className="lg:col-span-2 space-y-3 bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Operation Load (Daily)</span>
                        <div className="flex items-center gap-3 text-[10px] font-bold">
                          <span className="flex items-center gap-1 text-indigo-600">
                            <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 block"></span> Reads
                          </span>
                          <span className="flex items-center gap-1 text-blue-600">
                            <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 block"></span> Writes
                          </span>
                        </div>
                      </div>
                      
                      <div className="pt-4 overflow-x-auto">
                        {(() => {
                          const chartData = [...historicalStats].reverse();
                          const maxVal = Math.max(...chartData.map(d => Math.max(d.reads, d.writes)), 10);
                          
                          return (
                            <div className="min-w-[400px]">
                              <svg viewBox="0 0 800 200" className="w-full h-48 select-none">
                                {/* Grid lines */}
                                <line x1="50" y1="20" x2="760" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                                <line x1="50" y1="70" x2="760" y2="70" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                                <line x1="50" y1="120" x2="760" y2="120" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                                <line x1="50" y1="170" x2="760" y2="170" stroke="#cbd5e1" strokeWidth="1" />
                                
                                {/* Axis Labels */}
                                <text x="45" y="24" className="text-[9px] fill-slate-400 font-mono font-bold" textAnchor="end">
                                  {maxVal.toLocaleString()}
                                </text>
                                <text x="45" y="99" className="text-[9px] fill-slate-400 font-mono font-bold" textAnchor="end">
                                  {Math.round(maxVal / 2).toLocaleString()}
                                </text>
                                <text x="45" y="174" className="text-[9px] fill-slate-400 font-mono font-bold" textAnchor="end">
                                  0
                                </text>
                                
                                {/* Bars */}
                                {chartData.map((d, index) => {
                                  const totalBars = chartData.length;
                                  const chartWidth = 710;
                                  const groupWidth = chartWidth / totalBars;
                                  const barWidth = Math.max(4, groupWidth * 0.28);
                                  const gap = groupWidth * 0.1;
                                  
                                  const xGroupStart = 50 + (index * groupWidth) + (groupWidth - (barWidth * 2 + gap)) / 2;
                                  const xReads = xGroupStart;
                                  const xWrites = xGroupStart + barWidth + gap;
                                  
                                  const hReads = (d.reads / maxVal) * 150;
                                  const hWrites = (d.writes / maxVal) * 150;
                                  
                                  const yReads = 170 - hReads;
                                  const yWrites = 170 - hWrites;
                                  
                                  const displayDate = d.date.split('-').slice(1).join('/');
                                  const isSelected = hoveredIndex === index;
                                  
                                  return (
                                    <g key={d.date} className="group cursor-pointer">
                                      {/* Background column highlights on hover */}
                                      <rect
                                        x={50 + (index * groupWidth)}
                                        y="10"
                                        width={groupWidth}
                                        height="160"
                                        className={`transition-colors duration-150 ${isSelected ? 'fill-slate-50/70' : 'fill-transparent'}`}
                                      />

                                      {/* Reads Bar (Indigo) */}
                                      <rect
                                        x={xReads}
                                        y={yReads}
                                        width={barWidth}
                                        height={hReads}
                                        rx={Math.min(2, barWidth / 2)}
                                        className={`transition-colors duration-200 ${isSelected ? 'fill-indigo-600 shadow-sm' : 'fill-indigo-400/85'}`}
                                      />
                                      
                                      {/* Writes Bar (Blue) */}
                                      <rect
                                        x={xWrites}
                                        y={yWrites}
                                        width={barWidth}
                                        height={hWrites}
                                        rx={Math.min(2, barWidth / 2)}
                                        className={`transition-colors duration-200 ${isSelected ? 'fill-blue-600 shadow-sm' : 'fill-blue-400/85'}`}
                                      />
                                      
                                      {/* Hover activation hit box */}
                                      <rect
                                        x={50 + (index * groupWidth)}
                                        y="10"
                                        width={groupWidth}
                                        height="165"
                                        className="fill-transparent opacity-0 cursor-pointer"
                                        onMouseEnter={() => setHoveredIndex(index)}
                                        onMouseLeave={() => setHoveredIndex(null)}
                                      />
                                      
                                      {/* Date labels on X-axis */}
                                      <text 
                                        x={50 + (index * groupWidth) + groupWidth / 2} 
                                        y="188" 
                                        className={`text-[9px] font-mono font-bold text-center transition-colors ${
                                          isSelected ? 'fill-slate-900 font-extrabold' : 'fill-slate-400'
                                        }`}
                                        textAnchor="middle"
                                      >
                                        {displayDate}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                          );
                        })()}
                      </div>
                      
                      <p className="text-[10px] text-slate-400 text-center font-medium">
                        ← Move your cursor across the chart bars to inspect individual day breakdowns →
                      </p>
                    </div>

                    {/* Interactive breakdown panel */}
                    <div className="bg-slate-900 text-slate-200 rounded-xl p-5 flex flex-col justify-between border border-slate-800 shadow-md">
                      {(() => {
                        const chartData = [...historicalStats].reverse();
                        const activeIndex = hoveredIndex !== null ? hoveredIndex : chartData.length - 1;
                        const activeData = chartData[activeIndex];

                        if (!activeData) {
                          return (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                              <span className="text-slate-500 font-medium text-xs">No historical records available for this selected scope.</span>
                            </div>
                          );
                        }

                        // Format full string date
                        const parsedDate = new Date(activeData.date + "T00:00:00");
                        const fullDateString = parsedDate.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        });

                        return (
                          <div className="space-y-4 flex-1 flex flex-col justify-between">
                            <div className="space-y-3">
                              <div className="border-b border-slate-800 pb-2">
                                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block">Selected Audit Date</span>
                                <span className="text-sm font-extrabold text-white block mt-0.5">{fullDateString}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-850 p-3 rounded-lg border border-slate-800">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Reads</span>
                                  <strong className="text-lg font-black text-white font-mono block mt-1">{activeData.reads.toLocaleString()}</strong>
                                  <span className="text-[9px] text-indigo-300 font-bold block mt-0.5">{(activeData.reads / 50000 * 100).toFixed(1)}% of limit</span>
                                </div>

                                <div className="bg-slate-850 p-3 rounded-lg border border-slate-800">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Writes</span>
                                  <strong className="text-lg font-black text-white font-mono block mt-1">{activeData.writes.toLocaleString()}</strong>
                                  <span className="text-[9px] text-blue-300 font-bold block mt-0.5">{(activeData.writes / 20000 * 100).toFixed(1)}% of limit</span>
                                </div>
                              </div>

                              <div className="bg-slate-850 rounded-lg p-3 border border-slate-800 space-y-2 text-xs">
                                <div className="flex justify-between items-center text-slate-300">
                                  <span className="font-semibold text-slate-400">Teacher Writes:</span>
                                  <span className="font-mono font-bold text-white">{activeData.teacherWrites.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-300">
                                  <span className="font-semibold text-slate-400">Student Writes:</span>
                                  <span className="font-mono font-bold text-white">{activeData.studentWrites.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5 pt-3 border-t border-slate-800">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Active Rooms ({activeData.boardBreakdown.length})</span>
                              {activeData.boardBreakdown.length === 0 ? (
                                <span className="text-[10px] text-slate-500 italic block">No collaborative activity logged for this date.</span>
                              ) : (
                                <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                  {activeData.boardBreakdown.slice(0, 4).map(bb => (
                                    <div key={bb.id} className="flex justify-between items-center text-[10px] bg-slate-800 px-2 py-1.5 rounded-md">
                                      <span className="truncate font-semibold text-slate-300 max-w-[120px]">{bb.name}</span>
                                      <span className="font-mono text-indigo-300 font-bold">R:{bb.reads} / W:{bb.writes}</span>
                                    </div>
                                  ))}
                                  {activeData.boardBreakdown.length > 4 && (
                                    <span className="text-[9px] text-slate-500 font-medium block text-right">+ {activeData.boardBreakdown.length - 4} more rooms</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ) : (
                  /* Detailed History Table View */
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase tracking-wider">
                            <th className="p-3 w-8"></th>
                            <th className="p-3">Date</th>
                            <th className="p-3 text-center">Reads</th>
                            <th className="p-3 text-center">Writes</th>
                            <th className="p-3 text-center">Teacher Writes</th>
                            <th className="p-3 text-center">Student Writes</th>
                            <th className="p-3 text-right">Active Rooms</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {historicalStats.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="p-4 text-center text-slate-400 italic">
                                No historical entries available.
                              </td>
                            </tr>
                          ) : (
                            historicalStats.map((hs) => {
                              const isExpanded = expandedDates[hs.date] || false;
                              const parsedDate = new Date(hs.date + "T00:00:00");
                              const formattedDate = parsedDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              });

                              return (
                                <React.Fragment key={hs.date}>
                                  <tr className="hover:bg-slate-50/40 transition-colors">
                                    <td className="p-3">
                                      <button
                                        onClick={() => setExpandedDates(prev => ({ ...prev, [hs.date]: !isExpanded }))}
                                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700 cursor-pointer"
                                      >
                                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </button>
                                    </td>
                                    <td className="p-3 font-semibold text-slate-800">{formattedDate}</td>
                                    <td className="p-3 text-center font-mono font-bold text-indigo-600">{hs.reads.toLocaleString()}</td>
                                    <td className="p-3 text-center font-mono font-bold text-blue-600">{hs.writes.toLocaleString()}</td>
                                    <td className="p-3 text-center font-mono text-slate-500">{hs.teacherWrites.toLocaleString()}</td>
                                    <td className="p-3 text-center font-mono text-slate-500">{hs.studentWrites.toLocaleString()}</td>
                                    <td className="p-3 text-right font-medium text-slate-600">{hs.boardBreakdown.length} rooms</td>
                                  </tr>
                                  {isExpanded && (
                                    <tr className="bg-slate-50/50">
                                      <td colSpan={7} className="p-4 border-t border-b border-slate-100">
                                        <div className="space-y-3 pl-8">
                                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                            <span>Breakdown of Rooms used on {hs.date}</span>
                                          </div>
                                          
                                          {hs.boardBreakdown.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">No detailed actions recorded on individual rooms.</p>
                                          ) : (
                                            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white max-w-2xl">
                                              <table className="w-full text-[11px] text-left border-collapse">
                                                <thead>
                                                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                                                    <th className="p-2.5">Room Name</th>
                                                    <th className="p-2.5 text-center">Reads</th>
                                                    <th className="p-2.5 text-center">Writes</th>
                                                    <th className="p-2.5 text-center">Teacher Writes</th>
                                                    <th className="p-2.5 text-center">Student Writes</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-medium">
                                                  {hs.boardBreakdown.map((bb) => (
                                                    <tr key={bb.id} className="hover:bg-slate-50/20">
                                                      <td className="p-2 text-slate-800 font-bold">{bb.name}</td>
                                                      <td className="p-2 text-center font-mono text-indigo-600 font-semibold">{bb.reads.toLocaleString()}</td>
                                                      <td className="p-2 text-center font-mono text-blue-600 font-semibold">{bb.writes.toLocaleString()}</td>
                                                      <td className="p-2 text-center font-mono text-slate-500">{bb.teacherWrites.toLocaleString()}</td>
                                                      <td className="p-2 text-center font-mono text-slate-500">{bb.studentWrites.toLocaleString()}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Master Access Control Card */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-6v2m0-5a7 7 0 110 14 7 7 0 010-14z" />
                      </svg>
                      <span>Global Application Access Kill-Switch</span>
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                      Instantly toggle whether the whiteboard application is available for other students and teachers. 
                      Your email <strong className="text-red-600">al.matubis17@gmail.com</strong> will always bypass this lock to prevent lockout.
                    </p>
                  </div>

                  <button
                    onClick={handleToggleAppEnabled}
                    className={`px-5 py-3 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer shadow-sm ${
                      adminAppEnabled 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200' 
                        : 'bg-red-600 hover:bg-red-700 text-white shadow-red-200 animate-pulse'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-white block"></span>
                    <span>{adminAppEnabled ? 'ALLOW ACCESS (Enabled)' : 'BLOCK ACCESS (Disabled)'}</span>
                  </button>
                </div>

                <div className={`border rounded-xl p-4 flex gap-3 text-xs leading-relaxed ${
                  adminAppEnabled 
                    ? 'bg-emerald-50/40 border-emerald-100 text-emerald-800' 
                    : 'bg-rose-50/40 border-rose-100 text-rose-800'
                }`}>
                  <div className={`p-1.5 rounded-lg shrink-0 h-fit ${
                    adminAppEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-bold block mb-0.5">
                      {adminAppEnabled ? 'System Status: Active' : 'System Status: Restricted'}
                    </span>
                    <span>
                      {adminAppEnabled 
                        ? 'The application is fully public. Any user can create private or shared board environments, sync edits, and interact live.' 
                        : 'The app is locked. Any user other than you attempting to use the workspace will be greeted by a locked suspension screen.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time Usage Monitor / Collaborators Directory */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Live Collaborators & Usage Monitor</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Real-time presence database records and heartbeats.</p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Filter by name or email..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-colors"
                    />
                    <div className="absolute left-3 top-2.5 text-slate-400">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="p-4">Collaborator</th>
                          <th className="p-4">Role</th>
                          <th className="p-4">Current Board Location</th>
                          <th className="p-4">Last Event</th>
                          <th className="p-4">Status</th>
                          <th className="p-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {presenceList.filter(u => {
                          const query = searchQuery.toLowerCase();
                          return (
                            (u.name || '').toLowerCase().includes(query) ||
                            (u.email || '').toLowerCase().includes(query)
                          );
                        }).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                              No active presence sessions found matching criteria.
                            </td>
                          </tr>
                        ) : (
                          presenceList
                            .filter(u => {
                              const query = searchQuery.toLowerCase();
                              return (
                                (u.name || '').toLowerCase().includes(query) ||
                                (u.email || '').toLowerCase().includes(query)
                              );
                            })
                            .map((u) => {
                              const isActuallyOnline = u.isOnline && (Date.now() - (u.lastActive || 0) < 60000);
                              return (
                                <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-slate-800">{u.name || 'Anonymous'}</span>
                                      <span className="text-[10px] text-slate-400 font-mono">{u.email || 'guest-session'}</span>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <span className={`inline-flex px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider ${
                                      u.role === 'teacher' 
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                                        : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {u.role || 'student'}
                                    </span>
                                  </td>
                                  <td className="p-4">
                                    {u.currentBoardId ? (
                                      <div className="flex flex-col">
                                        <span className="font-medium text-slate-700 line-clamp-1">{u.currentBoardName || 'Active Board'}</span>
                                        <span className="text-[9px] text-slate-400 font-mono line-clamp-1">{u.currentBoardId}</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400 italic font-medium">In Dashboard</span>
                                    )}
                                  </td>
                                  <td className="p-4 font-medium text-slate-500">
                                    {formatLastActive(u.lastActive)}
                                  </td>
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1.5 font-bold uppercase text-[9px] px-2 py-0.5 rounded-full ${
                                      isActuallyOnline 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                        : 'bg-slate-50 text-slate-400 border border-slate-100'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${isActuallyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                                      <span>{isActuallyOnline ? 'Online' : 'Offline'}</span>
                                    </span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <button
                                      disabled={u.email === 'al.matubis17@gmail.com'}
                                      onClick={() => handleRemovePresence(u.uid)}
                                      className="p-1.5 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:text-slate-200 cursor-pointer"
                                      title="Clear presence document"
                                    >
                                      <Trash2 className="w-4 h-4 mx-auto" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button 
                onClick={() => setIsAdminPanelOpen(false)}
                className="px-5 py-2 text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all cursor-pointer shadow-xs"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
