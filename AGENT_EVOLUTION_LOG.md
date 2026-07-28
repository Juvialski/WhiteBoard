# Agent Evolution Log

This file tracks the historical evolution of the AI Developer's patterns, rules, and architectural decisions. While the active rules are maintained in `AGENTS.md`, this log provides a chronological trail of the agent's adaptations over time to prevent `AGENTS.md` from becoming excessively large.

## Changelog

- **[2026-07-27]** Initial consolidation of multi-agent schemas into a unified playbook. Added explicit write-throttling and queue batching rules (`saveElementLocallyAndSync`, `simplifyPoints`) to strictly prevent Firebase `resource-exhausted` quota limits under heavy load.
- **[2026-07-28]** Codebase Reorganization Milestone: Successfully refactored monolithic `WhiteboardCanvas.tsx` into modular domain files under `src/components/canvas/` (`ElementWrapper.tsx`, `AiAssistantPanel.tsx`, `WhiteboardHeader.tsx`, `CanvasOverlays.tsx`, `canvasUtils.ts`). Verified 100% test pass rate across all 50 tests. Verified timer precision (`Date.now() - startedAt`) and non-blocking high-frequency WebSocket sync.
- **[2026-07-28]** Read Optimization Milestone: Optimized Firestore read operations across the application to prevent free tier quota depletion. Replaced unthrottled `onSnapshot` query on `whiteboards` collection in `Dashboard.tsx` with `getDocs` on mount/creation/deletion plus 45s active polling. Increased `triggerStatsSync` debounce in `WhiteboardCanvas.tsx` from 4s to 30s. Excluded local write callbacks (`hasPendingWrites`) from read counters. Guaranteed 100% test suite pass rate.
