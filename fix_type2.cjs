const fs = require('fs');
const file = 'src/components/WhiteboardCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /useState<\s*Record<string, \{ x: number; y: number \}>\s*>/,
  'useState<Record<string, any>>'
);

fs.writeFileSync(file, content);
