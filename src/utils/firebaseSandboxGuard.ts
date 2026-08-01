/**
 * Firebase Sandbox Guard Utility
 * 
 * Permanently bans/blocks Firebase Firestore read and write operations when running 
 * in the AI Studio Sandbox environment (ais-dev-*, localhost, 127.0.0.1) to eliminate 
 * quota consumption during development sessions.
 */

export const isSandboxEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('ais-dev') ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    Boolean(localStorage.getItem('BAN_FIREBASE_SANDBOX'))
  );
};

export const getSandboxLocalBoards = (): any[] => {
  try {
    const raw = localStorage.getItem('lucid_spark_boards');
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading sandbox local boards:', err);
  }
  // Default fallback board for sandbox testing
  const defaultBoards = [
    {
      id: 'sandbox-board-1',
      name: 'Sandbox Local Whiteboard',
      description: 'Local Sandbox Workspace (0 Firebase Reads/Writes Consumed)',
      createdAt: Date.now(),
      createdBy: 'Sandbox Developer',
      studentId: '',
      studentName: 'All Collaborative',
      studentsCanWrite: true,
      dailyWrites: {},
      dailyReads: {},
      teacherDailyWrites: {}
    }
  ];
  try {
    localStorage.setItem('lucid_spark_boards', JSON.stringify(defaultBoards));
  } catch (err) {
    console.warn('Could not save default sandbox boards to localStorage:', err);
  }
  return defaultBoards;
};

export const saveSandboxLocalBoards = (boards: any[]) => {
  try {
    localStorage.setItem('lucid_spark_boards', JSON.stringify(boards));
    window.dispatchEvent(new CustomEvent('lucid_spark_boards_updated'));
  } catch (err) {
    console.error('Error saving sandbox local boards:', err);
  }
};

export const getSandboxLocalElements = (boardId: string): any[] => {
  try {
    const raw = localStorage.getItem(`lucid_spark_board_elements_${boardId}`);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading sandbox elements for board', boardId, err);
  }
  return [];
};

export const saveSandboxLocalElements = (boardId: string, elements: any[]) => {
  try {
    localStorage.setItem(`lucid_spark_board_elements_${boardId}`, JSON.stringify(elements));
    window.dispatchEvent(new CustomEvent('lucid_spark_elements_updated', { detail: { boardId } }));
  } catch (err) {
    console.error('Error saving sandbox elements for board', boardId, err);
  }
};
