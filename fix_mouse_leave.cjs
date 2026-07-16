const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /onMouseLeave=\{\(\) => \{\s*setHoveredCoord\(null\);\s*setDraggingPointIdx\(null\);\s*setDraggingLineIdx\(null\);\s*\}\}/g,
  `onMouseLeave={() => {
              setHoveredCoord(null);
              if (draggingPointIdx !== null) {
                const ptsStr = tempPointsList
                  .map((p) => \`(\${p.x.toFixed(2)},\${p.y.toFixed(2)})\`)
                  .join(", ");
                setPointsInput(ptsStr);
                onUpdate({ plottedPoints: ptsStr });
                setDraggingPointIdx(null);
              }
              if (draggingLineIdx !== null) {
                onUpdate({ plottedLines: tempLinesList });
                setDraggingLineIdx(null);
              }
            }}`
);

fs.writeFileSync(file, content);
