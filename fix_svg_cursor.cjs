const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /cursor:\s*graphInteractionMode === "point"\s*\?\s*"crosshair"\s*:\s*graphInteractionMode === "line"\s*\?\s*"crosshair"\s*:\s*"default",/g,
  `cursor:
                ["point", "line", "erase"].includes(graphInteractionMode)
                  ? "crosshair"
                  : graphInteractionMode === "move"
                    ? "move"
                    : "default",`
);

fs.writeFileSync(file, content);
