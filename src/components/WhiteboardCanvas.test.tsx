import React from 'react';
import { render, screen } from '@testing-library/react';
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
    role: 'student'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders canvas and toolbar', () => {
    render(
      <WhiteboardCanvas 
        boardId="b1" 
        boardName="Test Board" 
        currentUser={mockUser} 
        onBackToDashboard={vi.fn()} 
      />
    );

    // The name of the board
    expect(screen.getByText('Test Board')).toBeTruthy();
  });
});
