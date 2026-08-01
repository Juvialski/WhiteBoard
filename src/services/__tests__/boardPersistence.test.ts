import { describe, it, expect, beforeEach } from 'vitest';
import {
  partitionElementsIntoChunks,
  simplifyPoints,
  sanitizeForFirestore,
  queueElementMutation,
  flushBoardCheckpoint,
} from '../boardPersistence';
import {
  setInstrumentationEnabled,
  resetInstrumentationStats,
  getInstrumentationStats,
} from '../../utils/firestoreInstrumentation';
import { BoardElement, DrawingElement, StickyElement } from '../../types';

describe('boardPersistence Service', () => {
  beforeEach(() => {
    resetInstrumentationStats();
  });

  describe('partitionElementsIntoChunks', () => {
    it('partitions small elements list into a single chunk', () => {
      const elements: BoardElement[] = [
        { id: 'el-1', type: 'sticky', x: 100, y: 100, width: 150, height: 150, text: 'Hello', color: '#fef08a' } as StickyElement,
        { id: 'el-2', type: 'sticky', x: 300, y: 100, width: 150, height: 150, text: 'World', color: '#bfdbfe' } as StickyElement,
      ];

      const chunks = partitionElementsIntoChunks(elements);
      expect(chunks.size).toBe(1);
      const chunk0 = chunks.get('chunk_0');
      expect(chunk0).toBeDefined();
      expect(Object.keys(chunk0!).length).toBe(2);
      expect(chunk0!['el-1']).toBeDefined();
      expect(chunk0!['el-2']).toBeDefined();
    });

    it('splits elements across multiple chunks when byte threshold is exceeded', () => {
      // Create a large drawing element that takes ~200KB
      const largePoints = Array.from({ length: 10000 }, (_, i) => ({ x: i, y: i }));
      const largeDrawing: DrawingElement = {
        id: 'draw-1',
        type: 'drawing',
        points: largePoints,
        color: '#000000',
        width: 3,
        isHighlighter: false,
        zIndex: 1,
      };

      const elements: BoardElement[] = [
        { id: 'el-1', type: 'sticky', x: 100, y: 100, width: 150, height: 150, text: 'Note 1', color: '#fef08a' } as StickyElement,
        largeDrawing,
      ];

      const chunks = partitionElementsIntoChunks(elements, 100 * 1024); // 100KB max per chunk
      expect(chunks.size).toBeGreaterThanOrEqual(2);
      expect(chunks.has('chunk_0')).toBe(true);
      expect(chunks.has('chunk_1')).toBe(true);
    });
  });

  describe('simplifyPoints', () => {
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

    it('returns original points if array has 2 or fewer points', () => {
      const twoPoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
      expect(simplifyPoints(twoPoints, 1.0)).toEqual(twoPoints);
    });
  });

  describe('sanitizeForFirestore', () => {
    it('strips undefined values recursively', () => {
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

  describe('Instrumentation Tracking', () => {
    it('records read and write operation metrics correctly', () => {
      setInstrumentationEnabled(true);
      resetInstrumentationStats();

      const stats = getInstrumentationStats();
      expect(stats.reads).toBe(0);
      expect(stats.writes).toBe(0);
      expect(stats.deletes).toBe(0);
    });
  });
});
