const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /if \(wsRef\.current && wsRef\.current\.readyState === WebSocket\.OPEN\) {\n        return;\n      }/m;

const replacement = `if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (initialUnsubscribe) initialUnsubscribe();
        return;
      }`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
