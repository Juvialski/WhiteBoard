const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<div className="flex space-x-1">\s*<button\s*onClick=\{\(\) =>\s*setGraphInteractionMode\(\s*graphInteractionMode === "point"\s*\?\s*"none"\s*:\s*"point",\s*\)\s*\}([\s\S]*?)<\/div>\s*<\/div>\s*\{\/\* Plotted Points Input \*\/\}/g,
  `<div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setGraphInteractionMode(graphInteractionMode === "move" ? "none" : "move")}
                className={\`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border \${
                  graphInteractionMode === "move"
                    ? "bg-blue-100 text-blue-700 border-blue-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }\`}
              >
                Move
              </button>
              <button
                onClick={() => setGraphInteractionMode(graphInteractionMode === "erase" ? "none" : "erase")}
                className={\`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border \${
                  graphInteractionMode === "erase"
                    ? "bg-red-100 text-red-700 border-red-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }\`}
              >
                Erase
              </button>
              <button
                onClick={() => setGraphInteractionMode(graphInteractionMode === "point" ? "none" : "point")}
                className={\`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border \${
                  graphInteractionMode === "point"
                    ? "bg-indigo-100 text-indigo-700 border-indigo-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }\`}
              >
                Plot Point
              </button>
              <button
                onClick={() => {
                  setGraphInteractionMode(graphInteractionMode === "line" ? "none" : "line");
                  setLineStartPoint(null);
                }}
                className={\`flex-1 text-[10px] py-1.5 rounded font-medium transition-colors border \${
                  graphInteractionMode === "line"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-300 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }\`}
              >
                {graphInteractionMode === "line" && lineStartPoint
                  ? "Click end point..."
                  : "Plot Line"}
              </button>
            </div>
          </div>
          {/* Plotted Points Input */}`
);

fs.writeFileSync(file, content);
