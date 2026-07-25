# Collaborative Whiteboard Workspace — Agent Developer Playbook

This document outlines the architecture, data schemas, mathematical patterns, and real-time synchronization flows of the Collaborative Whiteboard. Any AI Developer operating in this repository must strictly adhere to these guidelines to ensure performance, type-safety, and elegant user experience.

---

## 1. System Architecture & Sync Engine

The application implements a hybrid real-time synchronization strategy to achieve maximum responsiveness and durability.

```
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
```

### A. Firestore Persistence (Durable State)
- **Board Elements** (Sticky notes, shapes, text, drawing strokes, image/audio/stamp elements, math LaTeX blocks) are saved in Firestore under:
  `/whiteboards/{boardId}/elements/{elementId}`
- **Snapshot Listener (`onSnapshot`)**: Updates the client state in real time when any structural elements are modified or deleted.
- **Throttling Constraint**: Standard Firestore limits write throughput to 1 write/second per document. You **MUST NOT** perform unthrottled Firestore writes on drag, resize, or active drawing gestures. Perform updates locally first in React state, and only write the final state to Firestore when the gesture completes (`pointerUp`).

### B. WebSocket Server (Transient State)
- **WebSocket Gateway**: Runs on the same port (`3000`) upgraded via HTTP.
- **Use Cases**: High-frequency, high-volume, and transient data that does not require long-term persistence:
  - `cursor`: Live cursor positions (`x`, `y`), current active tool, pan offset, and zoom.
  - `drawing_stream`: Temporary pen strokes actively being drawn before being flushed to Firestore.
  - `drawing_stream_end`: Event triggering the client to persist the final array of points to Firestore and clean up transient lines.
  - `element_update`: Soft updates during active resizing or drag events to show smoother live transitions to other peers.

---

## 2. Shared Element & Schema Definitions (`src/types.ts`)

All elements rendered on the whiteboard canvas must implement one of the specific interface variants below. Never create inline mock properties that do not match these definitions.

| Element `type` | Unique Properties | Purpose & Visual Assets |
| :--- | :--- | :--- |
| **`sticky`** | `text`, `color` (hex/Tailwind), `textColor` | Standard rectangular sticky notes with centered text wrapping. |
| **`shape`** | `shapeType` (rect, circle, diamond, triangle, cartesian, etc.), `text`, `color`, `borderColor` | Multi-form shape blocks, flowcharts, or Cartesian mathematical graphs. |
| **`text`** | `text`, `color`, `fontSize`, `fontFamily`, `textAlign` | Standard rich text fields with custom alignments and font weight. |
| **`math`** | `text` (LaTeX code), `fontSize`, `color` | Mathematical formulas and LaTeX equations rendered with KaTeX. |
| **`drawing`** | `points` (`Point[]`), `color`, `width`, `isHighlighter` | Freehand drawing paths and highlighters with Bezier curves. |
| **`image`** | `src` (Base64 JPEG), `reactions` | Pasteable images auto-compressed on upload to stay under 50MB. |
| **`audio`** | `audioUrl` (Base64), `duration`, `authorName` | Audio-recorded voice comments attached to physical coordinates. |
| **`stamp`** | `stampType` (checked, star, great_job, signature, etc.) | Interactive teacher stamp comments or drawing signatures. |
| **`connector`** | `fromId`, `toId`, `fromSocket`, `toSocket`, `endPoint` | Connecting anchor lines linking shapes together dynamically. |

---

## 3. Mathematical Canvas Calculations

### A. Pan & Zoom Transformation
To convert a raw client coordinate (e.g., from `e.clientX`, `e.clientY`) into canvas-space coordinates (the actual coordinate stored in Firestore), apply this calculation:
```typescript
const rect = canvasRef.current.getBoundingClientRect();
const canvasX = (clientX - rect.left - panX) / zoom;
const canvasY = (clientY - rect.top - panY) / zoom;
```
To convert canvas coordinates back to screen pixel coordinates (e.g., for positioning overlay components):
```typescript
const screenX = canvasX * zoom + panX;
const screenY = canvasY * zoom + panY;
```

### B. Anchor sockets & Custom Connectors
Connectors link two shapes using four anchor points (`top`, `right`, `bottom`, `left`).
- **Socket coordinate retrieval**:
  ```typescript
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
  ```
- **Line style routing**: Use straight, curved quadratic bezier, or right-angle elbow routing.

---

## 4. AI-Powered Integration Guides

The board features two highly sophisticated Gemini API endpoints in `/server.ts` powered by `@google/genai` (using `gemini-3.6-flash`).

### A. The Visual Solver (`/api/ai/solve`)
- **Input**: Current set of whiteboard elements, and the user's prompt (e.g., a math question or layout request).
- **Processing**: Summarizes the elements into structural markdown text representation, passes it to Gemini along with layout guidelines for Singapore Math bar models.
- **Output Schema**:
  - `explanation` (Markdown formatted solution string)
  - `suggestedTitle` (Short descriptive string)
  - `elements` (Array of objects specifying `id`, `type`, `x`, `y`, `width`, `height`, `text`, `color`, `borderColor`, etc. to draw the models onto the canvas).

### B. Handwriting & Sketch Beautifier (`/api/ai/beautify`)
- **Input**: Active mouse/pointer drawing points (`Point[]`).
- **Processing**: Samples the stroke path and sends it to Gemini to detect shapes or hand-written letters.
- **Output Schema**:
  - `type` (Must be `'shape'`, `'text'`, or `'original'`)
  - `shapeType` (If type is shape: 'rect', 'circle', 'triangle', 'diamond', etc.)
  - `text` (If type is text: The transcribed letters or formulas, strictly preserving exact user-supplied casing/capitalization).
  - `bounds` (Bounding box coordinates: `{ x, y, width, height }`).

---

## 5. Developer Behavioral Rules & Error Prevention

1. **Reactive State Integrity**:
   - Never update React state directly in component render bodies to avoid infinite render loops.
   - Guard against snapshot re-renders: Use primitive dependency values or stabilized refs in `useEffect` setups.
2. **HTML ID Standards**:
   - Provide clean, semantic, unique `id` values for all actionable layout elements (e.g., `<button id="btn-zoom-in" ...>`) to assist automated E2E tests and debugging workflows.
3. **Typography & Styling**:
   - Always use utility classes of Tailwind CSS directly.
   - Align nested container corner radiuses mathematically: `Inner Radius = Outer Radius - Padding`.
   - Ensure a minimum target touch footprint of `44px` on interactive control bars for tablet/mobile accessibility.
4. **Prereq Validation**:
   - Before completing any workspace edits, run `lint_applet` followed by `compile_applet` to confirm zero compilation warnings or type conflicts.
