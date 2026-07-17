const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /const batch = writeBatch\(db\);\n\s*const elementsBlobRef = doc\(db, "whiteboards", boardId, "elements", "elements_blob"\);\n\s*const blobData: Record<string, any> = {};\n\s*let hasBlobUpdates = false;\n\n\s*keys\.forEach\(\(id\) => {\n\s*const item = queue\[id\];\n\s*\n\s*\/\/ Clean up old individual docs to save reads over time!\n\s*const oldDocRef = doc\(db, "whiteboards", boardId, "elements", id\);\n\s*batch\.delete\(oldDocRef\);\n\n\s*if \(item\.action === 'delete'\) {\n\s*blobData\[id\] = deleteField\(\);\n\s*} else {\n\s*const { id: _, \.\.\.data } = item\.data;\n\s*blobData\[id\] = data;\n\s*}\n\s*hasBlobUpdates = true;\n\s*}\);\n\n\s*if \(hasBlobUpdates\) {\n\s*batch\.set\(elementsBlobRef, { data: blobData }, { merge: true }\);\n\s*}/m;

const replacement = `const batch = writeBatch(db);
      const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
      const drawingsBlobRef = doc(db, "whiteboards", boardId, "elements", "drawings_blob");
      
      const elementsBlobData: Record<string, any> = {};
      const drawingsBlobData: Record<string, any> = {};
      
      let hasElementUpdates = false;
      let hasDrawingUpdates = false;

      keys.forEach((id) => {
        const item = queue[id];
        const isDraw = item.data?.type === 'drawing' || id.startsWith('draw-');
        
        // Clean up old individual docs to save reads over time!
        const oldDocRef = doc(db, "whiteboards", boardId, "elements", id);
        batch.delete(oldDocRef);

        if (item.action === 'delete') {
          if (isDraw) drawingsBlobData[id] = deleteField();
          else elementsBlobData[id] = deleteField();
        } else {
          const { id: _, ...data } = item.data;
          if (isDraw) drawingsBlobData[id] = data;
          else elementsBlobData[id] = data;
        }
        
        if (isDraw) hasDrawingUpdates = true;
        else hasElementUpdates = true;
      });

      if (hasElementUpdates) {
        batch.set(elementsBlobRef, { data: elementsBlobData }, { merge: true });
      }
      if (hasDrawingUpdates) {
        batch.set(drawingsBlobRef, { data: drawingsBlobData }, { merge: true });
      }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
