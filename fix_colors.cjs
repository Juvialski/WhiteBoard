const fs = require('fs');

const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacement = `
                const EQUATION_COLORS = [
                  '#ef4444', // red
                  '#f59e0b', // amber
                  '#10b981', // emerald
                  '#3b82f6', // blue
                  '#8b5cf6', // violet
                  '#ec4899', // pink
                  '#14b8a6', // teal
                  '#f97316', // orange
                ];
                const usedColors = new Set(equationsArray.map(eq => eq.color).concat(['#6366f1']));
                let nextColor = EQUATION_COLORS.find(c => !usedColors.has(c)) || EQUATION_COLORS[equationsArray.length % EQUATION_COLORS.length];
                
                const newEqs = [...equationsArray, { id: Math.random().toString(), expr: '', color: nextColor }];
                setEquationsArray(newEqs);
                onUpdate({ equations: newEqs });
`;

content = content.replace(
  `                const newEqs = [...equationsArray, { id: Math.random().toString(), expr: '', color: '#3b82f6' }];
                setEquationsArray(newEqs);
                onUpdate({ equations: newEqs });`,
  replacement
);

fs.writeFileSync(file, content);
