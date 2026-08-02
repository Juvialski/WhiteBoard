import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

// Safe 45-day default minimum retention threshold for tombstones
const DEFAULT_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

async function compactBoardTombstonesInColl(
  boardId: string,
  collName: string,
  retentionMs: number
): Promise<{ processed: number; pruned: number; shardsUpdated: number }> {
  let processed = 0;
  let pruned = 0;
  let shardsUpdated = 0;

  const now = Date.now();
  const shardsColl = db.collection('whiteboards').doc(boardId).collection(collName);
  const shardsSnap = await shardsColl.get();

  for (const shardDoc of shardsSnap.docs) {
    const sData = shardDoc.data() || {};
    const elements = sData.elements || {};
    const tombstones = sData.tombstones || {};

    let shardPruned = 0;
    const nextTombstones: Record<string, any> = {};

    Object.entries(tombstones).forEach(([elId, tomb]: [string, any]) => {
      processed++;
      const updatedAt = Number(tomb?.updatedAt || 0);
      const age = now - updatedAt;

      if (age > retentionMs) {
        // Tombstone is older than retention period, prune it!
        pruned++;
        shardPruned++;
      } else {
        nextTombstones[elId] = tomb;
      }
    });

    if (shardPruned > 0) {
      await db.runTransaction(async (transaction) => {
        const shardRef = shardDoc.ref;
        const currentSnap = await transaction.get(shardRef);
        if (currentSnap.exists) {
          const currentData = currentSnap.data() || {};
          const currentElements = currentData.elements || {};
          const currentTombstones = currentData.tombstones || {};

          // Recalculate tombstones inside transaction to prevent concurrency issues
          const finalTombstones: Record<string, any> = {};
          Object.entries(currentTombstones).forEach(([id, tomb]: [string, any]) => {
            const upAt = Number(tomb?.updatedAt || 0);
            if (now - upAt <= retentionMs) {
              finalTombstones[id] = tomb;
            }
          });

          // Check if elements count and tombstones count are both 0. If so, delete the shard doc to save database size!
          if (Object.keys(currentElements).length === 0 && Object.keys(finalTombstones).length === 0) {
            transaction.delete(shardRef);
          } else {
            transaction.set(shardRef, {
              ...currentData,
              tombstones: finalTombstones,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      });
      shardsUpdated++;
    }
  }

  return { processed, pruned, shardsUpdated };
}

async function compactBoardTombstones(
  boardId: string,
  retentionMs: number
): Promise<{ processed: number; pruned: number; shardsUpdated: number }> {
  // Enforce compaction across both legacy (stateShards) and modern (stateShardsV3) subcollections
  const legacyStats = await compactBoardTombstonesInColl(boardId, 'stateShards', retentionMs);
  const modernStats = await compactBoardTombstonesInColl(boardId, 'stateShardsV3', retentionMs);

  return {
    processed: legacyStats.processed + modernStats.processed,
    pruned: legacyStats.pruned + modernStats.pruned,
    shardsUpdated: legacyStats.shardsUpdated + modernStats.shardsUpdated,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let retentionDays = 45;
  let targetBoardId: string | null = null;

  // Simple argument parser
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      retentionDays = Number(args[i + 1]) || 45;
      i++;
    } else if (args[i] === '--board' && args[i + 1]) {
      targetBoardId = args[i + 1];
      i++;
    }
  }

  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  console.log(`Starting Tombstone Compactor...`);
  console.log(`Retention Period: ${retentionDays} days (${retentionMs} ms)\n`);

  let totalProcessed = 0;
  let totalPruned = 0;
  let totalShardsUpdated = 0;

  if (targetBoardId) {
    console.log(`Compacting tombstones on board: ${targetBoardId}...`);
    try {
      const stats = await compactBoardTombstones(targetBoardId, retentionMs);
      totalProcessed += stats.processed;
      totalPruned += stats.pruned;
      totalShardsUpdated += stats.shardsUpdated;
    } catch (err: any) {
      console.error(`Error processing board ${targetBoardId}:`, err.message);
    }
  } else {
    console.log(`Scanning all whiteboards...`);
    const boardsSnap = await db.collection('whiteboards').get();
    console.log(`Found ${boardsSnap.size} boards.`);

    for (const boardDoc of boardsSnap.docs) {
      const boardId = boardDoc.id;
      console.log(`Processing board: ${boardId}...`);
      try {
        const stats = await compactBoardTombstones(boardId, retentionMs);
        totalProcessed += stats.processed;
        totalPruned += stats.pruned;
        totalShardsUpdated += stats.shardsUpdated;
        if (stats.pruned > 0) {
          console.log(` -> Pruned ${stats.pruned}/${stats.processed} tombstones across ${stats.shardsUpdated} shards.`);
        }
      } catch (err: any) {
        console.error(`Error processing board ${boardId}:`, err.message);
      }
    }
  }

  console.log(`\nCompaction complete!`);
  console.log(`Total tombstones scanned: ${totalProcessed}`);
  console.log(`Total tombstones pruned:  ${totalPruned}`);
  console.log(`Total shards updated:     ${totalShardsUpdated}`);
}

main().catch((err) => {
  console.error('Fatal compactor error:', err);
  process.exit(1);
});
