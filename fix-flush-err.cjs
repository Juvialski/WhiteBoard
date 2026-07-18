const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

code = code.replace(/showSyncToast\("Sync failed\. Device is offline or permission was denied\.", "error"\);/, 
'showSyncToast("Sync failed: " + err.message, "error", 10000);');

fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
