const fs = require('fs');
const file = 'src/components/WhiteboardCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<svg\s*width="100%"\s*height="100%"\s*className="absolute inset-0 overflow-visible pointer-events-none z-20"\s*><\/svg>/;

const replacement = `<svg
            width="100%"
            height="100%"
            className="absolute inset-0 overflow-visible pointer-events-none z-20"
          >
            {/* Render saved drawings */}
            {elements
              .filter((el) => el.type === "drawing")
              .map((el: any) => {
                const pts = el.points
                  .map((p: any) => \`\${p.x},\${p.y}\`)
                  .join(" ");
                return (
                  <polyline
                    key={el.id}
                    points={pts}
                    fill="none"
                    stroke={el.color}
                    strokeWidth={el.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={
                      el.isHighlighter
                        ? "mix-blend-multiply"
                        : "drop-shadow-sm"
                    }
                  />
                );
              })}
            {/* Render current local drawing */}
            {localDrawingPoints.length > 0 && (
              <polyline
                points={localDrawingPoints
                  .map((p) => \`\${p.x},\${p.y}\`)
                  .join(" ")}
                fill="none"
                stroke={
                  activeTool === "highlighter"
                    ? \`\${activeColor}80\`
                    : activeColor
                }
                strokeWidth={
                  activeTool === "highlighter"
                    ? strokeWidth * 2.5
                    : strokeWidth
                }
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  activeTool === "highlighter"
                    ? "mix-blend-multiply"
                    : "drop-shadow-sm"
                }
              />
            )}
          </svg>`;

content = content.replace(regex, replacement);

fs.writeFileSync(file, content);
