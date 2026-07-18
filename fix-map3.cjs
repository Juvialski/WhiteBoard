const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

code = code.replace(/hasStrays = true;\s*straysToDelete\.push\(id\);/g, 
`hasStrays = true;
            if (/^[a-zA-Z0-9_\\-]+$/.test(id)) {
              straysToDelete.push(id);
            } else {
              console.warn("Skipping invalid stray ID:", id);
            }`);

fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
