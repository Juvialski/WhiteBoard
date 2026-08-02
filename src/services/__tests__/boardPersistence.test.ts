import { describe, it, expect, beforeEach } from 'vitest';
import {
  stableHash,
  getShardIdForElement,
  partitionElementsIntoChunks,
  simplifyPoints,
  sanitizeForFirestore,
  queueElementMutation,
  flushBoardCheckpoint,
  loadBoardState,
  applyRemoteOperation,
  disposeBoardPersistence,
  SHARD_COUNT,
  MAX_SINGLE_ELEMENT_BYTES,
} from '../boardPersistence';
import {
  setInstrumentationEnabled,
  resetInstrumentationStats,
  getInstrumentationStats,
} from '../../utils/firestoreInstrumentation';
import { BoardElement, DrawingElement, StickyElement } from '../../types';

describe('boardPersistence Service - Deterministic Sharding & Concurrency Suite', () => {
  beforeEach(() => {
    resetInstrumentationStats();
    disposeBoardPersistence();
  });

  describe('Requirement 1: Deterministic Shard Mapping', () => {
    it('always maps the same element ID to the exact same shard', () => {
      const elId = 'sticky-element-abc-123';
      const shard1 = getShardIdForElement(elId);
      const shard2 = getShardIdForElement(elId);
      const shard3 = getShardIdForElement(elId);

      expect(shard1).toBe(shard2);
      expect(shard2).toBe(shard3);
      expect(shard1).toMatch(/^shard_\d+$/);

      const shardNum = parseInt(shard1.replace('shard_', ''), 10);
      expect(shardNum).toBeGreaterThanOrEqual(0);
      expect(shardNum).toBeLessThan(SHARD_COUNT);
    });

    it('partitionElementsIntoChunks partitions elements deterministically', () => {
      const elements: BoardElement[] = [
        { id: 'el-1', type: 'sticky', x: 100, y: 100, width: 150, height: 150, text: 'Hello', color: '#fef08a' } as StickyElement,
        { id: 'el-2', type: 'sticky', x: 300, y: 100, width: 150, height: 150, text: 'World', color: '#bfdbfe' } as StickyElement,
      ];

      const chunks = partitionElementsIntoChunks(elements);
      expect(chunks.size).toBeGreaterThanOrEqual(1);

      const shardId1 = getShardIdForElement('el-1');
      const shardId2 = getShardIdForElement('el-2');

      expect(chunks.has(shardId1)).toBe(true);
      expect(chunks.has(shardId2)).toBe(true);
    });

    it('splits chunks if byte limit is artificially constrained for testing', () => {
      const elements: BoardElement[] = [
        { id: 'el-1', type: 'sticky', x: 100, y: 100, width: 150, height: 150, text: 'Note 1', color: '#fef08a' } as StickyElement,
        { id: 'el-2', type: 'sticky', x: 300, y: 100, width: 150, height: 150, text: 'Note 2', color: '#bfdbfe' } as StickyElement,
      ];

      const chunks = partitionElementsIntoChunks(elements, 100);
      expect(chunks.size).toBeGreaterThanOrEqual(2);
    });

    it('throws size validation error when single element exceeds byte threshold', () => {
      const oversizedPoints = Array.from({ length: 30000 }, (_, i) => ({ x: i, y: i }));
      const oversizedDrawing: BoardElement = {
        id: 'huge-1',
        type: 'drawing',
        points: oversizedPoints,
        color: '#000000',
        width: 3,
        zIndex: 1,
      } as any;

      expect(() => {
        queueElementMutation('board-test-huge', 'huge-1', oversizedDrawing, 'set');
      }).toThrow(/exceeds maximum allowable size/);
    });
  });

  describe('Requirement 2: Point Simplification & Sanitization', () => {
    it('downsamples dense stroke points accurately', () => {
      const densePoints = [
        { x: 0, y: 0 },
        { x: 0.2, y: 0.2 },
        { x: 0.4, y: 0.4 },
        { x: 5, y: 5 },
        { x: 5.1, y: 5.1 },
        { x: 10, y: 10 },
      ];

      const simplified = simplifyPoints(densePoints, 1.0);
      expect(simplified.length).toBeLessThan(densePoints.length);
      expect(simplified[0]).toEqual({ x: 0, y: 0 });
      expect(simplified[simplified.length - 1]).toEqual({ x: 10, y: 10 });
    });

    it('strips undefined values recursively for Firestore safety', () => {
      const input = {
        id: 'el-1',
        text: 'Hello',
        optionalField: undefined,
        nested: {
          valid: 123,
          invalid: undefined,
        },
      };

      const sanitized = sanitizeForFirestore(input);
      expect(sanitized).toEqual({
        id: 'el-1',
        text: 'Hello',
        nested: {
          valid: 123,
        },
      });
      expect('optionalField' in sanitized).toBe(false);
      expect('invalid' in sanitized.nested).toBe(false);
    });
  });

  describe('Requirement 3: Remote Operation Reconciliation', () => {
    it('applies remote operation to memory without marking local pending mutations', async () => {
      const boardId = 'board-remote-test';
      const remoteOp = {
        operationId: 'op-100',
        clientId: 'client-B',
        baseRevision: 1,
        elementId: 'el-remote-1',
        action: 'set' as const,
        data: { id: 'el-remote-1', type: 'sticky', x: 50, y: 50, text: 'Remote note' } as BoardElement,
        updatedAt: Date.now(),
      };

      applyRemoteOperation(boardId, remoteOp);
      // Ensure duplicate op is ignored safely
      applyRemoteOperation(boardId, remoteOp);

      const state = await loadBoardState(boardId);
      const el = state.elements.find((e) => e.id === 'el-remote-1') as StickyElement | undefined;
      expect(el).toBeDefined();
      expect(el?.text).toBe('Remote note');
    });
  });

  describe('Requirement 4: Sandbox Board State & Mutations', () => {
    it('loads sandbox board state safely and handles sandbox mutations', async () => {
      const boardId = 'sandbox-test-board';
      const boardState = await loadBoardState(boardId);
      expect(boardState.schemaVersion).toBe(2);
      expect(boardState.isLegacy).toBe(false);
      expect(boardState.migrationRequired).toBe(false);

      queueElementMutation(boardId, 'sb-el-1', {
        id: 'sb-el-1',
        type: 'sticky',
        x: 100,
        y: 100,
        width: 150,
        height: 150,
        text: 'Sandbox Note',
        color: '#fef08a',
        updatedAt: Date.now(),
      } as StickyElement, 'set');

      await flushBoardCheckpoint(boardId);

      const updatedState = await loadBoardState(boardId);
      const el = updatedState.elements.find((e) => e.id === 'sb-el-1') as StickyElement | undefined;
      expect(el).toBeDefined();
      expect(el?.text).toBe('Sandbox Note');
    });

    it('handles element deletion mutations in sandbox persistence', async () => {
      const boardId = 'sandbox-delete-test';
      queueElementMutation(boardId, 'del-1', {
        id: 'del-1',
        type: 'sticky',
        x: 10,
        y: 10,
        text: 'To be deleted',
      } as StickyElement, 'set');
      await flushBoardCheckpoint(boardId);

      queueElementMutation(boardId, 'del-1', null, 'delete');
      await flushBoardCheckpoint(boardId);

      const state = await loadBoardState(boardId);
      const el = state.elements.find((e) => e.id === 'del-1');
      expect(el).toBeUndefined();
    });
  });

  describe('Requirement 5: Instrumentation Metrics', () => {
    it('tracks read/write metrics accurately without side effects', () => {
      setInstrumentationEnabled(true);
      resetInstrumentationStats();
      const stats = getInstrumentationStats();
      expect(stats.reads).toBe(0);
      expect(stats.writes).toBe(0);
      expect(stats.deletes).toBe(0);
    });
  });
});
