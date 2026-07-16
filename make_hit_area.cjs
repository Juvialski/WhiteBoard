const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<path\s*key=\{\`adv-eq-\$\{index\}\`\}\s*d=\{equationPath\}\s*fill="none"\s*stroke=\{color\}\s*strokeWidth=\{4\}\s*\/\/ Slightly thicker to click easily\s*style=\{\{\s*cursor:\s*graphInteractionMode === "erase" \? "crosshair" : "default",\s*\}\}\s*onMouseDown=\{\(e\) => \{([\s\S]*?)\}\}\s*strokeLinecap="round"\s*strokeLinejoin="round"\s*className="drop-shadow-sm transition-all"\s*\/>/g,
  `<g key={\`adv-eq-\${index}\`}>
                <path
                  d={equationPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={20}
                  style={{
                    cursor: graphInteractionMode === "erase" ? "crosshair" : "default",
                  }}
                  onMouseDown={(e) => {$1}}
                />
                <path
                  d={equationPath}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="pointer-events-none drop-shadow-sm transition-all"
                />
              </g>`
);

fs.writeFileSync(file, content);
