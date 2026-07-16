const fs = require('fs');
const file = 'src/components/WhiteboardCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<svg\s*width="100%"\s*height="100%"\s*className="absolute inset-0 overflow-visible pointer-events-none z-20"\s*>\s*\{\/\* Render saved drawings \*\/\}\s*\{elements\s*\.filter\(\(el\) => el\.type === "drawing"\)\s*\.map\(\(el: any\) => \{\s*const pts = el\.points\s*\.map\(\(p: any\) => \`\$\{p\.x\},\$\{p\.y\}\`\)\s*\.join\(" "\);\s*return \(\s*<polyline\s*key=\{el\.id\}\s*points=\{pts\}\s*fill="none"\s*stroke=\{el\.color\}\s*strokeWidth=\{el\.width\}\s*strokeLinecap="round"\s*strokeLinejoin="round"\s*className=\{\s*el\.isHighlighter\s*\? "mix-blend-multiply"\s*: "drop-shadow-sm"\s*\}\s*\/>\s*\);\s*\}\)\}/;

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
                const isSelected = selectedIds.includes(el.id);
                const isInteractive =
                  activeTool === "select" || activeTool === "eraser";
                return (
                  <g
                    key={el.id}
                    className={
                      isInteractive
                        ? "pointer-events-auto cursor-pointer"
                        : "pointer-events-none"
                    }
                    onMouseDown={(e) => handleSelectElement(el.id, e)}
                  >
                    {/* Invisible thicker hit area for easier clicking */}
                    <polyline
                      points={pts}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={el.width + 16}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <polyline
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
                      style={
                        isSelected
                          ? { filter: "drop-shadow(0 0 4px #3b82f6)" }
                          : {}
                      }
                    />
                  </g>
                );
              })}`;

content = content.replace(regex, replacement);

fs.writeFileSync(file, content);
