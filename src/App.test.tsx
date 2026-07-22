import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

// Mock firebase
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((doc, callback) => {
    callback({
      exists: () => true,
      data: () => ({ appEnabled: true }),
    });
    return vi.fn(); // return unsubscribe function
  }),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    // Simulate not logged in state after a small delay or immediately
    callback(null);
    return vi.fn();
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./firebase', () => ({
  db: {},
  auth: {},
  googleProvider: {},
}));

// Mock child components to avoid deep rendering issues in App
vi.mock('./components/Dashboard', () => {
  return {
    default: () => <div data-testid="dashboard">Dashboard Mock</div>
  };
});

vi.mock('./components/WhiteboardCanvas', () => {
  return {
    default: () => <div data-testid="whiteboard">Whiteboard Mock</div>
  };
});

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders Dashboard by default when not on a board', async () => {
    render(<App />);
    
    // We expect Dashboard to be rendered because we mocked onAuthStateChanged to return null,
    // and no board is selected.
    expect(await screen.findByTestId('dashboard')).toBeTruthy();
  });
});
