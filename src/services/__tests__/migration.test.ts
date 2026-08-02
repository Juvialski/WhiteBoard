import { describe, it, expect } from 'vitest';
import { parseLegacyElement, migrateBoard, setAdminDbInstanceForTesting } from '../../../scripts/migrate-board';

describe('Legacy Migration Parsing & Normalization Suite', () => {
  it('parses raw object with stroke array and downsamples points', () => {
    const raw = {
      id: 'stroke-1',
      stroke: Array.from({ length: 100 }, (_, i) => ({ x: i * 0.1, y: i * 0.1 })),
      color: '#000000',
    };

    const parsed: any = parseLegacyElement(raw, 'fallback-1');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('stroke-1');
    expect(parsed?.type).toBe('drawing');
    expect(parsed?.points).toBeDefined();
    expect(parsed?.points?.length).toBeLessThan(100);
  });

  it('parses elements_blob style nested element', () => {
    const raw = {
      type: 'sticky',
      left: '120',
      top: '250',
      content: 'Legacy note text',
      backgroundColor: '#fef08a',
    };

    const parsed: any = parseLegacyElement(raw, 'blob-el-1');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('blob-el-1');
    expect(parsed?.type).toBe('sticky');
    expect(parsed?.x).toBe(120);
    expect(parsed?.y).toBe(250);
    expect(parsed?.text).toBe('Legacy note text');
  });

  it('handles stringified coordinates and missing fields gracefully', () => {
    const raw = {
      id: 12345, // numeric id
      x: '300.5',
      y: 'invalid',
      width: '200',
      type: 'shape',
      shapeType: 'rect',
    };

    const parsed: any = parseLegacyElement(raw, 'fallback-2');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('12345');
    expect(parsed?.x).toBe(300.5);
    expect(parsed?.y).toBe(0); // coerced fallback
    expect(parsed?.width).toBe(200);
    expect(parsed?.shapeType).toBe('rect');
  });
});

describe('migrateBoard Service Suite', () => {
  it('migrates schema-2 shards, removes stale V3 shards, and is idempotent', async () => {
    let manifest: any = {
      schemaVersion: 2,
      shardLayoutVersion: 1,
      shardCount: 20,
      currentRevision: 10,
      totalElements: 2,
      migrationStatus: 'complete',
    };
    let lockData: any = null;
    const schema2 = new Map<string, any>([
      ['shard_0', {
        elements: {
          'el-1': { id: 'el-1', type: 'sticky', text: 'Hello', updatedAt: 1000 },
          'el-2': { id: 'el-2', type: 'sticky', text: 'World', updatedAt: 2000 },
        },
        tombstones: {
          'el-deleted-1': { updatedAt: 1500, updatedByClientId: 'client-1' },
        },
      }],
    ]);
    const schema3 = new Map<string, any>([
      ['shard_159', { shardId: 'shard_159', revision: 5, elements: {}, tombstones: {} }],
    ]);
    const legacy = new Map<string, any>();

    const makeSnapshot = (store: Map<string, any>, makeRef: (id: string) => any) => {
      const docs = Array.from(store, ([id, value]) => ({
        id,
        ref: makeRef(id),
        data: () => value,
      }));
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs,
        forEach: (cb: any) => docs.forEach(cb),
      };
    };

    const makeSubcollection = (name: string) => {
      const store = name === 'elements' ? legacy : name === 'stateShards' ? schema2 : schema3;
      const makeRef = (id: string): any => ({
        id,
        delete: async () => { store.delete(id); },
        get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
      });
      return {
        doc: makeRef,
        get: async () => makeSnapshot(store, makeRef),
      };
    };

    const boardRef: any = {
      id: 'b1',
      get: async () => ({ exists: true, data: () => ({ ...manifest }) }),
      update: async (data: any) => { manifest = { ...manifest, ...data }; },
      set: async (data: any, options?: any) => {
        manifest = options?.merge ? { ...manifest, ...data } : { ...data };
      },
      collection: makeSubcollection,
    };

    const lockRef: any = {
      id: 'b1',
      get: async () => ({ exists: Boolean(lockData), data: () => lockData }),
      set: async (data: any) => { lockData = data; },
      delete: async () => { lockData = null; },
    };

    const mockDb: any = {
      collection: (name: string) => ({
        doc: (id: string) => name === 'whiteboards' ? boardRef : lockRef,
      }),
      batch: () => {
        const operations: Array<() => Promise<void> | void> = [];
        return {
          set: (ref: any, data: any) => operations.push(() => {
            schema3.set(ref.id, data);
          }),
          delete: (ref: any) => operations.push(() => ref.delete()),
          commit: async () => {
            for (const operation of operations) await operation();
          },
        };
      },
    };

    setAdminDbInstanceForTesting(mockDb);

    const first = await migrateBoard('b1');
    expect(first.success).toBe(true);
    expect(first.sourceElementCount).toBe(2);
    expect(first.verifiedElementCount).toBe(2);
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.shardLayoutVersion).toBe(2);
    expect(manifest.shardCount).toBe(160);
    expect(manifest.currentRevision).toBe(11);
    expect(manifest.totalElements).toBe(2);
    expect(manifest.migrationStatus).toBe('complete');
    expect(schema2.size).toBe(0);
    expect(schema3.has('shard_159')).toBe(false);

    const migratedSnapshot = JSON.stringify({ manifest, shards: Array.from(schema3.entries()) });
    const second = await migrateBoard('b1');
    expect(second.success).toBe(true);
    expect(JSON.stringify({ manifest, shards: Array.from(schema3.entries()) })).toBe(migratedSnapshot);
    setAdminDbInstanceForTesting(null);
  });
});
