const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /if \(isSolo\) {[\s\S]*?\} else {[\s\S]*?setSyncStatus\('saving-cloud'\);\n\s*try {\n\s*const docRef = doc\(db, "whiteboards", boardId, "elements", elementId\);\n\s*if \(actionType === 'delete'\) {\n\s*await deleteDoc\(docRef\);\n\s*} else {\n\s*await setDoc\(docRef, processedData, \{ merge: isMerge \}\);\n\s*}\n\s*setSyncStatus\('synced'\);\n\s*incrementStats\('write', 1\);\n\s*} catch \(err\) {[\s\S]*?}/m;

const replacement = `if (isSolo) {
      hasUnsavedChanges.current = true;
      setSyncStatus('saved-local');

      if (actionType === 'delete') {
        pendingSyncElements.current[elementId] = { data: null, action: 'delete' };
      } else {
        const currentFullEl = updatedElements.find(el => el.id === elementId);
        if (currentFullEl) {
          pendingSyncElements.current[elementId] = { data: currentFullEl, action: 'set' };
        }
      }

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        flushPendingChanges();
      }, 3000);
    } else {
      setSyncStatus('saving-cloud');
      try {
        const isDrawingEl = isDrawing;
        const blobRefId = isDrawingEl ? "drawings_blob" : "elements_blob";
        const blobRef = doc(db, "whiteboards", boardId, "elements", blobRefId);
        
        // Always delete any stray individual documents just in case to keep things clean!
        const docRef = doc(db, "whiteboards", boardId, "elements", elementId);
        deleteDoc(docRef).catch(e => {});

        if (actionType === 'delete') {
          // Use dynamic import for deleteField or just assume it's available
          await setDoc(blobRef, { data: { [elementId]: deleteField() } }, { merge: true });
        } else {
          await setDoc(blobRef, { data: { [elementId]: processedData } }, { merge: true });
        }
        setSyncStatus('synced');
        incrementStats('write', 1);
      } catch (err) {
        console.error("Direct sync error:", err);
        setSyncStatus('offline');
      }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
