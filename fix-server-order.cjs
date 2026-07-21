const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// First remove it from the bottom
code = code.replace(/\/\/ Set up body parser with large limit for pasting images \/ elements\napp\.use\(express\.json\(\{ limit: "50mb" \}\)\);\napp\.use\(express\.urlencoded\(\{ extended: true, limit: "50mb" \}\)\);\n/, '');

// Then add it to the top before the log API
const endpointsToAdd = `
// Set up body parser with large limit for pasting images / elements
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Log API (client can send logs here)
app.post("/api/log", (req, res) => {`;

code = code.replace(/\/\/ Log API \(client can send logs here\)\napp\.post\("\/api\/log", \(req, res\) => \{/, endpointsToAdd);

fs.writeFileSync('server.ts', code);
