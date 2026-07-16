import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Collaborator, UserProfile } from '../types';

interface LiveCursorsProps {
  boardId: string;
  currentUser: UserProfile;
  zoom?: number;
  socketCollaborators?: Collaborator[];
}

const CollaboratorCursor = React.memo(({ collaborator, zoom }: { collaborator: Collaborator, zoom: number }) => {
  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: collaborator.x,
        top: collaborator.y,
        transform: `translate(-2px, -2px) scale(${1 / zoom})`,
        transformOrigin: 'top left',
      }}
    >
      <svg
        className="w-5 h-5 drop-shadow-md filter"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M3 3V21L9.12 14.88L15.34 21L18.81 17.53L12.59 11.41L18.71 5.29L3 3Z"
          fill={collaborator.color}
          stroke="white"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="ml-4 -mt-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-md select-none whitespace-nowrap"
        style={{ backgroundColor: collaborator.color }}
      >
        {collaborator.name}
      </div>
    </div>
  );
});

export default function LiveCursors({ boardId, currentUser, zoom = 1, socketCollaborators }: LiveCursorsProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  useEffect(() => {
    if (socketCollaborators && socketCollaborators.length > 0) {
      setCollaborators(socketCollaborators);
      return;
    }

    // Listen to all active cursors for this board (Firestore fallback)
    const cursorsRef = collection(db, 'whiteboards', boardId, 'cursors');
    const q = query(cursorsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeList: Collaborator[] = [];
      const now = Date.now();
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (docSnap.id === currentUser.id) return;
        if (now - (data.lastActive || 0) > 15000) return;

        activeList.push({
          id: docSnap.id,
          name: data.name || 'Anonymous Sparker',
          color: data.color || '#f97316',
          x: data.x || 0,
          y: data.y || 0,
          lastActive: data.lastActive || 0,
        });
      });

      setCollaborators(activeList);
    });

    return () => unsubscribe();
  }, [boardId, currentUser.id, socketCollaborators]);

  return (
    <div className="absolute inset-0 pointer-events-none z-40" id="live-cursors-layer">
      {collaborators.map((c) => (
        <CollaboratorCursor key={c.id} collaborator={c} zoom={zoom} />
      ))}
    </div>
  );
}
