const fs = require('fs');
const file = 'src/components/WhiteboardCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const \[elementStartPositions, setElementStartPositions\] = useState<Record<string, \{ x: number; y: number \}>>\(\{\}\);/,
  'const [elementStartPositions, setElementStartPositions] = useState<Record<string, any>>({});'
);

fs.writeFileSync(file, content);
