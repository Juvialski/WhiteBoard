# Gemini API & Integration Playbook

This document details the configuration, best practices, and model schemas used to interface with the Google Gemini API in this application. Any AI Developer modifying or extending the AI-powered features of the Collaborative Whiteboard must adhere to these guidelines.

---

## 1. SDK Selection & API Key Safety

### A. The Correct SDK
We use the modern, official `@google/genai` TypeScript SDK:
```typescript
import { GoogleGenAI, Type } from "@google/genai";
```
Do **NOT** use the legacy `@google/generative-ai` package.

### B. Severe Key Safety Mandate
- **All Gemini API calls MUST be made on the server side (`/server.ts`)**.
- Under no circumstances should the `GEMINI_API_KEY` be exposed to the browser or prefixed with `VITE_`.
- Server-side routes must authenticate requests and proxy the generated content securely back to the frontend.

---

## 2. Model Selection Guidelines

We target high-performance, real-time response times to keep the whiteboard interactive and fluid:

- **Primary Model**: `gemini-3.6-flash` or `gemini-2.5-flash` for high-speed, cost-effective multimodal tasks, handwriting transcriptions, and diagram solvers.
- **Advanced Reasoning Model**: `gemini-2.5-pro` (if requested) for extremely complex diagram routing, architectural schema generations, or complex coding requests.

---

## 3. Core Endpoint Specifications

### A. Visual Solver (`/api/ai/solve`)
- **Purpose**: Generates step-by-step math and diagrammatic layouts (e.g. Singapore Math Bar Models).
- **Execution Flow**: Renders whiteboard elements as a visual structure representation, queries Gemini with structured response JSON formatting constraints, and maps the output array back to whiteboard elements.
- **Schema Mapping**:
  ```typescript
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      explanation: { type: Type.STRING },
      suggestedTitle: { type: Type.STRING },
      elements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { type: Type.STRING }, // 'shape', 'sticky', 'text', 'connector'
            shapeType: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
            text: { type: Type.STRING },
            color: { type: Type.STRING },
            borderColor: { type: Type.STRING }
          }
        }
      }
    }
  }
  ```

### B. Handwriting & Ink Beautifier (`/api/ai/beautify`)
- **Purpose**: Classifies and transcribes active freehand ink strokes into clean vector shapes or plain text.
- **Execution Flow**: Receives consecutive 2D coordinates `(x, y)` from the client canvas. It scales down coordinates if necessary, passes them inside structured prompts, and parses the clean object coordinates, detected letters, and exact capitalization constraints.
- **Capitalization Constraint**: Preserve handwriting text casing (e.g., if handwriting is capitalized: "MATH", do not lowercase).

---

## 4. Best Practices for Modifying Prompts & Instructions
- When adding context (such as custom shapes or mathematical graphs), update the `systemInstruction` in `/server.ts` to explicitly describe the expected canvas dimensions (typically relative coordinates around `0-800` X and `0-600` Y).
- Always use `responseMimeType: "application/json"` combined with `responseSchema` to guarantee the outputs correspond to our custom TS declarations in `/src/types.ts`.
