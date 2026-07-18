const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /    \} else \{\n      setSyncStatus\('saving-cloud'\);\n      const batch = writeBatch\(db\);\n      const elementsBlobRef[\s\S]*?incrementStats\('write', clipboardElements\.length\);\n      \} catch \(err\) \{\n        console\.error\("Error pasting elements:", err\);\n        setSyncStatus\('offline'\);\n      \}\n    \}/;

const replacement = `    } else {
      setSyncStatus('saving-cloud');
      
      const currentList = [...elementsRef.current];
      const updatedList = [...currentList];

      const batch = writeBatch(db);
      const blobUpdates: Record<string, any> = {};

      for (let i = 0; i < clipboardElements.length; i++) {
        const el = clipboardElements[i];
        const newId = \`copy-\${Math.random().toString(36).substring(2, 11)}\`;
        
        const newEl = JSON.parse(JSON.stringify(el)) as BoardElement;
        newEl.id = newId;
        newEl.zIndex = maxZ + i + 1;
        newEl.updatedAt = Date.now();
        if ('x' in newEl && 'y' in newEl) {
          newEl.x += (offset / zoom);
          newEl.y += (offset / zoom);
        }
        
        if (newEl.type === 'drawing' && 'points' in newEl) {
          newEl.points = newEl.points.map((p: any) => ({ x: p.x + (offset / zoom), y: p.y + (offset / zoom) }));
        }

        updatedList.push(newEl);
        newPasteIds.push(newId);
        pastedElements.push(newEl);
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });

        const isDraw = newEl.type === 'drawing';
        const blobId = getBlobRefId(isDraw, newId);
        if (!blobUpdates[blobId]) blobUpdates[blobId] = {};
        
        const { id, ...data } = newEl;
        if (isDraw) {
          blobUpdates[blobId][newId] = { ...data, points: simplifyPoints(data.points, 1.2) };
        } else {
          blobUpdates[blobId][newId] = data;
        }
      }

      setElements(updatedList);
      elementsRef.current = updatedList;

      Object.keys(blobUpdates).forEach(blobId => {
        const ref = doc(db, "whiteboards", boardId, "elements", blobId);
        batch.set(ref, { data: blobUpdates[blobId] }, { merge: true });
      });

      try {
        await batch.commit();
        setSyncStatus('synced');
        setSelectedIds(newPasteIds);
        setSelectedId(null);
        setClipboardElements(pastedElements);
        incrementStats('write', clipboardElements.length);
      } catch (err) {
        console.error("Error pasting elements:", err);
        setSyncStatus('offline');
        showSyncToast("Paste failed: " + err.message, "error", 10000);
      }
    }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
