const fs = require('fs');

const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /<label className="text-\[10px\] font-extrabold text-blue-500 uppercase tracking-wider flex items-center justify-between mb-1">\s*<span>Equation <span className="text-blue-400 font-normal lowercase">\(y\{index \+ 2\}\)<\/span><\/span>/g,
  '<label className="text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-between mb-1" style={{ color: eq.color }}>\n                  <span>Equation <span className="font-normal lowercase">(y{index + 2})</span></span>'
);

content = content.replace(
  /<span className="absolute left-2.5 top-1\/2 -translate-y-1\/2 text-blue-400 font-mono text-xs">y =<\/span>\s*<input/g,
  '<span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs" style={{ color: eq.color }}>y =</span>\n                  <input'
);

content = content.replace(
  /className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-blue-200\/50 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white text-blue-700"/g,
  'className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:bg-white"\n                    style={{ color: eq.color, borderColor: `${eq.color}40`, outlineColor: eq.color }}'
);

fs.writeFileSync(file, content);
