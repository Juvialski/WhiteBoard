const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const startIndex = code.indexOf(`    } else {
      setSyncStatus('saving-cloud');
      
      const currentList = [...elementsRef.current];`);

console.log("Start index:", startIndex);

if (startIndex !== -1) {
  const endString = `showSyncToast("Paste failed: " + err.message, "error", 10000);
      }
    }`;
  const endIndex = code.indexOf(endString, startIndex);
  console.log("End index:", endIndex);
  
  if (endIndex !== -1) {
    const toReplace = code.substring(startIndex, endIndex + endString.length);
    
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
    
    code = code.replace(toReplace, correctSaveElementLocallyAndSyncElse);
    fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
    console.log("Replaced successfully.");
  }
}
