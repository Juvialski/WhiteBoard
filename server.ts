import express from "express";
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


// Helper to resolve AI client given a key
function createAiClient(apiKey: string): GoogleGenAI | null {
  if (!apiKey || !apiKey.trim()) return null;
  try {
    return new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build-userproxy",
        },
      },
    });
  } catch (e) {
    console.error("Error creating GoogleGenAI client:", e);
    return null;
  }
}

// Helper to determine the target Gemini model selected by user
function getRequestedModel(req: express.Request): string {
  const headerModel = req.headers["x-user-model"] as string;
  let rawModel = "";
  if (headerModel && headerModel.trim()) {
    rawModel = headerModel.trim();
  } else if (req.body && req.body.model && typeof req.body.model === "string" && req.body.model.trim()) {
    rawModel = req.body.model.trim();
  }
  return rawModel || "gemini-2.5-flash";
}

// Unified Gemini API execution helper with key fallback and exact requested model execution
async function safeGenerateContent(
  req: express.Request,
  generateParams: { systemInstruction?: string; contents: any; config?: any }
) {
  const userKey = (req.headers["x-user-api-key"] as string || "").trim();
  const envKey = (process.env.GEMINI_API_KEY || "").trim();
  const primaryModel = getRequestedModel(req);

  // List of keys to try: userKey first (if provided), then envKey
  const keysToTry: { key: string; isUser: boolean }[] = [];
  if (userKey) keysToTry.push({ key: userKey, isUser: true });
  if (envKey && envKey !== userKey) keysToTry.push({ key: envKey, isUser: false });

  if (keysToTry.length === 0) {
    throw new Error(
      "No valid Gemini API key found. Please enter your Google AI Studio API Key in the AI Assistant settings panel."
    );
  }

  // Models to try: exact requested model first, then fallback to gemini-2.5-flash if different
  const modelsToTry = [primaryModel];
  if (primaryModel !== "gemini-2.5-flash") {
    modelsToTry.push("gemini-2.5-flash");
  }

  let lastError: any = null;

  for (const { key, isUser } of keysToTry) {
    const aiClient = createAiClient(key);
    if (!aiClient) continue;

    for (const model of modelsToTry) {
      try {
        const response = await aiClient.models.generateContent({
          model,
          contents: generateParams.contents,
          config: generateParams.config,
        });
        return response; // Success!
      } catch (err: any) {
        lastError = err;
        const msg = err?.message || String(err);
        console.warn(`Gemini call failed (model=${model}, isUserKey=${isUser}): ${msg}`);
        
        // If it's an API key error for the user key, break out to try server envKey
        if (msg.includes("API key not valid") || msg.includes("API_KEY_INVALID") || msg.includes("400")) {
          if (isUser) {
            console.warn("User API key invalid or expired. Attempting server GEMINI_API_KEY fallback...");
            break; // Try next key
          }
        }
      }
    }
  }

  const errMsg = lastError?.message || String(lastError);
  if (errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID") || errMsg.includes("400")) {
    throw new Error(
      "The Google AI Studio API Key is invalid or expired. Please click 'Clear' or re-paste your valid key in the AI Assistant panel, or get a new free key at aistudio.google.com."
    );
  }

  throw lastError || new Error("Failed to execute Gemini API request.");
}

// API: Solve problems inside the whiteboard with illustrations
app.post("/api/ai/solve", async (req, res) => {
  const { elements, prompt } = req.body;

  try {
    // Build a clean text representation of the whiteboard elements to help the AI understand
    const elementsSummary = (elements || [])
      .map((el: any) => {
        if (el.type === "text") {
          return `- Text Box (ID: ${el.id}): "${el.text}" at position (${Math.round(el.x)}, ${Math.round(el.y)})`;
        } else if (el.type === "sticky") {
          return `- Sticky Note (ID: ${el.id}): "${el.text}" with color "${el.color}" at position (${Math.round(el.x)}, ${Math.round(el.y)})`;
        } else if (el.type === "shape") {
          return `- Shape (ID: ${el.id}, shapeType: ${el.shapeType}): "${el.text || ''}" at position (${Math.round(el.x)}, ${Math.round(el.y)}) with dimensions ${Math.round(el.width)}x${Math.round(el.height)}`;
        } else if (el.type === "drawing") {
          return `- Freehand drawing stroke (ID: ${el.id}) containing ${el.points?.length || 0} points, color "${el.color}"`;
        } else if (el.type === "connector") {
          return `- Connector line (ID: ${el.id}) from ID "${el.fromId || 'canvas'}" to ID "${el.toId || 'canvas'}"`;
        } else if (el.type === "image") {
          return `- Image (ID: ${el.id}) at (${Math.round(el.x)}, ${Math.round(el.y)}) with size ${Math.round(el.width)}x${Math.round(el.height)}`;
        }
        return `- Unknown Element (ID: ${el.id}, type: ${el.type})`;
      })
      .join("\n");

    const systemInstruction = `You are an expert Math Tutor and illustrator for an interactive digital whiteboard.
Your goal is to solve the problem presented on the whiteboard and create a beautiful, clear, step-by-step visual illustration (such as Singapore Math bar models, equations, or labeled blocks) that will be rendered directly on the whiteboard canvas.

To illustrate, you will output a list of whiteboard elements (shapes, text blocks, sticky notes, or connectors). 
Layout Guidelines:
- Place your visual illustration elements relative to an origin starting at x: 0, y: 0. Layout your elements inside an 800px wide by 600px tall area. The client will automatically shift and center these elements in the user's viewport.
- For Singapore Math bar models:
  - Create horizontal rectangles of type 'shape' with shapeType 'rect'. Keep height around 40-50px and widths proportional to the quantities.
  - Aligned rectangles represents parts of a whole or comparative bars. Put them adjacent to each other.
  - Create text blocks (type 'text') to label the bars (e.g., "John's Books", "Mary's Books", "5", "15", "?").
  - Create connectors (type 'connector') to draw lines or brackets showing ranges or connections between elements. Set text on connectors to label them (e.g. "Total = 20" or "Difference").
- Always include a large, clean central card explaining the overall solution (using a 'sticky' or 'shape' or multiple 'text' blocks) so the user can easily read the math explanation.
- Keep zIndex values positive and unique (e.g. 100, 101, 102...).
- Use pleasant pastel colors for fill/color: Yellow (#fef08a), Pink (#fbcfe8), Blue (#bfdbfe), Green (#bbf7d0), Orange (#fed7aa), Purple (#e9d5ff), Teal (#99f6e4), Red (#fecaca), White (#ffffff).`;

    const userPrompt = `Here is the current set of whiteboard elements:
${elementsSummary || "(Whiteboard is empty)"}

User Request / Question to solve:
"${prompt || "Solve the problem on the board and illustrate the solution using Singapore Math bar models."}"

Provide the solution text and the visual elements layout coordinates.`;

    const response = await safeGenerateContent(req, {
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            explanation: {
              type: Type.STRING,
              description: "Markdown formatted step-by-step written explanation of the solution."
            },
            suggestedTitle: {
              type: Type.STRING,
              description: "A short title for the illustration (e.g., 'Singapore Math Solution: Addition')."
            },
            elements: {
              type: Type.ARRAY,
              description: "Array of whiteboard elements that make up the visual illustration of the solution.",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "A unique string ID for this element, like 'ai-shape-1', 'ai-text-2', 'ai-connector-3'..." },
                  type: { type: Type.STRING, description: "Must be 'shape', 'sticky', 'text', or 'connector'" },
                  shapeType: { type: Type.STRING, description: "If type is 'shape', must be 'rect', 'circle', 'triangle', 'diamond', etc. or 'line'" },
                  x: { type: Type.NUMBER, description: "X coordinate relative to origin (around 0 to 800)" },
                  y: { type: Type.NUMBER, description: "Y coordinate relative to origin (around 0 to 600)" },
                  width: { type: Type.NUMBER, description: "Width of the element" },
                  height: { type: Type.NUMBER, description: "Height of the element" },
                  text: { type: Type.STRING, description: "Text content inside the shape, text block, or sticky note." },
                  color: { type: Type.STRING, description: "Background fill or text color hex (e.g. #fef08a for sticky, #1e293b for text)" },
                  borderColor: { type: Type.STRING, description: "Border color hex (optional, e.g. #1e293b)" },
                  fromId: { type: Type.STRING, description: "For type 'connector': starting shape ID if connected" },
                  toId: { type: Type.STRING, description: "For type 'connector': ending shape ID if connected" },
                  fromX: { type: Type.NUMBER, description: "For type 'connector': starting X coordinate if not connected" },
                  fromY: { type: Type.NUMBER, description: "For type 'connector': starting Y coordinate if not connected" },
                  toX: { type: Type.NUMBER, description: "For type 'connector': ending X coordinate if not connected" },
                  toY: { type: Type.NUMBER, description: "For type 'connector': ending Y coordinate if not connected" },
                  connectorText: { type: Type.STRING, description: "Label text for the connector line (e.g. '15 items', 'Difference = 8', '?')" }
                },
                required: ["id", "type", "x", "y", "width", "height"]
              }
            }
          },
          required: ["explanation", "suggestedTitle", "elements"]
        }
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    res.json(data);
  } catch (err: any) {
    console.error("Solver error:", err);
    const msg = err.message || String(err);
    res.status(500).json({ error: msg });
  }
});

// API: Correct drawing / handwriting strokes to text or tidy shapes
app.post("/api/ai/beautify", async (req, res) => {
  const { points } = req.body;

  if (!points || points.length < 2) {
    return res.status(400).json({ error: "Invalid points data." });
  }

  try {
    // Sample points if too many, to avoid bloating prompt
    const sampledPoints = points.length > 60 
      ? points.filter((_: any, i: number) => i % Math.ceil(points.length / 60) === 0)
      : points;

    const pointsStr = sampledPoints.map((p: any) => `(${Math.round(p.x)},${Math.round(p.y)})`).join(" ");

    const systemInstruction = `You are an AI handwriting and sketch analyzer for a collaborative digital whiteboard.
You are given a list of consecutive 2D coordinates representing a single user freehand stroke.
Your job is to analyze the shape and path of this stroke and determine:
1. Is it a hand-drawn geometric shape? (Must be one of: 'rect', 'circle', 'triangle', 'diamond', 'star', 'hexagon', 'pentagon', 'parallelogram', 'right-triangle', or 'line').
2. Is it a handwritten letter, word, number, or basic math symbol?
3. If it is a shape, classify it as 'shape' and specify the 'shapeType'.
4. If it is writing/text, classify it as 'text'. Carefully analyze the coordinate path, heights, widths, and stroke patterns to determine if the characters are UPPERCASE or lowercase. Write the recognized alphanumeric characters, words, or mathematical equations in 'text', strictly preserving the exact capitalization and casing (e.g., if the user wrote capital letters like 'A', 'B', 'MATH', return 'A', 'B', 'MATH'; do not lowercase them. If the user wrote 'a', 'b', 'hello', return 'a', 'b', 'hello').
5. If it's a general doodle or scribble that doesn't clearly represent a standard shape or text, classify it as 'original'.

Calculate the bounding box of the stroke based on the coordinates given, and return it.`;

    const prompt = `Analyze this handwritten stroke path represented by coordinates:
${pointsStr}

Provide your classification and bounding box coordinates matching the drawing's dimensions.`;

    const response = await safeGenerateContent(req, {
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Must be 'shape', 'text', or 'original'" },
            shapeType: { type: Type.STRING, description: "If type is 'shape', specifies the geometric type (rect, circle, triangle, diamond, line, star, hexagon, pentagon, parallelogram, right-triangle)." },
            text: { type: Type.STRING, description: "If type is 'text', specifies the recognized handwriting characters or equations. CRITICAL: Strictly preserve the exact capitalization, uppercase, and lowercase characters written by the user. Do not convert uppercase letters to lowercase." },
            bounds: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER, description: "Min X coordinate of the stroke bounding box" },
                y: { type: Type.NUMBER, description: "Min Y coordinate of the stroke bounding box" },
                width: { type: Type.NUMBER, description: "Width of the stroke bounding box (max X - min X)" },
                height: { type: Type.NUMBER, description: "Height of the stroke bounding box (max Y - min Y)" }
              },
              required: ["x", "y", "width", "height"]
            }
          },
          required: ["type", "bounds"]
        }
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    res.json(data);
  } catch (err: any) {
    console.error("Beautify error:", err);
    const msg = err.message || String(err);
    res.status(500).json({ error: msg });
  }
});

// API: Generate / suggest dynamic custom stamps using AI
app.post("/api/ai/stamp", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "Please provide a description/prompt for the stamp." });
  }

  try {
    const systemInstruction = `You are a creative educational helper for a whiteboard workspace.
The user wants to generate a custom stamp (like a teacher comment or feedback sticker).
Analyze the description, and suggest:
1. One perfect, fitting emoji (e.g. 🍎, 🚀, 💡, 🌟, REX, etc.).
2. A short, catchy, encouraging text/nickname for the stamp (e.g. "Super Reader!", "Creative idea!", "Check math"). Max 20 characters.
3. A beautiful, high-contrast, pleasant pastel hex color for the background (e.g. #fef08a, #bfdbfe, #bbf7d0, #fed7aa, #e9d5ff, #fbcfe8, #99f6e4, etc.).`;

    const response = await safeGenerateContent(req, {
      contents: `Generate an aesthetic, fun custom stamp matching this concept: "${prompt}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            emoji: { type: Type.STRING, description: "A single representative emoji" },
            text: { type: Type.STRING, description: "Encouraging short text (maximum 2-3 words, max 20 chars)" },
            color: { type: Type.STRING, description: "Aesthetic pastel hex background color code (e.g., '#bfdbfe')" }
          },
          required: ["emoji", "text", "color"]
        }
      }
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    res.json(data);
  } catch (err: any) {
    console.error("AI Stamp Generator error:", err);
    const msg = err.message || String(err);
    res.status(500).json({ error: msg });
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
