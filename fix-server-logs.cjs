const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const importReplacement = `import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import fsUtils from "fs";

dotenv.config();

// Simple file logger
const logFile = path.join(process.cwd(), 'app-events.log');
function logToFile(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logLine = \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\`;
  if (data) {
    try {
      logLine += ' ' + (typeof data === 'object' ? JSON.stringify(data) : String(data));
    } catch (e) {
      logLine += ' [unserializable data]';
    }
  }
  logLine += '\\n';
  
  // Also log to console
  if (level === 'error') console.error(logLine.trim());
  else console.log(logLine.trim());

  try {
    fsUtils.appendFileSync(logFile, logLine);
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
}

const app = express();
`;

code = code.replace(/import express from "express";[\s\S]*?const app = express\(\);/, importReplacement);

const endpointsToAdd = `

// Log API (client can send logs here)
app.post("/api/log", (req, res) => {
  const { level, message, data } = req.body;
  logToFile(level || 'info', message || 'No message', data);
  res.json({ success: true });
});

// View logs API
app.get("/api/logs", (req, res) => {
  try {
    if (fsUtils.existsSync(logFile)) {
      const content = fsUtils.readFileSync(logFile, 'utf8');
      res.type('text/plain').send(content);
    } else {
      res.type('text/plain').send("No logs yet.");
    }
  } catch (e) {
    res.status(500).send("Error reading logs: " + e.message);
  }
});
`;

code = code.replace(/\/\/ Set up body parser with large limit for pasting images \/ elements/, endpointsToAdd + '\n// Set up body parser with large limit for pasting images / elements');

fs.writeFileSync('server.ts', code);
