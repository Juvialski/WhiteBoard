const fs = require('fs');
const file = 'src/components/WhiteboardCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /if \(!target \|\| target\.type === "drawing"\) return;/g,
  'if (!target) return;'
);

content = content.replace(
  /const positions: Record<string, \{ x: number; y: number \}> = \{\};\s*elements\.forEach\(\(el\) => \{\s*if \(updatedSelectedIds\.includes\(el\.id\)\) \{\s*if \(el\.type !== "drawing"\) \{\s*const boundedEl = el as any;\s*positions\[el\.id\] = \{ x: boundedEl\.x, y: boundedEl\.y \};\s*\}\s*\}\s*\}\);/g,
  `const positions: Record<string, any> = {};
      elements.forEach((el) => {
        if (updatedSelectedIds.includes(el.id)) {
          if (el.type !== "drawing") {
            const boundedEl = el as any;
            positions[el.id] = { x: boundedEl.x, y: boundedEl.y };
          } else {
            positions[el.id] = { points: [...el.points] };
          }
        }
      });`
);

content = content.replace(
  /setElements\(\(prev\) =>\s*prev\.map\(\(el\) => \{\s*if \(selectedIds\.includes\(el\.id\) && el\.type !== "drawing"\) \{\s*const startPos = elementStartPositions\[el\.id\];\s*if \(startPos\) \{\s*return \{\s*\.\.\.el,\s*x: startPos\.x \+ dx,\s*y: startPos\.y \+ dy,\s*\};\s*\}\s*\}\s*return el;\s*\}\),\s*\);/g,
  `setElements((prev) =>
        prev.map((el) => {
          if (selectedIds.includes(el.id)) {
            const startPos = elementStartPositions[el.id];
            if (startPos) {
              if (el.type !== "drawing") {
                return {
                  ...el,
                  x: startPos.x + dx,
                  y: startPos.y + dy,
                };
              } else {
                return {
                  ...el,
                  points: startPos.points.map((p: any) => ({
                    x: p.x + dx,
                    y: p.y + dy,
                  })),
                };
              }
            }
          }
          return el;
        }),
      );`
);

content = content.replace(
  /const movedElements = elements\.filter\(\s*\(el\) => selectedIds\.includes\(el\.id\) && el\.type !== "drawing",\s*\);\s*await Promise\.all\(\s*movedElements\.map\(async \(el\) => \{\s*const startPos = elementStartPositions\[el\.id\];\s*const boundedEl = el as any;\s*if \(startPos\) \{\s*const hasMoved =\s*boundedEl\.x !== startPos\.x \|\| boundedEl\.y !== startPos\.y;\s*if \(hasMoved\) \{\s*pushToUndo\(\{\s*type: "update",\s*elementId: el\.id,\s*beforeData: \{\s*x: startPos\.x,\s*y: startPos\.y,\s*\},\s*afterData: \{\s*x: boundedEl\.x,\s*y: boundedEl\.y,\s*\},\s*\}\);\s*try \{\s*await setDoc\(\s*doc\(db, "whiteboards", boardId, "elements", el\.id\),\s*\{\s*x: boundedEl\.x,\s*y: boundedEl\.y,\s*\},\s*\{ merge: true \},\s*\);\s*\} catch \(err\) \{\s*console\.error\("Error updating moved element coordinates:", err\);\s*\}\s*\}\s*\}\s*\}\),\s*\);/g,
  `const movedElements = elements.filter(
        (el) => selectedIds.includes(el.id),
      );

      await Promise.all(
        movedElements.map(async (el) => {
          const startPos = elementStartPositions[el.id];
          if (startPos) {
            if (el.type !== "drawing") {
              const boundedEl = el as any;
              const hasMoved =
                boundedEl.x !== startPos.x || boundedEl.y !== startPos.y;
              if (hasMoved) {
                pushToUndo({
                  type: "update",
                  elementId: el.id,
                  beforeData: {
                    x: startPos.x,
                    y: startPos.y,
                  },
                  afterData: {
                    x: boundedEl.x,
                    y: boundedEl.y,
                  },
                });
                try {
                  await setDoc(
                    doc(db, "whiteboards", boardId, "elements", el.id),
                    {
                      x: boundedEl.x,
                      y: boundedEl.y,
                    },
                    { merge: true },
                  );
                } catch (err) {
                  console.error("Error updating moved element coordinates:", err);
                }
              }
            } else {
              const drawingEl = el as any;
              const hasMoved =
                drawingEl.points.length > 0 &&
                drawingEl.points[0].x !== startPos.points[0].x;
              if (hasMoved) {
                pushToUndo({
                  type: "update",
                  elementId: el.id,
                  beforeData: {
                    points: startPos.points,
                  },
                  afterData: {
                    points: drawingEl.points,
                  },
                });
                try {
                  await setDoc(
                    doc(db, "whiteboards", boardId, "elements", el.id),
                    {
                      points: drawingEl.points,
                    },
                    { merge: true },
                  );
                } catch (err) {
                  console.error("Error updating moved drawing coordinates:", err);
                }
              }
            }
          }
        }),
      );`
);

fs.writeFileSync(file, content);
