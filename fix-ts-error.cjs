const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /blobUpdates\[blobId\]\[newId\] = \{ \.\.\.data, points: simplifyPoints\(data\.points, 1\.2\) \};/;
const replacement = 'blobUpdates[blobId][newId] = { ...data, points: simplifyPoints((data as any).points, 1.2) };';

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
