const fs = require('fs');
let code = fs.readFileSync('src/components/LiveCursors.tsx', 'utf8');

code = code.replace(
`    // Listen to all active cursors for this board (Firestore fallback)
    const cursorsRef = collection(db, 'whiteboards', boardId, 'cursors');
    const q = query(cursorsRef);

    const timeout = setTimeout(() => { const unsubscribe = onSnapshot(q, (snapshot) => {
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

    return () => unsubscribe();`,
`    // Listen to all active cursors for this board (Firestore fallback)
    const timeout = setTimeout(() => {
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

      // Cleanup
      const prev = interval;
      interval = () => unsubscribe();
    }, 2000);

    return () => {
      clearTimeout(timeout);
      if (typeof interval === 'function') interval();
    };`
);

fs.writeFileSync('src/components/LiveCursors.tsx', code);
