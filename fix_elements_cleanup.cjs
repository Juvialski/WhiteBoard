const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /return \(\) => {\n      clearTimeout\(timeout\);\n      if \(unsubscribe\) unsubscribe\(\);\n    };/m;

const replacement = `return () => {
      clearTimeout(timeout);
      if (unsubscribe) unsubscribe();
      if (initialUnsubscribe) initialUnsubscribe();
    };`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
