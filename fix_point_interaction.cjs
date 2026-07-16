const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /onMouseDown=\{\(e\) => \{\s*if \(\s*graphInteractionMode === "point" \|\|\s*graphInteractionMode === "line"\s*\)\s*return;\s*e\.stopPropagation\(\);\s*setDraggingPointIdx\(idx\);\s*\}\}\s*style=\{\{\s*cursor:\s*graphInteractionMode !== "none"\s*\?\s*"crosshair"\s*:\s*draggingPointIdx === idx\s*\?\s*"grabbing"\s*:\s*"grab",\s*\}\}/g,
  `onMouseDown={(e) => {
                      if (graphInteractionMode === "erase") {
                        e.stopPropagation();
                        const newPoints = tempPointsList.filter((_, i) => i !== idx);
                        setTempPointsList(newPoints);
                        const ptsStr = newPoints.map((p) => \`(\${p.x.toFixed(2)},\${p.y.toFixed(2)})\`).join(", ");
                        setPointsInput(ptsStr);
                        onUpdate({ plottedPoints: ptsStr });
                        return;
                      }
                      if (graphInteractionMode === "point" || graphInteractionMode === "line") return;
                      e.stopPropagation();
                      setDraggingPointIdx(idx);
                    }}
                    style={{
                      cursor:
                        graphInteractionMode === "erase"
                          ? "crosshair" // Or pointer, but crosshair feels like targeting
                          : (graphInteractionMode === "none" || graphInteractionMode === "move")
                            ? draggingPointIdx === idx
                              ? "grabbing"
                              : "grab"
                            : "crosshair",
                    }}`
);

fs.writeFileSync(file, content);
