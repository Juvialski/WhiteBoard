const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /\/\/ Fast initial load via getDocs to prevent charging multiple reads per document on first render\.[\s\S]*?\/\/ We only attach onSnapshot if WebSocket fails or as a fallback for offline users\.\n    const timeout = setTimeout\(\(\) => {/m;

const replacement = `// Fast initial load via onSnapshot to leverage Firebase cache and resume tokens (saving reads).
    // If WebSocket connects, we will unsubscribe this listener to prevent continuous read billing!
    let initialUnsubscribe: any;
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
    });

    // We only attach onSnapshot if WebSocket fails or as a fallback for offline users.
    const timeout = setTimeout(() => {`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
