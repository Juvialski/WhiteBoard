const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add state
content = content.replace(
  /const \[draggingPointIdx, setDraggingPointIdx\] = useState<number \| null>\(null\);/,
  `const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);
  const [draggingLineIdx, setDraggingLineIdx] = useState<{ idx: number; startX: number; startY: number; initialLine: { x1: number; y1: number; x2: number; y2: number } } | null>(null);
  const [tempLinesList, setTempLinesList] = useState(element.plottedLines || []);
  
  useEffect(() => {
    setTempLinesList(element.plottedLines || []);
  }, [element.plottedLines]);`
);

// Update onMouseMove
content = content.replace(
  /if \(draggingPointIdx !== null\) \{[\s\S]*?setTempPointsList\(newPoints\);\s*\}/,
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
              }`
);

// Update onMouseLeave
content = content.replace(
  /setDraggingPointIdx\(null\);/,
  `setDraggingPointIdx(null);
              setDraggingLineIdx(null);`
);

// Update onMouseUp
content = content.replace(
  /if \(draggingPointIdx !== null\) \{[\s\S]*?setDraggingPointIdx\(null\);\s*\}/,
  `if (draggingPointIdx !== null) {
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
              }`
);

// Update line rendering
content = content.replace(
  /\{\(element\.plottedLines \|\| \[\]\)\.map\(\(line, idx\) => \{[\s\S]*?return \([\s\S]*?<line[\s\S]*?\/>\s*\);\s*\}\)\}/,
  `{tempLinesList.map((line, idx) => {
              const x1Pos = cx + line.x1 * scaleX;
              const y1Pos = cy - line.y1 * scaleY;
              const x2Pos = cx + line.x2 * scaleX;
              const y2Pos = cy - line.y2 * scaleY;
              return (
                <line
                  key={\`adv-line-\${line.id}\`}
                  x1={x1Pos}
                  y1={y1Pos}
                  x2={x2Pos}
                  y2={y2Pos}
                  stroke="#10b981"
                  strokeWidth={4} // Thicker to make it easier to grab
                  style={{
                    cursor: graphInteractionMode === "erase" 
                      ? "crosshair" 
                      : (graphInteractionMode === "none" || graphInteractionMode === "move") 
                        ? draggingLineIdx?.idx === idx ? "grabbing" : "grab" 
                        : "crosshair",
                  }}
                  onMouseDown={(e) => {
                    if (graphInteractionMode === "erase") {
                      e.stopPropagation();
                      const newLines = tempLinesList.filter((_, i) => i !== idx);
                      setTempLinesList(newLines);
                      onUpdate({ plottedLines: newLines });
                      return;
                    }
                    if (graphInteractionMode === "point" || graphInteractionMode === "line") return;
                    e.stopPropagation();
                    const rect = e.currentTarget.closest("svg")!.getBoundingClientRect();
                    const plotX = ((e.clientX - rect.left) * (w / rect.width) - cx) / scaleX;
                    const plotY = (cy - (e.clientY - rect.top) * (h / rect.height)) / scaleY;
                    setDraggingLineIdx({
                      idx,
                      startX: plotX,
                      startY: plotY,
                      initialLine: { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 }
                    });
                  }}
                />
              );
            })}`
);

fs.writeFileSync(file, content);
