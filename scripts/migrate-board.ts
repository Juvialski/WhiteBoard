import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { BoardElement } from '../src/types';

const adminAny = admin as any;

let dbAdminInstance: any = null;

function getAdminDb() {
  if (dbAdminInstance) return dbAdminInstance;
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`firebase-applet-config.json not found at ${configPath}`);
  }
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!adminAny.apps || !adminAny.apps.length) {
    adminAny.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  dbAdminInstance = adminAny.firestore(firebaseConfig.firestoreDatabaseId || '(default)');
  return dbAdminInstance;
}

export function setAdminDbInstanceForTesting(mockDb: any) {
  dbAdminInstance = mockDb;
}

export interface MigrationOptions {
  boardId?: string;
  all?: boolean;
  dryRun?: boolean;
}

export interface MigrationResult {
  boardId: string;
  sourceElementCount: number;
  migratedShardCount: number;
  verifiedElementCount: number;
  deletedLegacyDocsCount: number;
  success: boolean;
  error?: string;
}

function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function simplifyPoints(points: { x: number; y: number }[], tolerance: number = 1.2): { x: number; y: number }[] {
  if (!points || points.length <= 2) return points || [];
  const result = [points[0]];
  let lastPoint = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dx = p.x - lastPoint.x;
    const dy = p.y - lastPoint.y;
    if (Math.sqrt(dx * dx + dy * dy) > tolerance) {
      result.push(p);
      lastPoint = p;
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function sanitizeForFirestore(el: any): any {
  const clean = { ...el };
  // strip potential undefined or large binary fields
  Object.keys(clean).forEach((k) => {
    if (clean[k] === undefined) {
      delete clean[k];
    }
  });
  return clean;
}

export function parseLegacyElement(rawEl: any, fallbackId: string): BoardElement | null {
  if (!rawEl || typeof rawEl !== 'object') return null;

  let points = rawEl.points || rawEl.stroke || rawEl.path;
  if (typeof points === 'string') {
    try {
      points = JSON.parse(points);
    } catch (_) {}
  }
  if (Array.isArray(points)) {
    points = simplifyPoints(points, 1.2);
  } else {
    points = undefined;
  }

  const id = String(rawEl.id || rawEl.elementId || fallbackId);
  const type = rawEl.type || (points ? 'drawing' : 'sticky');

  const x = Number(rawEl.x ?? rawEl.left ?? 0) || 0;
  const y = Number(rawEl.y ?? rawEl.top ?? 0) || 0;
  const width = Number(rawEl.width ?? rawEl.w ?? 150) || 150;
  const height = Number(rawEl.height ?? rawEl.h ?? 150) || 150;
  const zIndex = Number(rawEl.zIndex ?? rawEl.z ?? 0) || 0;

  const clean: any = {
    id,
    type,
    x,
    y,
    width,
    height,
    zIndex,
    color: rawEl.color || rawEl.backgroundColor || '#fef08a',
    text: typeof rawEl.text === 'string' ? rawEl.text : (rawEl.content || rawEl.label || ''),
    updatedAt: Number(rawEl.updatedAt || rawEl.timestamp || Date.now()) || Date.now(),
  };

  if (points) clean.points = points;
  if (rawEl.src) clean.src = rawEl.src;
  if (rawEl.shapeType) clean.shapeType = rawEl.shapeType;
  if (rawEl.fontSize) clean.fontSize = Number(rawEl.fontSize) || 16;
  if (rawEl.locked !== undefined) clean.locked = Boolean(rawEl.locked);

  return sanitizeForFirestore(clean) as BoardElement;
}

export async function migrateBoard(
  boardId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const isDryRun = !!options.dryRun;
  const dbAdmin = getAdminDb();
  const boardRef = dbAdmin.collection('whiteboards').doc(boardId);
  const lockRef = dbAdmin.collection('whiteboard_migration_locks').doc(boardId);
  const legacyColl = boardRef.collection('elements');
  const shardsColl = boardRef.collection('stateShards');
  const shardsV3Coll = boardRef.collection('stateShardsV3');
  const MAX_MIGRATION_SHARD_DOCUMENT_BYTES = 700_000;
  const TARGET_SHARD_COUNT = 160;

  let hasLock = false;
  let originalManifestData: any = null;
  let manifestSwitched = false;

  const fetchSources = async () => {
    const [boardSnap, legacySnap, shardsSnap, shardsV3Snap] = await Promise.all([
      boardRef.get(),
      legacyColl.get(),
      shardsColl.get(),
      shardsV3Coll.get(),
    ]);
    return { boardSnap, legacySnap, shardsSnap, shardsV3Snap };
  };

  const commitInBatches = async (
    operations: Array<{ type: 'set' | 'delete'; ref: any; data?: any }>,
    batchSize = 400
  ) => {
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = dbAdmin.batch();
      for (const op of operations.slice(i, i + batchSize)) {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else batch.delete(op.ref);
      }
      await batch.commit();
    }
  };

  const getVersion = (value: any) => ({
    updatedAt: Number(value?.updatedAt || 0),
    updatedByClientId: String(value?.updatedByClientId || ''),
  });

  try {
    let sources = await fetchSources();
    if (!sources.boardSnap.exists) {
      throw new Error(`Board ${boardId} does not exist.`);
    }

    originalManifestData = sources.boardSnap.data() || {};

    const v3LayoutIsClean = (() => {
      if (
        Number(originalManifestData.schemaVersion) !== 3 ||
        Number(originalManifestData.shardLayoutVersion) !== 2 ||
        Number(originalManifestData.shardCount) !== TARGET_SHARD_COUNT ||
        originalManifestData.migrationStatus !== 'complete'
      ) {
        return false;
      }

      let clean = true;
      sources.shardsV3Snap.forEach((docSnap: any) => {
        const data = docSnap.data() || {};
        const elementIds = Object.keys(data.elements || {});
        const tombstoneIds = Object.keys(data.tombstones || {});
        if (elementIds.length === 0 && tombstoneIds.length === 0) clean = false;
        for (const id of [...elementIds, ...tombstoneIds]) {
          if (docSnap.id !== `shard_${stableHash(id) % TARGET_SHARD_COUNT}`) {
            clean = false;
          }
        }
      });
      return clean;
    })();

    if (sources.legacySnap.empty && sources.shardsSnap.empty && v3LayoutIsClean) {
      return {
        boardId,
        sourceElementCount: Number(originalManifestData.totalElements || 0),
        migratedShardCount: sources.shardsV3Snap.size,
        verifiedElementCount: Number(originalManifestData.totalElements || 0),
        deletedLegacyDocsCount: 0,
        success: true,
      };
    }

    if (sources.legacySnap.empty && sources.shardsSnap.empty && sources.shardsV3Snap.empty) {
      throw new Error(`Board ${boardId} has no elements or shards to migrate.`);
    }

    if (!isDryRun) {
      const lockSnap = await lockRef.get();
      if (lockSnap.exists && lockSnap.data()?.locked) {
        throw new Error(`Board ${boardId} is currently locked for migration.`);
      }
      await lockRef.set({
        locked: true,
        lockedAt: adminAny?.firestore?.FieldValue
          ? adminAny.firestore.FieldValue.serverTimestamp()
          : new Date(),
      });
      hasLock = true;

      // Re-read after acquiring the lock so migration operates on a stable source snapshot.
      sources = await fetchSources();
      if (!sources.boardSnap.exists) throw new Error(`Board ${boardId} was deleted during migration startup.`);
      originalManifestData = sources.boardSnap.data() || {};
      await boardRef.update({ migrationStatus: 'in-progress', updatedAt: Date.now() });
    }

    const mergedItems = new Map<string, {
      isTombstone: boolean;
      updatedAt: number;
      updatedByClientId: string;
      data: any;
    }>();

    const mergeItem = (
      id: string,
      isTombstone: boolean,
      updatedAt: number,
      updatedByClientId: string,
      data: any
    ) => {
      const existing = mergedItems.get(id);
      if (!existing) {
        mergedItems.set(id, { isTombstone, updatedAt, updatedByClientId, data });
        return;
      }
      const incomingWins =
        updatedAt > existing.updatedAt ||
        (updatedAt === existing.updatedAt && updatedByClientId > existing.updatedByClientId) ||
        (updatedAt === existing.updatedAt && updatedByClientId === existing.updatedByClientId && isTombstone && !existing.isTombstone);
      if (incomingWins) mergedItems.set(id, { isTombstone, updatedAt, updatedByClientId, data });
    };

    sources.legacySnap.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (!data) return;
      const containers = [data.elements, data.drawings, data.data, data.items].filter(Boolean);
      if (containers.length === 0) {
        const parsed = parseLegacyElement(data, docSnap.id);
        if (parsed) {
          const version = getVersion(parsed);
          mergeItem(parsed.id, false, version.updatedAt || Date.now(), version.updatedByClientId, parsed);
        }
        return;
      }
      containers.forEach((container: any) => {
        if (Array.isArray(container)) {
          container.forEach((item, index) => {
            const parsed = parseLegacyElement(item, `${docSnap.id}_arr_${index}`);
            if (parsed) {
              const version = getVersion(parsed);
              mergeItem(parsed.id, false, version.updatedAt || Date.now(), version.updatedByClientId, parsed);
            }
          });
        } else if (container && typeof container === 'object') {
          Object.entries(container).forEach(([id, value]) => {
            const parsed = parseLegacyElement(value, id);
            if (parsed) {
              const version = getVersion(parsed);
              mergeItem(parsed.id, false, version.updatedAt || Date.now(), version.updatedByClientId, parsed);
            }
          });
        }
      });
    });

    const ingestShardSnapshot = (snapshot: any) => {
      snapshot.forEach((shardDoc: any) => {
        const data = shardDoc.data() || {};
        Object.entries(data.elements || {}).forEach(([id, raw]: [string, any]) => {
          if (!raw || typeof raw !== 'object') return;
          const version = getVersion(raw);
          mergeItem(id, Boolean(raw.isDeleted), version.updatedAt, version.updatedByClientId, raw);
        });
        Object.entries(data.tombstones || {}).forEach(([id, raw]: [string, any]) => {
          const version = getVersion(raw);
          mergeItem(id, true, version.updatedAt, version.updatedByClientId, raw);
        });
      });
    };

    ingestShardSnapshot(sources.shardsSnap);
    ingestShardSnapshot(sources.shardsV3Snap);

    const finalShards = new Map<string, { elements: Record<string, any>; tombstones: Record<string, any> }>();
    let activeElementCount = 0;
    let tombstoneCount = 0;

    mergedItems.forEach((item, elementId) => {
      const shardId = `shard_${stableHash(elementId) % TARGET_SHARD_COUNT}`;
      if (!finalShards.has(shardId)) finalShards.set(shardId, { elements: {}, tombstones: {} });
      const shard = finalShards.get(shardId)!;
      if (item.isTombstone) {
        tombstoneCount++;
        shard.tombstones[elementId] = {
          ...(item.data && typeof item.data === 'object' ? item.data : {}),
          updatedAt: item.updatedAt,
          updatedByClientId: item.updatedByClientId,
        };
      } else {
        activeElementCount++;
        shard.elements[elementId] = sanitizeForFirestore(item.data);
      }
    });

    const currentRevision = Number(originalManifestData.currentRevision ?? 0);
    const nextRevision = currentRevision + 1;
    const preparedShardDocs = new Map<string, any>();

    finalShards.forEach((shard, shardId) => {
      const shardDocument = {
        shardId,
        revision: nextRevision,
        elements: shard.elements,
        tombstones: shard.tombstones,
        updatedAt: Date.now(),
      };
      const bytes = new TextEncoder().encode(JSON.stringify(shardDocument)).byteLength;
      if (bytes > MAX_MIGRATION_SHARD_DOCUMENT_BYTES) {
        throw new Error(
          `Migration shard ${shardId} is ${bytes} bytes, above the ${MAX_MIGRATION_SHARD_DOCUMENT_BYTES}-byte safe limit.`
        );
      }
      preparedShardDocs.set(shardId, shardDocument);
    });

    if (isDryRun) {
      return {
        boardId,
        sourceElementCount: activeElementCount,
        migratedShardCount: preparedShardDocs.size,
        verifiedElementCount: activeElementCount,
        deletedLegacyDocsCount: 0,
        success: true,
      };
    }

    await commitInBatches(
      Array.from(preparedShardDocs, ([shardId, data]) => ({
        type: 'set' as const,
        ref: shardsV3Coll.doc(shardId),
        data,
      }))
    );

    // Remove destination documents that are not part of the deterministic final layout.
    let readBack = await shardsV3Coll.get();
    const expectedShardIds = new Set(preparedShardDocs.keys());
    const staleV3Docs = readBack.docs.filter((docSnap: any) => !expectedShardIds.has(docSnap.id));
    await commitInBatches(staleV3Docs.map((docSnap: any) => ({ type: 'delete' as const, ref: docSnap.ref })));

    // Read back again and verify exact placement, uniqueness, revision, and size.
    readBack = await shardsV3Coll.get();
    const seenActive = new Map<string, string>();
    const seenTombstones = new Map<string, string>();

    readBack.forEach((docSnap: any) => {
      if (!expectedShardIds.has(docSnap.id)) {
        throw new Error(`Unexpected destination shard ${docSnap.id} remained after cleanup.`);
      }
      const data = docSnap.data() || {};
      if (Number(data.revision) !== nextRevision) {
        throw new Error(`Shard ${docSnap.id} has revision ${data.revision}; expected ${nextRevision}.`);
      }
      const bytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
      if (bytes > MAX_MIGRATION_SHARD_DOCUMENT_BYTES) {
        throw new Error(`Verified shard ${docSnap.id} exceeds the safe size limit.`);
      }
      Object.keys(data.elements || {}).forEach((id) => {
        const expected = `shard_${stableHash(id) % TARGET_SHARD_COUNT}`;
        if (docSnap.id !== expected) throw new Error(`Element ${id} is in ${docSnap.id}; expected ${expected}.`);
        if (seenActive.has(id) || seenTombstones.has(id)) throw new Error(`Duplicate migrated ID ${id}.`);
        seenActive.set(id, docSnap.id);
      });
      Object.keys(data.tombstones || {}).forEach((id) => {
        const expected = `shard_${stableHash(id) % TARGET_SHARD_COUNT}`;
        if (docSnap.id !== expected) throw new Error(`Tombstone ${id} is in ${docSnap.id}; expected ${expected}.`);
        if (seenActive.has(id) || seenTombstones.has(id)) throw new Error(`Duplicate migrated ID ${id}.`);
        seenTombstones.set(id, docSnap.id);
      });
    });

    for (const [id, item] of mergedItems) {
      if (item.isTombstone && !seenTombstones.has(id)) throw new Error(`Missing migrated tombstone ${id}.`);
      if (!item.isTombstone && !seenActive.has(id)) throw new Error(`Missing migrated element ${id}.`);
    }
    if (seenActive.size !== activeElementCount || seenTombstones.size !== tombstoneCount) {
      throw new Error('Migration verification count mismatch.');
    }

    const finalShardIds = Array.from(expectedShardIds).sort();
    const deletedShardIds = staleV3Docs.map((docSnap: any) => docSnap.id).sort();

    await boardRef.set({
      schemaVersion: 3,
      shardLayoutVersion: 2,
      shardCount: TARGET_SHARD_COUNT,
      currentRevision: nextRevision,
      changedShardIds: finalShardIds,
      deletedShardIds,
      totalElements: activeElementCount,
      migrationStatus: 'complete',
      updatedAt: Date.now(),
      migratedAt: Date.now(),
    }, { merge: true });
    manifestSwitched = true;

    const legacyDeleteOps = sources.legacySnap.docs.map((docSnap: any) => ({ type: 'delete' as const, ref: docSnap.ref }));
    const schema2DeleteOps = sources.shardsSnap.docs.map((docSnap: any) => ({ type: 'delete' as const, ref: docSnap.ref }));
    await commitInBatches([...legacyDeleteOps, ...schema2DeleteOps]);

    return {
      boardId,
      sourceElementCount: activeElementCount,
      migratedShardCount: preparedShardDocs.size,
      verifiedElementCount: seenActive.size,
      deletedLegacyDocsCount: legacyDeleteOps.length + schema2DeleteOps.length + staleV3Docs.length,
      success: true,
    };
  } catch (err: any) {
    if (hasLock && originalManifestData && !manifestSwitched) {
      try {
        await boardRef.set(originalManifestData);
      } catch (rollbackError) {
        console.error(`Failed to restore board ${boardId} manifest after migration error:`, rollbackError);
      }
    }
    return {
      boardId,
      sourceElementCount: 0,
      migratedShardCount: 0,
      verifiedElementCount: 0,
      deletedLegacyDocsCount: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (hasLock) await lockRef.delete().catch(() => {});
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const boardIdArgIdx = args.indexOf('--boardId');
  const boardId = boardIdArgIdx !== -1 ? args[boardIdArgIdx + 1] : undefined;
  const isAll = args.includes('--all');

  if (!boardId && !isAll) {
    console.log(`
Administrative Whiteboard Migration CLI Tool
Usage:
  npx tsx scripts/migrate-board.ts --boardId <id> [--dry-run]
  npx tsx scripts/migrate-board.ts --all [--dry-run]
    `);
    return;
  }

  if (boardId) {
    await migrateBoard(boardId, { dryRun: isDryRun });
  } else if (isAll) {
    console.log('Fetching all boards for migration...');
    const boardsSnap = await getAdminDb().collection('whiteboards').get();
    console.log(`Found ${boardsSnap.size} boards to check/migrate.`);

    for (const d of boardsSnap.docs) {
      await migrateBoard(d.id, { dryRun: isDryRun });
    }
  }
}

if (process.argv[1]?.includes('migrate-board')) {
  runCli().catch(console.error);
}
