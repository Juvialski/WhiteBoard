import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WhiteboardCanvas from './WhiteboardCanvas';
import { UserProfile } from '../types';

vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    forEach: () => {}
  }),
  onSnapshot: vi.fn((q, cb) => {
    // Return empty list initially to not break everything
    cb({
      size: 0,
      docChanges: () => [],
      forEach: () => {},
      exists: () => true,
      data: () => ({})
    });
    return vi.fn();
  }),
  doc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  increment: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {}
}));

// Mock pdf util
vi.mock('../utils/pdf', () => ({
  exportPdfWithDrawings: vi.fn(),
  pdfToImages: vi.fn()
}));

// Mock react-markdown because it can be problematic in jsdom
vi.mock('react-markdown', () => {
  return {
    default: ({ children }: any) => <div data-testid="markdown">{children}</div>
  };
});

describe('WhiteboardCanvas', () => {
  const mockUser: UserProfile = {
    id: 'u1',
    name: 'TestUser',
    color: '#123',
    role: 'teacher'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders canvas, board name and toolbar elements correctly', () => {
    render(
      <WhiteboardCanvas 
        boardId="b1" 
        boardName="Test Math Board" 
        currentUser={mockUser} 
        onBackToDashboard={vi.fn()} 
      />
    );

    // The name of the board
    expect(screen.getByText('Test Math Board')).toBeTruthy();
    // Toolbar buttons are rendered
    expect(screen.getByTitle('Select & Edit (V)')).toBeTruthy();
    expect(screen.getByTitle('Sticky Note (N)')).toBeTruthy();
    expect(screen.getByTitle('AI Assistant')).toBeTruthy();
  });

  it('handles back button click', () => {
    const onBack = vi.fn();
    render(
      <WhiteboardCanvas 
        boardId="b1" 
        boardName="Test Board" 
        currentUser={mockUser} 
        onBackToDashboard={onBack} 
      />
    );

    const backBtn = screen.getByText('All Boards');
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('renders AI Assistant trigger and opens AI Assistant panel', () => {
    render(
      <WhiteboardCanvas 
        boardId="b1" 
        boardName="Math Test Board" 
        currentUser={mockUser} 
        onBackToDashboard={vi.fn()} 
      />
    );

    const aiBtn = screen.getByTitle('AI Assistant');
    fireEvent.click(aiBtn);
    expect(screen.getByText('AI Tutor & Problem Solver')).toBeTruthy();
  });
});
