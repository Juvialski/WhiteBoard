const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /if \(draggingPointIdx !== null\) \{\s*const ptsStr = tempPointsList\s*\.map\(\(p\) => \`\(\$\{p\.x\.toFixed\(2\)\},\$\{p\.y\.toFixed\(2\)\}\)\`\)\s*\.join\(", "\);\s*setPointsInput\(ptsStr\);\s*onUpdate\(\{ plottedPoints: ptsStr \}\);\s*setDraggingPointIdx\(null\);\s*\}\s*if \(draggingLineIdx !== null\) \{\s*onUpdate\(\{ plottedLines: tempLinesList \}\);\s*setDraggingLineIdx\(null\);\s*\}\s*\}\}\s*onClick=\{\(e\) => \{/g,
  `if (draggingPointIdx !== null) {
                const newPoints = [...tempPointsList];
                newPoints[draggingPointIdx] = { x: plotX, y: plotY };
                setTempPointsList(newPoints);
              }
              if (draggingLineIdx !== null) {
                const dx = plotX - draggingLineIdx.startX;
                const dy = plotY - draggingLineIdx.startY;
                const newLines = [...tempLinesList];
                newLines[draggingLineIdx.idx] = {
                  ...newLines[draggingLineIdx.idx],
                  x1: draggingLineIdx.initialLine.x1 + dx,
                  y1: draggingLineIdx.initialLine.y1 + dy,
                  x2: draggingLineIdx.initialLine.x2 + dx,
                  y2: draggingLineIdx.initialLine.y2 + dy,
                };
                setTempLinesList(newLines);
              }
            }}
            onMouseLeave={() => {
              setHoveredCoord(null);
              setDraggingPointIdx(null);
              setDraggingLineIdx(null);
            }}
            onMouseUp={() => {
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
            }}
            onClick={(e) => {`
);

fs.writeFileSync(file, content);
