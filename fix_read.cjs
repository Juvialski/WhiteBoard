const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex1 = /snapshot\.forEach\(\(docSnap\) => \{\n\s*const id = docSnap\.id;\n\s*const data = docSnap\.data\(\);\n\s*if \(id === "drawings_blob"\) \{\n\s*if \(data && Array\.isArray\(data\.drawings\)\) \{\n\s*loaded\.push\(\.\.\.data\.drawings\);\n\s*\}\n\s*\} else \{\n\s*loaded\.push\(\{ id, \.\.\.data \} as BoardElement\);\n\s*\}\n\s*\}\);/g;

const replacement1 = `snapshot.forEach((docSnap) => {
        const id = docSnap.id;
        const docData = docSnap.data();
        if (id === "elements_blob" || id === "drawings_blob") {
          if (docData && docData.data) {
            Object.keys(docData.data).forEach(elId => {
              loaded.push({ id: elId, ...docData.data[elId] } as BoardElement);
            });
          }
        } else {
          loaded.push({ id, ...docData } as BoardElement);
        }
      });`;

code = code.replace(regex1, replacement1);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
