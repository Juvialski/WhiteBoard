const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /const loaded: BoardElement\[\] = \[\];[\s\S]*?setElements\(loaded\);/;

const replacement = `      const loadedMap = new Map<string, BoardElement>();
      let hasStrays = false;
      const straysToDelete: string[] = [];
      const shardUpdates: Record<string, any> = {};

      snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const docData = docSnap.data();

        if (id.startsWith("elements_blob") || id.startsWith("drawings_blob")) {
          if (docData && docData.data) {
            Object.keys(docData.data).forEach(elId => {
              // Priority to blob data
              loadedMap.set(elId, { id: elId, ...docData.data[elId] } as BoardElement);
            });
          } else if (id.startsWith("drawings_blob") && docData && Array.isArray(docData.drawings)) {
            docData.drawings.forEach((d: any) => loadedMap.set(d.id, d));
          }
        } else {
          // If it's a stray document, we only add it if it's NOT already in a blob
          if (!id.startsWith("chat_") && !id.startsWith("meta_")) {
            hasStrays = true;
            straysToDelete.push(id);
            const blobId = getBlobRefId(docData.type === "drawing", id);
            if (!shardUpdates[blobId]) shardUpdates[blobId] = {};
            if (docData.type === "drawing") {
              shardUpdates[blobId][id] = { ...docData, points: simplifyPoints(docData.points, 1.2) };
            } else {
              shardUpdates[blobId][id] = docData;
            }
            
            if (!loadedMap.has(id)) {
              loadedMap.set(id, { id, ...docData } as BoardElement);
            }
          } else {
            if (!loadedMap.has(id)) {
              loadedMap.set(id, { id, ...docData } as BoardElement);
            }
          }
        }
      });

      const loaded = Array.from(loadedMap.values());
      setElements(loaded);`;

code = code.replace(regex, replacement);

const errorRegex = /console\.error\("Migration failed:", err\);/;
code = code.replace(errorRegex, `console.error("Migration failed:", err); showSyncToast("Migration failed: " + err.message, "error", 10000);`);

fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
