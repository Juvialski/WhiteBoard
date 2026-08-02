import { describe, it, expect, beforeEach } from 'vitest';
import {
  getShardIdForElement,
  SHARD_COUNT,
  assertNoInlineBinaryPayload,
  sanitizeElementForStorage,
  queueElementMutation,
  MAX_SINGLE_ELEMENT_BYTES,
  partitionElementsIntoChunks,
} from './boardPersistence';
import { BoardElement } from '../types';

describe('boardPersistence unit and security tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates deterministic shard IDs within 0-19 range', () => {
    const shard1 = getShardIdForElement('elem_abc_123');
    const shard2 = getShardIdForElement('elem_abc_123');
    expect(shard1).toBe(shard2);

    const index = parseInt(shard1.replace('shard_', ''), 10);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(SHARD_COUNT);
  });

  it('assertNoInlineBinaryPayload allows clean elements and blocks inline base64', () => {
    const cleanSticky: BoardElement = {
      id: 'sticky_1',
      type: 'sticky',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      color: '#ffff00',
      text: 'Hello world',
      zIndex: 1,
      updatedAt: Date.now(),
    };

    expect(() => assertNoInlineBinaryPayload(cleanSticky)).not.toThrow();

    const dirtyImage: any = {
      id: 'img_1',
      type: 'image',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: '#ffffff',
      text: '',
      zIndex: 1,
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    };

    expect(() => assertNoInlineBinaryPayload(dirtyImage)).toThrow(/Inline base64/);
  });

  it('sanitizeElementForStorage strips inline binary fields when assetId is present', () => {
    const elementWithAsset: any = {
      id: 'img_asset_1',
      type: 'image',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      color: '#ffffff',
      text: '',
      zIndex: 1,
      assetId: 'asset_abc123',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      updatedAt: Date.now(),
    };

    const sanitized = sanitizeElementForStorage(elementWithAsset as BoardElement);
    expect((sanitized as any).assetId).toBe('asset_abc123');
    expect((sanitized as any).src).toBeUndefined();
    expect(() => assertNoInlineBinaryPayload(sanitized)).not.toThrow();
  });

  it('queueElementMutation rejects elements exceeding maximum single element bytes', () => {
    const hugeText = 'A'.repeat(MAX_SINGLE_ELEMENT_BYTES + 1000);
    const hugeSticky: BoardElement = {
      id: 'huge_sticky',
      type: 'sticky',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      color: '#ffff00',
      text: hugeText,
      zIndex: 1,
      updatedAt: Date.now(),
    };

    expect(() => queueElementMutation('test_board', 'huge_sticky', hugeSticky)).toThrow(
      /exceeds maximum allowable size/
    );
  });

  it('partitionElementsIntoChunks partitions elements deterministically into state shards', () => {
    const elements: BoardElement[] = [
      { id: 'el_1', type: 'sticky', x: 0, y: 0, width: 100, height: 100, color: '#ffff00', text: 'One', zIndex: 1, updatedAt: 1 },
      { id: 'el_2', type: 'sticky', x: 10, y: 10, width: 100, height: 100, color: '#ffff00', text: 'Two', zIndex: 2, updatedAt: 2 },
      { id: 'el_3', type: 'sticky', x: 20, y: 20, width: 100, height: 100, color: '#ffff00', text: 'Three', zIndex: 3, updatedAt: 3 },
    ];

    const chunks = partitionElementsIntoChunks(elements);
    expect(chunks.size).toBeGreaterThan(0);

    let totalPartitionedCount = 0;
    chunks.forEach((chunkMap) => {
      totalPartitionedCount += Object.keys(chunkMap).length;
    });
    expect(totalPartitionedCount).toBe(3);
  });
});
