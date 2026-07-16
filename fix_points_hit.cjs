const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<g\s*key=\{\`adv-pt-\$\{idx\}\`\}\s*onMouseDown=\{\(e\) => \{([\s\S]*?)\}\}\s*style=\{\{([\s\S]*?)\}\}\s*>\s*<circle\s*cx=\{xPos\}\s*cy=\{yPos\}\s*r=\{6\}\s*fill="#ec4899"\s*stroke="#ffffff"\s*strokeWidth=\{2\}\s*\/>/g;

content = content.replace(regex, `<g key={\`adv-pt-\${idx}\`}>
                    <circle
                      cx={xPos}
                      cy={yPos}
                      r={20}
                      fill="transparent"
                      style={{$2}}
                      onMouseDown={(e) => {$1}}
                    />
                    <circle
                      cx={xPos}
                      cy={yPos}
                      r={6}
                      fill="#ec4899"
                      stroke="#ffffff"
                      strokeWidth={2}
                      className="pointer-events-none drop-shadow-sm"
                    />`);

fs.writeFileSync(file, content);
