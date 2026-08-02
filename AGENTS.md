# Collaborative Whiteboard Workspace — Agent Developer Playbook

This document outlines the architecture, data schemas, mathematical patterns, AI integration, real-time synchronization flows, and strict developer guidelines of the Collaborative Whiteboard. Any AI Developer operating in this repository must strictly adhere to these guidelines to ensure performance, type-safety, and an elegant user experience.

---

## 1. System Architecture & Sync Engine

The application implements a hybrid real-time synchronization strategy to achieve maximum responsiveness and durability.

                  +-----------------------------------+
                  |        Whiteboard Canvas          |
                  +---------+----------------+--------+
                            |                |
    [Persistent State &     |                | [High-Frequency Transients:
     Structural Board Data] |                |  Live Cursors & Ink Streams]
                            v                v
                 +----------+----+     +-----+------------+
                 | Firebase      |     | Custom Node.js   |
                 | Firestore     |     | WebSockets (3000)|
                 +---------------+     +------------------+

### A. Firestore Persistence (Durable State) & Sandbox Guard
- Board Elements (Sticky notes, shapes, text, drawing strokes, image/audio/stamp elements, math LaTeX blocks) are saved in Firestore under:
  `/whiteboards/{boardId}/elements/{elementId}`
- Sandbox Guard (`isSandboxEnvironment()`): Automatically detects the AI Studio Sandbox environment (`ais-dev-*`, `localhost`, `127.0.0.1`). In Sandbox mode, ALL Firebase Firestore reads and writes (`getDocs`, `setDoc`, `addDoc`, `deleteDoc`, `onSnapshot`) are permanently short-circuited and banned to guarantee **0 Firebase Quota Usage**. Data is saved to and retrieved from `localStorage` (`lucid_spark_boards`, `lucid_spark_board_elements_{id}`). When deployed to the Shared/Production environment (`ais-pre-*`), real Firestore synchronization executes as normal.
- Snapshot Listener (`onSnapshot`): Updates the client state in real time when any structural elements are modified or deleted in non-sandbox mode.
- Throttling & Quota Constraint (CRITICAL): Standard Firestore limits write throughput to 1 write/second per document, and the Firebase free tier limits total writes per day (Quota limit exceeded: resource-exhausted). You MUST NOT perform unthrottled Firestore writes on drag, resize, or active drawing gestures.
- Centralized Queue Manager: NEVER use direct `setDoc`, `addDoc`, or `updateDoc` for individual board elements. You MUST use the central `saveElementLocallyAndSync(id, data)` function. This function debounces and batches updates locally and updates data in "blob/shard" documents to strictly prevent quota exhaustion.

### B. WebSocket Server (Transient State)
- WebSocket Gateway: Runs on the same port (`3000`) upgraded via HTTP.
- Use Cases: High-frequency, high-volume, and transient data that does not require long-term persistence:
  - `cursor`: Live cursor positions (`x`, `y`), current active tool, pan offset, and zoom.
  - `drawing_stream`: Temporary pen strokes actively being drawn before being flushed to Firestore.
  - `drawing_stream_end`: Event triggering the client to persist the final array of points to Firestore and clean up transient lines.
  - `element_update`: Soft updates during active resizing or drag events to show smoother live transitions to other peers.

### C. Modular Canvas Subsystems (`src/components/canvas/`)
To ensure high performance, maintainability, and clean separation of concerns, the canvas UI layers are modularized:
- `ElementWrapper.tsx`: Renders individual element wrappers (`StickyComponent`, `ShapeComponent`, etc.), memoized freehand stroke paths (`DrawingItem`), and active remote drawing streams (`RemoteDrawingStreamsLayer`).
- `WhiteboardHeader.tsx`: Floating header island containing back navigation, sync/connection badges, undo/redo, presenter mode, teacher/student access controls, and export dropdowns.
- `AiAssistantPanel.tsx`: Sliding AI Tutor panel, local Google AI Studio API key manager, handwriting autocorrect toggles, and Singapore Math solver interface.
- `CanvasOverlays.tsx`: Floating status banners (read-only mode, offline sync toasts, view-following indicators) and remote selection borders (`RemoteSelectionsLayer`).
- `src/utils/canvasUtils.ts`: Pure utilities for stroke point simplification (`simplifyPoints`), SVG path generation (`getSvgPathFromPoints`), connector Bezier routing, and image compression.

---

## 2. Shared Element & Schema Definitions (`src/types.ts`)

All elements rendered on the whiteboard canvas must implement one of the specific interface variants below. Never create inline mock properties that do not match these definitions.

- `sticky`: text, color (hex/Tailwind), textColor -> Standard rectangular sticky notes with centered text wrapping.
- `shape`: shapeType (rect, circle, diamond, triangle, cartesian, numberline, etc.), text, color, borderColor -> Multi-form shape blocks, flowcharts, or interactive Cartesian mathematical graphs.
- `text`: text, color, fontSize, fontFamily, textAlign -> Standard rich text fields with custom alignments and font weight.
- `math`: text (LaTeX code), fontSize, color -> Mathematical formulas and LaTeX equations rendered with KaTeX.
- `drawing`: points (Point[]), color, width, isHighlighter -> Freehand drawing paths and highlighters with Bezier curves.
- `image`: src (Base64 JPEG), reactions -> Pasteable images auto-compressed on upload to stay under 50MB.
- `audio`: audioUrl (Base64), duration, authorName -> Audio-recorded voice comments attached to physical coordinates.
- `stamp`: stampType (checked, star, great_job, signature, custom), label, color -> Interactive teacher stamp comments, AI-generated motivational stamps, or drawing signatures.
- `connector`: fromId, toId, fromSocket, toSocket, endPoint -> Connecting anchor lines linking shapes together dynamically.
- `table`: rows, cols, data (string[][]), hasHeaderRow, headerBgColor, cellBgColor, borderColor, textColor, fontSize -> Interactive grid table with editable cells, theme styles, and row/column management.

---

## 3. Mathematical Canvas Calculations & Formatting

### A. Pan & Zoom Transformation
To convert a raw client coordinate (e.g., from `e.clientX`, `e.clientY`) into canvas-space coordinates (the actual coordinate stored in Firestore), apply this calculation:

const rect = canvasRef.current.getBoundingClientRect();
const canvasX = (clientX - rect.left - panX) / zoom;
const canvasY = (clientY - rect.top - panY) / zoom;

To convert canvas coordinates back to screen pixel coordinates (e.g., for positioning overlay components):

const screenX = canvasX * zoom + panX;
const screenY = canvasY * zoom + panY;

### B. Anchor Sockets & Custom Connectors
Connectors link two shapes using four anchor points (`top`, `right`, `bottom`, `left`).
- Socket coordinate retrieval:

function getElementSocketCoords(el: BoardElement, socket: "top" | "right" | "bottom" | "left"): Point {
  const w = el.width || 150;
  const h = el.height || 150;
  switch (socket) {
    case "top":    return { x: el.x + w / 2, y: el.y };
    case "right":  return { x: el.x + w,     y: el.y + h / 2 };
    case "bottom": return { x: el.x + w / 2, y: el.y + h };
    case "left":   return { x: el.x,         y: el.y + h / 2 };
  }
}

- Line style routing: Use straight, curved quadratic bezier, or right-angle elbow routing.

### C. Mathematical LaTeX Standards
- Fractions: Use \dfrac instead of \frac for clean, readable visual scaling on canvas blocks.
- LaTeX Wrappers: Wrap display equations in standard $$...$$ blocks or $ ... $ inline syntax.
- Currency vs Math: Do not enclose monetary amounts (e.g., $50) or simple standard numbers inside math dollar-sign blocks.

---

## 4. AI-Powered Integration Guides

The board features several highly sophisticated Gemini API endpoints in `/server.ts` powered by `@google/genai` (using `gemini-3.6-flash`).
ALL Gemini API calls MUST be made on the server side (`/server.ts`).

### A. The Visual Solver (`/api/ai/solve`)
- Input: Current set of whiteboard elements, and the user's prompt (e.g., a math question or layout request).
- Processing: Summarizes the elements into structural markdown text representation, passes it to Gemini along with layout guidelines for Singapore Math bar models.
- Output Schema: Returns an `explanation`, `suggestedTitle`, and an array of `elements` to draw on the canvas.

### B. Handwriting & Sketch Beautifier (`/api/ai/beautify`)
- Input: Active mouse/pointer drawing points (`Point[]`).
- Processing: Samples the stroke path and sends it to Gemini to detect shapes or hand-written letters.
- Output Schema: Returns `type` ('shape', 'text', 'original'), `shapeType` (if applicable), `text` (if applicable, strictly preserving exact casing/capitalization), and `bounds`.

### C. Stamp Generator (`/api/ai/stamp`)
- Input: User prompt/description of the stamp (e.g., "Good Job").
- Processing: Generates an emoji, a short text, and a pastel hex color for the custom stamp.
- Output Schema: Returns `emoji`, `text`, and `color`.

---

## 5. Developer Behavioral Rules & Error Prevention

1. Reactive State Integrity:
   - Never update React state directly in component render bodies to avoid infinite render loops.
   - Guard against snapshot re-renders: Use primitive dependency values or stabilized refs in `useEffect` setups.
2. Quota Exhaustion Prevention:
   - NEVER use direct `setDoc`, `addDoc`, or `updateDoc` for individual board elements. ALWAYS use `saveElementLocallyAndSync` to queue updates.
   - For drawing strokes, use `simplifyPoints(points, 1.5)` to reduce the point density before storing to Firestore, to conserve payload size and quota.
3. HTML ID Standards:
   - Provide clean, semantic, unique `id` values for all actionable layout elements (e.g., `<button id="btn-zoom-in" ...>`) to assist automated E2E tests and debugging workflows.
4. Typography & Styling:
   - Always use utility classes of Tailwind CSS directly.
   - Align nested container corner radiuses mathematically: Inner Radius = Outer Radius - Padding.
   - Ensure a minimum target touch footprint of 44px on interactive control bars for tablet/mobile accessibility.
5. Prereq Validation:
   - Before completing any workspace edits, run `lint_applet` followed by `compile_applet` to confirm zero compilation warnings or type conflicts.

---

## 6. System & Infrastructure Rules

- Server Environment: Express server runs in `server.ts` binding to `0.0.0.0` and port `3000`.
- Gemini SDK: Always use `@google/genai` (`GoogleGenAI` and `Type` imports) with model `gemini-3.6-flash`.
- Server-Side API Security: Keep `GEMINI_API_KEY` strictly server-side (`process.env.GEMINI_API_KEY`). NEVER expose API keys to the browser or client-side code.
- Structured Outputs: Use `responseMimeType: "application/json"` and `responseSchema` for deterministic JSON payloads matching `src/types.ts`.
- Payload Limits: Ensure Express body parsers handle large base64 image/stroke payloads (e.g., `50mb` limit).
- Environment Variables: Every new environment variable must be declared in `.env.example`.
- TypeScript Strictness: Code must compile clean with `tsc --noEmit` (`npm run lint`).
- Testing Standard: Vitest unit and integration tests (`npm test` / `vitest run`) must run cleanly using JSDOM and `@testing-library/react`.
- Build Pipeline: Production build runs `vite build` targeting static output in `dist/`.

---

## 7. Explicit Agent Operating Directives

1. LaTeX & Math Rules: Use \dfrac for fractions. Wrap canvas math strictly in standard LaTeX syntax. Never enclose monetary values or standard numbers inside math dollar-sign blocks.
2. Quota Safety: Intercept any unthrottled state sync during drag/draw operations and route through `saveElementLocallyAndSync`.
3. AI Security: Keep all `@google/genai` logic restricted to `/server.ts`. Always validate schema shapes against `src/types.ts`.
4. Self-Evolution Mandate: Upon completing major feature additions or architectural fixes, append an entry to `AGENT_EVOLUTION_LOG.md` and update this playbook accordingly.

---

## 8. Agent Continuous Evolution (Self-Updating Rule)

CRITICAL MANDATE: To ensure this playbook progressively evolves, acts as a living document, and acts as an indicator that the agent is actively learning, you (the AI Developer) MUST update this `AGENTS.md` file at the end of complex tasks.
1. Pattern Capture: If you establish a new architectural pattern, discover a new error prevention technique, fix a recurring bug (like Firestore quota exhaustion), or modify `src/types.ts` schemas, you must append or inject those rules into the relevant sections above.
2. Evolution Log: Record a brief, timestamped entry in the `AGENT_EVOLUTION_LOG.md` file when a major structural change, feature addition, or rule update is completed. This provides a verifiable trail of the agent's adaptations over time while keeping this primary playbook concise.