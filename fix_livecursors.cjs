const fs = require('fs');
let code = fs.readFileSync('src/components/LiveCursors.tsx', 'utf8');

const regex = /\/\/ Listen to all active cursors for this board \(Firestore fallback\)[\s\S]*return \(\) => unsubscribe\(\);\n  },/m;

const replacement = `    // Listen to all active cursors for this board (Firestore fallback)
    let unsubscribe: any;
    const timeout = setTimeout(() => {
      const cursorsRef = collection(db, 'whiteboards', boardId, 'cursors');
      const q = query(cursorsRef);

      unsubscribe = onSnapshot(q, (snapshot) => {
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
    }, 2000);

    return () => {
      clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
    };
  },`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/LiveCursors.tsx', code);
