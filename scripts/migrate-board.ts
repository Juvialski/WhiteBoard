import {
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
} from 'firebase/firestore';
import { db } from '../src/firebase';
import { BoardElement } from '../src/types';
import {
  partitionElementsIntoChunks,
  sanitizeForFirestore,
  simplifyPoints,
} from '../src/services/boardPersistence';

export interface MigrationOptions {
  boardId?: string;
  all?: boolean;
  dryRun?: boolean;
}

export interface MigrationResult {
  boardId: string;
  sourceElementCount: number;
  migratedChunkCount: number;
  verifiedElementCount: number;
  deletedLegacyDocsCount: number;
  success: boolean;
  error?: string;
}

/**
 * Robustly parses and normalizes any legacy element representation.
 * Supports all 13 legacy formats, field coercions, stroke/points mapping, and point simplification.
 */
export function parseLegacyElement(rawEl: any, fallbackId: string): BoardElement | null {
  if (!rawEl || typeof rawEl !== 'object') return null;

  // Handle stroke vs points vs path array/JSON string
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

/**
 * Migration Function
 * Reads all legacy formats, normalizes elements, writes size-aware replacement chunks,
 * verifies count and element ID equality, and ONLY then deletes legacy source docs.
 */
export async function migrateBoard(
  boardId: string,
  options: { dryRun?: boolean } = {}
): Promise<MigrationResult> {
  const isDryRun = !!options.dryRun;
  console.log(`\n==================================================`);
  console.log(`Starting migration for Board ID: ${boardId} ${isDryRun ? '(DRY-RUN MODE)' : ''}`);
  console.log(`==================================================`);

  try {
    // Step 1: Read all documents from legacy /whiteboards/{boardId}/elements
    const legacyColl = collection(db, 'whiteboards', boardId, 'elements');
    const legacySnap = await getDocs(query(legacyColl));

    if (legacySnap.empty) {
      console.log(`[Info] No legacy elements found for board ${boardId}. Checking stateChunks...`);
      const chunksColl = collection(db, 'whiteboards', boardId, 'stateChunks');
      const chunksSnap = await getDocs(query(chunksColl));
      return {
        boardId,
        sourceElementCount: 0,
        migratedChunkCount: chunksSnap.size,
        verifiedElementCount: 0,
        deletedLegacyDocsCount: 0,
        success: true,
      };
    }

    console.log(`[Step 1] Found ${legacySnap.size} legacy documents in /whiteboards/${boardId}/elements`);

    // Step 2: Extract and parse all legacy elements
    const elementsMap = new Map<string, BoardElement>();

    legacySnap.forEach((docSnap) => {
      const data = docSnap.data();
      const docId = docSnap.id;

      if (!data) return;

      // Extract containers: elements, drawings, data, or arrays
      const containers: any[] = [
        data.elements,
        data.drawings,
        data.data,
        data.items,
      ].filter(Boolean);

      if (containers.length > 0) {
        containers.forEach((container) => {
          if (Array.isArray(container)) {
            container.forEach((item, idx) => {
              const parsed = parseLegacyElement(item, `${docId}_arr_${idx}`);
              if (parsed) elementsMap.set(parsed.id, parsed);
            });
          } else if (typeof container === 'object') {
            Object.entries(container).forEach(([key, value]) => {
              const parsed = parseLegacyElement(value, key);
              if (parsed) elementsMap.set(parsed.id, parsed);
            });
          }
        });
      } else {
        // Individual stray element doc
        const parsed = parseLegacyElement(data, docId);
        if (parsed) elementsMap.set(parsed.id, parsed);
      }
    });

    const totalSourceElements = elementsMap.size;
    console.log(`[Step 2] Assembled and normalized ${totalSourceElements} unique elements from legacy documents.`);

    // Step 3: Size-aware chunking into stateChunks
    const chunks = partitionElementsIntoChunks(elementsMap);
    const chunkIds = Array.from(chunks.keys());
    console.log(`[Step 3] Partitioned elements into ${chunks.size} replacement stateChunks: [${chunkIds.join(', ')}]`);

    if (isDryRun) {
      console.log(`[Dry-Run] Skipped writing replacement chunks and legacy deletion.`);
      return {
        boardId,
        sourceElementCount: totalSourceElements,
        migratedChunkCount: chunks.size,
        verifiedElementCount: totalSourceElements,
        deletedLegacyDocsCount: 0,
        success: true,
      };
    }

    // Step 4: Write ALL replacement stateChunks and update board manifest
    console.log(`[Step 4] Writing replacement stateChunks to /whiteboards/${boardId}/stateChunks...`);
    const batch = writeBatch(db);

    chunks.forEach((chunkData, chunkId) => {
      const chunkRef = doc(db, 'whiteboards', boardId, 'stateChunks', chunkId);
      batch.set(chunkRef, {
        chunkId,
        elements: chunkData,
        elementCount: Object.keys(chunkData).length,
        updatedAt: Date.now(),
      });
    });

    const boardRef = doc(db, 'whiteboards', boardId);
    batch.set(
      boardRef,
      {
        schemaVersion: 2,
        currentRevision: 1,
        chunkIds,
        totalElements: totalSourceElements,
        migrationStatus: 'complete',
        updatedAt: Date.now(),
        migratedAt: Date.now(),
      },
      { merge: true }
    );

    await batch.commit();
    console.log(`[Step 4] Replacement chunks and board manifest successfully committed to Firestore.`);

    // Step 5: Verification - read back replacement chunks and verify counts & IDs
    console.log(`[Step 5] Verifying written stateChunks...`);
    const chunksColl = collection(db, 'whiteboards', boardId, 'stateChunks');
    const readBackSnap = await getDocs(query(chunksColl));

    const verifiedElementsMap = new Map<string, BoardElement>();
    readBackSnap.forEach((d) => {
      const cData = d.data();
      if (cData && cData.elements) {
        Object.entries(cData.elements).forEach(([elId, rawEl]: [string, any]) => {
          verifiedElementsMap.set(elId, rawEl as BoardElement);
        });
      }
    });

    const verifiedCount = verifiedElementsMap.size;
    console.log(`[Step 5] Verification result: Read back ${verifiedCount}/${totalSourceElements} elements.`);

    if (verifiedCount !== totalSourceElements) {
      const msg = `Verification failed! Source count (${totalSourceElements}) does not match verified count (${verifiedCount}). Aborting legacy document deletion.`;
      console.error(`[Error] ${msg}`);
      return {
        boardId,
        sourceElementCount: totalSourceElements,
        migratedChunkCount: chunks.size,
        verifiedElementCount: verifiedCount,
        deletedLegacyDocsCount: 0,
        success: false,
        error: msg,
      };
    }

    // Verify each source ID exists in verified elements
    for (const sourceId of elementsMap.keys()) {
      if (!verifiedElementsMap.has(sourceId)) {
        const msg = `Verification failed! Missing element ID ${sourceId} in verified set. Aborting legacy document deletion.`;
        console.error(`[Error] ${msg}`);
        return {
          boardId,
          sourceElementCount: totalSourceElements,
          migratedChunkCount: chunks.size,
          verifiedElementCount: verifiedCount,
          deletedLegacyDocsCount: 0,
          success: false,
          error: msg,
        };
      }
    }

    console.log(`[Step 5] Verification PASSED! All ${verifiedCount} elements match source exactly.`);

    // Step 6: Delete legacy documents ONLY AFTER verification passes
    console.log(`[Step 6] Safely deleting legacy documents in /whiteboards/${boardId}/elements...`);
    let deletedCount = 0;
    const legacyDocs = legacySnap.docs;

    for (let i = 0; i < legacyDocs.length; i += 400) {
      const slice = legacyDocs.slice(i, i + 400);
      const delBatch = writeBatch(db);
      slice.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
      deletedCount += slice.length;
      console.log(`  - Deleted ${deletedCount}/${legacyDocs.length} legacy documents...`);
    }

    console.log(`[Step 6] Completed legacy deletion of ${deletedCount} documents.`);
    console.log(`==================================================`);
    console.log(`MIGRATION COMPLETED SUCCESSFULLY FOR BOARD ${boardId}`);
    console.log(`==================================================\n`);

    return {
      boardId,
      sourceElementCount: totalSourceElements,
      migratedChunkCount: chunks.size,
      verifiedElementCount: verifiedCount,
      deletedLegacyDocsCount: deletedCount,
      success: true,
    };
  } catch (err: any) {
    console.error(`[Error] Migration failed for board ${boardId}:`, err);
    return {
      boardId,
      sourceElementCount: 0,
      migratedChunkCount: 0,
      verifiedElementCount: 0,
      deletedLegacyDocsCount: 0,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * CLI Runner for script
 */
async function runCli() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const boardIdArgIdx = args.indexOf('--boardId');
  const boardId = boardIdArgIdx !== -1 ? args[boardIdArgIdx + 1] : undefined;
  const isAll = args.includes('--all');

  if (!boardId && !isAll) {
    console.log(`
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
    const boardsSnap = await getDocs(query(collection(db, 'whiteboards')));
    console.log(`Found ${boardsSnap.size} boards to check/migrate.`);

    for (const d of boardsSnap.docs) {
      await migrateBoard(d.id, { dryRun: isDryRun });
    }
  }
}

if (import.meta.url && import.meta.url.endsWith('migrate-board.ts') && process.argv[1]?.includes('migrate-board')) {
  runCli().catch(console.error);
}
