const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /      if \(\(e\.ctrlKey \|\| e\.metaKey\) && key === "v"\) \{\n        if \(clipboardElements\.length > 0\) \{\n          if \(\!canWrite\) \{/;

const replacement = `      if ((e.ctrlKey || e.metaKey) && key === "v") {
        if (clipboardElements.length > 0) {
          e.preventDefault();
          if (!canWrite) {`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
