import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';
import { UserProfile } from '../types';

// Mock firebase
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    forEach: () => {},
  }),
  onSnapshot: vi.fn((q, callback) => {
    callback({
      forEach: () => {},
    });
    return vi.fn();
  }),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

describe('Dashboard', () => {
  const defaultProps = {
    onSelectBoard: vi.fn(),
    currentUserProfile: null as UserProfile | null,
    onSignInGoogle: vi.fn(),
    onSignOut: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders student mode by default', () => {
    render(<Dashboard {...defaultProps} />);
    
    // Should show "Need a Private Board?" since we're in student mode
    expect(screen.getByText('Need a Private Board?')).toBeTruthy();
  });

  it('can switch to teacher mode', async () => {
    render(<Dashboard {...defaultProps} />);
    
    // Switch to teacher
    const teacherModeBtn = screen.getByText('Teacher Mode');
    fireEvent.click(teacherModeBtn);
    
    // Should show board creation tools now
    await waitFor(() => {
      expect(screen.getByText('Create Student Whiteboard')).toBeTruthy();
      expect(screen.getByText('PDF Whiteboard Mode')).toBeTruthy();
    });
  });

  it('displays user profile info if logged in', () => {
    const profile: UserProfile = {
      id: 'test-123',
      name: 'Test User',
      color: '#000000',
      role: 'teacher'
    };

    render(<Dashboard {...defaultProps} currentUserProfile={profile} />);
    
    expect(screen.getByText('Test User')).toBeTruthy();
    expect(screen.getByText('Disconnect')).toBeTruthy();
  });
});
