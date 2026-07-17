const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /const unsubscribe = onSnapshot\(q, \(snapshot\) => {[\s\S]*?console\.error\("Snapshot connection error:", error\);\n      setSyncStatus\('offline'\);\n    }\);\n\n    return \(\) => unsubscribe\(\);/m;

const replacement = `let initialUnsubscribe: any;
    let isInitialLoad = true;
    let fallbackUnsubscribe: any;

    initialUnsubscribe = onSnapshot(q, (snapshot) => {
      if (!isInitialLoad) return;
      const readCount = snapshot.docChanges().length || snapshot.size || 1;
      incrementStats('read', readCount);

      const loaded: BoardElement[] = [];
      snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const data = docSnap.data();
        if (id === "drawings_blob") {
          if (data && Array.isArray(data.drawings)) {
            loaded.push(...data.drawings);
          }
        } else {
          loaded.push({ id, ...data } as BoardElement);
        }
      });
      setElements(loaded);

      try {
        localStorage.setItem(\`whiteboard_elements_\${boardId}\`, JSON.stringify(loaded));
        const drawings = loaded.filter(el => el.type === "drawing") as DrawingElement[];
        idbSet(\`drawings_\${boardId}\`, drawings).catch(e => console.error("IDB save error:", e));
      } catch (e) {
        console.error("Local storage error:", e);
      }
    }, (error) => {
      console.error("Snapshot connection error:", error);
      setSyncStatus('offline');
    });

    const timeout = setTimeout(() => {
      isInitialLoad = false;
      
      // CRITICAL QUOTA OPTIMIZATION:
      // If WebSocket is successfully connected, unsubscribe the Firestore listener to prevent continuous read billing!
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (initialUnsubscribe) initialUnsubscribe();
        return;
      }
      
      fallbackUnsubscribe = onSnapshot(q, (snapshot) => {
        const readCount = snapshot.docChanges().length || snapshot.size || 1;
        incrementStats('read', readCount);

        if (hasUnsavedChanges.current && activeUsersCount <= 1) {
          return;
        }

        const loaded: BoardElement[] = [];
        snapshot.forEach((docSnap) => {
          const id = docSnap.id;
          const data = docSnap.data();
          if (id === "drawings_blob") {
            if (data && Array.isArray(data.drawings)) {
              loaded.push(...data.drawings);
            }
          } else {
            loaded.push({ id, ...data } as BoardElement);
          }
        });
        setElements(loaded);

        try {
          localStorage.setItem(\`whiteboard_elements_\${boardId}\`, JSON.stringify(loaded));
          const drawings = loaded.filter(el => el.type === "drawing") as DrawingElement[];
          idbSet(\`drawings_\${boardId}\`, drawings).catch(e => console.error("IDB save error:", e));
        } catch (e) {
          console.error("Local storage error:", e);
        }
      });
    }, 4000);

    return () => {
      clearTimeout(timeout);
      if (initialUnsubscribe) initialUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
