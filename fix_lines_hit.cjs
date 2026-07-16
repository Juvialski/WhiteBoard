const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<line\s*key=\{\`adv-line-\$\{line\.id\}\`\}\s*x1=\{x1Pos\}\s*y1=\{y1Pos\}\s*x2=\{x2Pos\}\s*y2=\{y2Pos\}\s*stroke="#10b981"\s*strokeWidth=\{4\}\s*\/\/ Thicker to make it easier to grab\s*style=\{\{([\s\S]*?)\}\}\s*onMouseDown=\{\(e\) => \{([\s\S]*?)\}\}\s*\/>/g,
  `<g key={\`adv-line-\${line.id}\`}>
                  <line
                    x1={x1Pos}
                    y1={y1Pos}
                    x2={x2Pos}
                    y2={y2Pos}
                    stroke="transparent"
                    strokeWidth={20}
                    style={{$1}}
                    onMouseDown={(e) => {$2}}
                  />
                  <line
                    x1={x1Pos}
                    y1={y1Pos}
                    x2={x2Pos}
                    y2={y2Pos}
                    stroke="#10b981"
                    strokeWidth={3}
                    className="pointer-events-none drop-shadow-sm transition-all"
                  />
                </g>`
);

fs.writeFileSync(file, content);
