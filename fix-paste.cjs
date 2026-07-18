const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const oldPaste = `      const batch = writeBatch(db);
      const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
      const drawingsBlobRef = doc(db, "whiteboards", boardId, "elements", "drawings_blob");
      
      const elementsBlobData: Record<string, any> = {};
      const drawingsBlobData: Record<string, any> = {};
      
      let hasElementUpdates = false;
      let hasDrawingUpdates = false;

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

        const { id, ...data } = newEl;
        if (newEl.type === 'drawing') {
          drawingsBlobData[newId] = data;
          hasDrawingUpdates = true;
        } else {
          elementsBlobData[newId] = data;
          hasElementUpdates = true;
        }

        newPasteIds.push(newId);
        pastedElements.push(newEl);
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });
      }

      if (hasElementUpdates) {
        batch.set(elementsBlobRef, { data: elementsBlobData }, { merge: true });
      }
      if (hasDrawingUpdates) {
        batch.set(drawingsBlobRef, { data: drawingsBlobData }, { merge: true });
      }

      try {
        await batch.commit();`;

const newPaste = `      const batch = writeBatch(db);
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

        const isDraw = newEl.type === 'drawing';
        const blobId = getBlobRefId(isDraw, newId);
        if (!blobUpdates[blobId]) blobUpdates[blobId] = {};
        
        const { id, ...data } = newEl;
        if (isDraw) {
          blobUpdates[blobId][newId] = { ...data, points: simplifyPoints(data.points, 1.2) };
        } else {
          blobUpdates[blobId][newId] = data;
        }

        newPasteIds.push(newId);
        pastedElements.push(newEl);
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });
      }

      Object.keys(blobUpdates).forEach(blobId => {
        const ref = doc(db, "whiteboards", boardId, "elements", blobId);
        batch.set(ref, { data: blobUpdates[blobId] }, { merge: true });
      });

      try {
        await batch.commit();`;

code = code.replace(oldPaste, newPaste);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
