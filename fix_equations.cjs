const fs = require('fs');

const file = 'src/components/ShapeComponent.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const equations = \[\s*\{\s*expr: element\.equation \|\| "",\s*color: "#6366f1",\s*label: "y1"\s*\},[\s\S]*?\];/g,
  `const equations = [
          { expr: element.equation || "", color: "#6366f1", label: "y1", min: element.equationMin, max: element.equationMax },
          ...(element.equations || []).map((eq, i) => ({
            expr: eq.expr,
            color: eq.color,
            label: \`y\${i + 2}\`,
            min: eq.min,
            max: eq.max
          })),
        ];`
);

content = content.replace(
  /equations\.forEach\(\(\{ expr, color, label \}, index\) => \{/g,
  `equations.forEach(({ expr, color, label, min, max }, index) => {
          const numMin = min && !isNaN(parseFloat(min)) ? parseFloat(min) : undefined;
          const numMax = max && !isNaN(parseFloat(max)) ? parseFloat(max) : undefined;`
);

content = content.replace(
  /const xVal = \(px - cx\) \/ scaleX;/g,
  `const xVal = (px - cx) / scaleX;
              if (numMin !== undefined && xVal < numMin) { first = true; continue; }
              if (numMax !== undefined && xVal > numMax) { first = true; continue; }`
);

fs.writeFileSync(file, content);
