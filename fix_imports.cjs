const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

code = code.replace(
  /import {\n  collection,\n  query,\n  onSnapshot,\n  setDoc,\n  deleteDoc,\n  doc,\n  writeBatch,\n  increment,\n  updateDoc,\n} from "firebase\/firestore";/m,
  `import {
  collection,
  query,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
  increment,
  updateDoc,
  deleteField,
} from "firebase/firestore";`
);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
