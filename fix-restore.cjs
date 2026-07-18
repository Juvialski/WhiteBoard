const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const botchedRegex = /    \} else \{\n      setSyncStatus\('saving-cloud'\);\n\n      const currentList = \[\.\.\.elementsRef\.current\];[\s\S]*?showSyncToast\("Paste failed: " \+ err\.message, "error", 10000\);\n      \}\n    \}/;

const correctSaveElementLocallyAndSyncElse = `    } else {
      setSyncStatus('saving-cloud');
      
      try {
        const isDraw = processedData && processedData.type === 'drawing';
        const blobId = getBlobRefId(isDraw, elementId);
        
        if (actionType === 'delete') {
          await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), {
            data: { [elementId]: deleteField() }
          }, { merge: true });
        } else {
          let payload = processedData;
          if (isDraw) {
             payload = { ...processedData, points: simplifyPoints(processedData.points, 1.2) };
          }
          await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), {
            data: { [elementId]: payload }
          }, { merge: true });
        }
        
        setSyncStatus('synced');
        incrementStats('write', 1);
      } catch (err) {
        console.error("Error saving element:", err);
        setSyncStatus('offline');
        showSyncToast("Sync failed: " + err.message, "error", 10000);
      }
    }`;

code = code.replace(botchedRegex, correctSaveElementLocallyAndSyncElse);

fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
