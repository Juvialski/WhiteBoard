import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LiveCursors from './LiveCursors';
import { Collaborator, UserProfile } from '../types';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

describe('LiveCursors', () => {
  const mockUser: UserProfile = {
    id: 'u1',
    name: 'TestUser',
    color: '#123',
    role: 'student'
  };

  it('renders cursors from socket ref', async () => {
    const mockCollaborator: Collaborator = {
      id: 'c1',
      name: 'Collab 1',
      color: '#ff0000',
      x: 100,
      y: 200,
      lastActive: Date.now()
    };

    const socketCollaboratorsRef = {
      current: {
        'c1': mockCollaborator
      }
    };

    render(
      <LiveCursors 
        boardId="board1" 
        currentUser={mockUser} 
        socketCollaboratorsRef={socketCollaboratorsRef as any} 
      />
    );

    expect(await screen.findByText('Collab 1')).toBeTruthy();
  });
});
