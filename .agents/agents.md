# Multi-Agent Team Coordinator (`.agents/agents.md`)

This repository powers a high-performance, real-time Collaborative Whiteboard Application built with React 19, Express, WebSockets, Firebase Firestore, and Google Gemini 3.6 Flash AI.

To maintain architectural integrity, type safety, and optimal token efficiency, work is divided across four specialized agent sub-personas.

---

## Team Sub-Personas & Routing Matrix

### 1. Frontend & Canvas Specialist
- **Skill File**: `.agents/skills/frontend.md`
- **Trigger Description**: Triggered for any tasks involving React 19 UI components, interactive canvas rendering, pan/zoom mathematical transformations, custom shape/sticky/text/math/image/audio visual components, Tailwind CSS v4 styling, KaTeX LaTeX formulas, or client-side UX state.
- **Primary Domain**: `/src/components/*`, `/src/App.tsx`, `/src/index.css`, `/src/utils/pdf.ts`.

### 2. Backend & AI Core Engineer
- **Skill File**: `.agents/skills/backend.md`
- **Trigger Description**: Triggered for tasks involving Express.js server routes, Gemini 3.6 Flash AI integration via `@google/genai`, `/api/ai/solve` visual solver, `/api/ai/beautify` handwriting recognizer, server-side payload limits, logging, and Vite middleware integration.
- **Primary Domain**: `/server.ts`, `/src/types.ts` (API schemas), server-side AI integrations.

### 3. Realtime & Firebase Sync Architect
- **Skill File**: `.agents/skills/realtime-firebase.md`
- **Trigger Description**: Triggered for tasks involving WebSocket client/server real-time communication (`ws` package), live cursor tracking, transient drawing streams, Firebase Firestore database synchronization (`src/firebase.ts`), security rules (`firestore.rules`), or offline IndexedDB caching.
- **Primary Domain**: `/server.ts` (WS handlers), `/src/firebase.ts`, `/firestore.rules`, `/src/components/LiveCursors.tsx`.

### 4. DevOps & Quality Guard
- **Skill File**: `.agents/skills/devops-quality.md`
- **Trigger Description**: Triggered for tasks involving package management (`package.json`), build scripts (`vite.config.ts`), TypeScript compilation (`tsc --noEmit`), Vitest testing (`vitest.config.ts`, `*.test.tsx`), environment variables (`.env.example`), and project verification.
- **Primary Domain**: `/package.json`, `/tsconfig.json`, `/vite.config.ts`, `/vitest.config.ts`, `.env.example`, `*.test.tsx`.

---

## Coordinator Workflow Rules
1. **Identify Task Domain**: Analyze user requests and map them to the relevant persona skill file(s).
2. **Consult Skill Guidelines**: Read and follow the corresponding `.agents/skills/*.md` file rules prior to making code edits.
3. **Verify Integrity**: Always ensure code compiles via `npm run lint` (`tsc --noEmit`) and passes build verification.
