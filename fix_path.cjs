const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<path\s*key=\{\`adv-eq-\$\{index\}\`\}\s*d=\{equationPath\}\s*fill="none"\s*stroke=\{color\}\s*strokeWidth=\{3\}\s*strokeLinecap="round"\s*strokeLinejoin="round"\s*className="drop-shadow-sm transition-all"\s*\/>/g,
  `<path
                key={\`adv-eq-\${index}\`}
                d={equationPath}
                fill="none"
                stroke={color}
                strokeWidth={4} // Slightly thicker to click easily
                style={{
                  cursor: graphInteractionMode === "erase" ? "crosshair" : "default"
                }}
                onMouseDown={(e) => {
                  if (graphInteractionMode === "erase") {
                    e.stopPropagation();
                    if (index === 0) {
                      setEquationInput("");
                      onUpdate({ equation: "", equationMin: "", equationMax: "" });
                    } else {
                      const newEqs = equationsArray.filter((_, i) => i !== index - 1);
                      setEquationsArray(newEqs);
                      onUpdate({ equations: newEqs });
                    }
                  }
                }}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm transition-all"
              />`
);

fs.writeFileSync(file, content);
