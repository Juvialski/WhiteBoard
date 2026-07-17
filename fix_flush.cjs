const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /const batch = writeBatch\(db\);\n      keys\.forEach\(\(id\) => {\n        const item = queue\[id\];\n        const docRef = doc\(db, "whiteboards", boardId, "elements", id\);\n        if \(item\.action === 'delete'\) {\n          batch\.delete\(docRef\);\n        } else {\n          const { id: _, \.\.\.data } = item\.data;\n          batch\.set\(docRef, data, { merge: true }\);\n        }\n      }\);\n      await batch\.commit\(\);/m;

const replacement = `const batch = writeBatch(db);
      const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
      const blobData: Record<string, any> = {};
      let hasBlobUpdates = false;

      keys.forEach((id) => {
        const item = queue[id];
        
        // Clean up old individual docs to save reads over time!
        const oldDocRef = doc(db, "whiteboards", boardId, "elements", id);
        batch.delete(oldDocRef);

        if (item.action === 'delete') {
          blobData[id] = deleteField();
        } else {
          const { id: _, ...data } = item.data;
          blobData[id] = data;
        }
        hasBlobUpdates = true;
      });

      if (hasBlobUpdates) {
        batch.set(elementsBlobRef, { data: blobData }, { merge: true });
      }

      await batch.commit();`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
