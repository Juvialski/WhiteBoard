const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /try {\n        const batch = writeBatch\(db\);\n        elementsToDelete\.forEach\(\(el\) => {\n          const docRef = doc\(db, "whiteboards", boardId, "elements", el\.id\);\n          batch\.delete\(docRef\);\n        }\);\n        await batch\.commit\(\);/m;

const replacement = `try {
        const batch = writeBatch(db);
        const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
        const drawingsBlobRef = doc(db, "whiteboards", boardId, "elements", "drawings_blob");
        
        batch.delete(elementsBlobRef);
        batch.delete(drawingsBlobRef);

        elementsToDelete.forEach((el) => {
          const docRef = doc(db, "whiteboards", boardId, "elements", el.id);
          batch.delete(docRef);
        });

        await batch.commit();`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
