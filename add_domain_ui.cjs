const fs = require('fs');
const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

// For the primary equation
content = content.replace(
  /className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-indigo-200\/50 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-indigo-700"\n              \/>\n            <\/div>/g,
  `className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border border-indigo-200/50 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white text-indigo-700"
              />
            </div>
            <div className="flex space-x-2 mt-1">
              <div className="flex-1 flex items-center space-x-1">
                <span className="text-[10px] text-slate-400">Min x:</span>
                <input
                  type="text"
                  value={element.equationMin || ''}
                  onChange={(e) => onUpdate({ equationMin: e.target.value })}
                  placeholder="-∞"
                  className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex-1 flex items-center space-x-1">
                <span className="text-[10px] text-slate-400">Max x:</span>
                <input
                  type="text"
                  value={element.equationMax || ''}
                  onChange={(e) => onUpdate({ equationMax: e.target.value })}
                  placeholder="∞"
                  className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>`
);

// For equationsArray
content = content.replace(
  /className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:bg-white"\n                    style=\{\{([\s\S]*?)\}\}\n                  \/>\n                <\/div>\n              <\/div>/g,
  `className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:bg-white"
                    style={{$1}}
                  />
                </div>
                <div className="flex space-x-2 mt-1">
                  <div className="flex-1 flex items-center space-x-1">
                    <span className="text-[10px] text-slate-400">Min x:</span>
                    <input
                      type="text"
                      value={eq.min || ''}
                      onChange={(e) => {
                        const newEqs = [...equationsArray];
                        newEqs[index].min = e.target.value;
                        setEquationsArray(newEqs);
                        onUpdate({ equations: newEqs });
                      }}
                      placeholder="-∞"
                      className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1 flex items-center space-x-1">
                    <span className="text-[10px] text-slate-400">Max x:</span>
                    <input
                      type="text"
                      value={eq.max || ''}
                      onChange={(e) => {
                        const newEqs = [...equationsArray];
                        newEqs[index].max = e.target.value;
                        setEquationsArray(newEqs);
                        onUpdate({ equations: newEqs });
                      }}
                      placeholder="∞"
                      className="w-full px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>`
);

fs.writeFileSync(file, content);
