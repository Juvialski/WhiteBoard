import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import fsUtils from "fs";

dotenv.config();

// Simple file logger
const logFile = path.join(process.cwd(), 'app-events.log');
function logToFile(level: string, message: string, data: any = null) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (data) {
    try {
      logLine += ' ' + (typeof data === 'object' ? JSON.stringify(data) : String(data));
    } catch (e) {
      logLine += ' [unserializable data]';
    }
  }
  logLine += '\n';
  
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

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const rooms = new Map<string, Set<WebSocket>>();




// Set up body parser with large limit for pasting images / elements
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Log API (client can send logs here)
app.post("/api/log", (req, res) => {
  if (!req.body) {
    return res.json({ success: false, error: "No body" });
  }
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



// Vite middleware for development or Static assets for production
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Handle WebSocket Connection Upgrades on same port 3000
  server.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Handle room-based events
  wss.on("connection", (ws: WebSocket) => {
    let currentBoardId: string | null = null;
    let currentUserId: string | null = null;

    ws.on("message", (messageStr: string) => {
      try {
        const msg = JSON.parse(messageStr);
        if (msg.type === "join") {
          currentBoardId = msg.boardId;
          currentUserId = msg.userId;
          if (currentBoardId) {
            if (!rooms.has(currentBoardId)) {
              rooms.set(currentBoardId, new Set());
            }
            rooms.get(currentBoardId)!.add(ws);
          }
        } else if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", id: msg.id }));
        } else if (
          msg.type === "cursor" ||
          msg.type === "drawing_stream" ||
          msg.type === "drawing_stream_end" ||
          msg.type === "element_update" ||
          msg.type === "element_focus" ||
          msg.type === "laser_point" ||
          msg.type === "timer_sync" ||
          msg.type === "request_follow" ||
          msg.type === "stop_follow"
        ) {
          const boardId = msg.boardId || currentBoardId;
          if (boardId && rooms.has(boardId)) {
            const clients = rooms.get(boardId)!;
            const payload = JSON.stringify(msg);
            clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(payload);
              }
            });
          }
        }
      } catch (err) {
        console.error("WS message error:", err);
      }
    });

    ws.on("close", () => {
      if (currentBoardId && rooms.has(currentBoardId)) {
        const clients = rooms.get(currentBoardId)!;
        clients.delete(ws);
        if (clients.size === 0) {
          rooms.delete(currentBoardId);
        }
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
