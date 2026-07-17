const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /for \(let i = 0; i < clipboardElements\.length; i\+\+\) {[\s\S]*?batch\.set\(elementRef, data\);\n        newPasteIds\.push\(newId\);\n        pastedElements\.push\(newEl\);\n          \n        pushToUndo\(\{ type: "add", elementId: newId, afterData: newEl \}\);\n      }/m;

const replacement = `const elementsBlobRef = doc(db, "whiteboards", boardId, "elements", "elements_blob");
      const blobData: Record<string, any> = {};

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
        blobData[newId] = data;
        
        newPasteIds.push(newId);
        pastedElements.push(newEl);
          
        pushToUndo({ type: "add", elementId: newId, afterData: newEl });
      }

      batch.set(elementsBlobRef, { data: blobData }, { merge: true });`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
