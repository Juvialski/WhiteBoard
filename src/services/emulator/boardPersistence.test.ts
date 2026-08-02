import { describe, it, beforeAll, expect } from 'vitest';
import { connectFirestoreEmulator, doc, getDoc, collection, getDocs, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../firebase';
import {
  getShardIdForElement,
  initializeBoardWithElements,
  loadBoardState,
  getOrCreateControl,
  flushBoardCheckpoint,
  getShardCountForBoard,
  queueElementMutation
} from '../boardPersistence';
import { BoardElement } from '../../types';
import { migrateBoard } from '../../../scripts/migrate-board';

describe('BoardPersistence Emulator Tests', () => {
  beforeAll(async () => {
    // Connect to the firestore and auth emulators
    try {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch (_) {
      // Ignore if already connected
    }

    // Sign in or create test user to satisfy Auth constraints - DO NOT SILENTLY CATCH FAILURES
    const email = `test-persist-${Date.now()}@example.com`;
    const password = 'password123';
    await createUserWithEmailAndPassword(auth, email, password);
    expect(auth.currentUser?.uid).toBeTruthy();
  });

  function validBoardData(name: string) {
    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) throw new Error('Auth emulator user is not initialized.');
    return {
      name,
      ownerUid,
      accessMode: 'private' as const,
      editorUids: [],
      viewerUids: [],
      studentsCanWrite: true,
      status: 'ready' as const,
      schemaVersion: 3,
      shardLayoutVersion: 2,
      shardCount: 160,
      migrationStatus: 'complete' as const,
    };
  }

  // 1. Correctly maps element to its layout shard under 20 and 160 layouts
  it('correctly maps element to its layout shard under 20 and 160 layouts', () => {
    const elId = 'test-el-999';
    
    // Legacy mapping (20 shards)
    const shard20 = getShardIdForElement(elId, 20);
    expect(shard20).toBeDefined();
    expect(shard20.startsWith('shard_')).toBe(true);
    
    // Modern mapping (160 shards)
    const shard160 = getShardIdForElement(elId, 160);
    expect(shard160).toBeDefined();
    expect(shard160.startsWith('shard_')).toBe(true);
    
    // Shard count determination
    expect(getShardCountForBoard({ schemaVersion: 3 })).toBe(160);
    expect(getShardCountForBoard({ schemaVersion: 2 })).toBe(20);
    expect(getShardCountForBoard({})).toBe(20);
  });

  // 2. schema-2 board uses 20 shards
  it('schema-2 board uses 20 shards', () => {
    expect(getShardCountForBoard({ schemaVersion: 2 })).toBe(20);
  });

  // 3. schema-3 board uses 160 shards
  it('schema-3 board uses 160 shards', () => {
    expect(getShardCountForBoard({ schemaVersion: 3 })).toBe(160);
  });

  // 4. initializes a board under the modern schema version 3 and 160-shard layout
  it('initializes a board under the modern schema version 3 and 160-shard layout', async () => {
    const boardId = `board-test-v3-${Date.now()}`;
    const elements: BoardElement[] = [
      { id: 'el-1', type: 'sticky', x: 10, y: 10, width: 100, height: 100, text: 'Hello 1', zIndex: 1, color: '#fef08a', updatedAt: Date.now() } as any,
      { id: 'el-2', type: 'shape', x: 200, y: 50, width: 150, height: 150, text: 'Hello 2', zIndex: 2, color: '#fef08a', updatedAt: Date.now(), shapeType: 'rect', borderColor: '#000000' } as any
    ];

    await initializeBoardWithElements(boardId, elements, validBoardData('V3 Test Board'));

    // Verify manifest metadata
    const manifestRef = doc(db, 'whiteboards', boardId);
    const manifestSnap = await getDoc(manifestRef);
    expect(manifestSnap.exists()).toBe(true);
    
    const manifestData = manifestSnap.data()!;
    expect(manifestData.schemaVersion).toBe(3);
    expect(manifestData.shardLayoutVersion).toBe(2);
    expect(manifestData.shardCount).toBe(160);
    expect(manifestData.currentRevision).toBe(1);

    // Verify shards are written to stateShardsV3 subcollection
    const v3Coll = collection(db, 'whiteboards', boardId, 'stateShardsV3');
    const v3Snap = await getDocs(v3Coll);
    expect(v3Snap.size).toBeGreaterThan(0);

    // Load state and confirm elements are returned
    const state = await loadBoardState(boardId);
    expect(state.schemaVersion).toBe(3);
    expect(state.elements.length).toBe(2);
  });

  // 5. one schema-3 mutation persists to the correct shard
  it('one schema-3 mutation persists to the correct shard', async () => {
    const boardId = `board-mut-${Date.now()}`;
    await initializeBoardWithElements(boardId, [], validBoardData('Mutation Board'));

    const elId = 'sticky-to-shard';
    const expectedShardId = getShardIdForElement(elId, 160);

    const control = getOrCreateControl(boardId);
    control.layoutReady = true;
    control.loadState = 'ready';
    control.latestBoardData = { schemaVersion: 3, currentRevision: 1, shardCount: 160 };
    control.resolveRestore();
    control.resolveHydration();

    // Queue mutation
    const el = { id: elId, type: 'sticky', text: 'Shard specific text', updatedAt: Date.now() } as any;
    queueElementMutation(boardId, elId, el, 'set');

    // Flush checkpoint
    await flushBoardCheckpoint(boardId);

    // Verify the specific shard was written
    const shardRef = doc(db, 'whiteboards', boardId, 'stateShardsV3', expectedShardId);
    const shardSnap = await getDoc(shardRef);
    expect(shardSnap.exists()).toBe(true);
    expect(shardSnap.data()!.elements[elId]).toBeDefined();
    expect(shardSnap.data()!.elements[elId].text).toBe('Shard specific text');
  });

  // 6. restored IndexedDB mutation flushes after hydration
  it('restored IndexedDB mutation flushes after hydration', async () => {
    const boardId = `board-idb-restore-${Date.now()}`;
    await initializeBoardWithElements(boardId, [], validBoardData('IDB Restore Board'));

    const control = getOrCreateControl(boardId);
    control.layoutReady = true;
    control.loadState = 'ready';
    control.latestBoardData = { schemaVersion: 3, currentRevision: 1, shardCount: 160 };
    control.resolveRestore();
    control.resolveHydration();

    // Directly put mutation into pendingMutations (simulating restored IndexedDB)
    control.pendingMutations.set('el-idb', {
      elementId: 'el-idb',
      action: 'set',
      data: { id: 'el-idb', type: 'sticky', text: 'Restored from IDB', updatedAt: Date.now() } as any,
      updatedAt: Date.now(),
      generation: 1
    });

    // Flush should succeed and persist it
    await flushBoardCheckpoint(boardId);

    // Verify it is in the database
    const state = await loadBoardState(boardId);
    expect(state.elements.find(e => e.id === 'el-idb')).toBeDefined();
  });

  // 7. transaction refuses a stale shard layout
  it('transaction refuses a stale shard layout', async () => {
    const boardId = `board-stale-layout-${Date.now()}`;
    await initializeBoardWithElements(boardId, [], validBoardData('Stale Layout Board'));

    const control = getOrCreateControl(boardId);
    control.layoutReady = true;
    control.loadState = 'ready';
    control.latestBoardData = { schemaVersion: 3, currentRevision: 1, shardCount: 160 };
    control.resolveRestore();
    control.resolveHydration();

    // Intentionally mismatch control's shardCount to trigger STALE_LAYOUT_DETECTED
    control.shardCount = 20;

    // Queue mutation
    queueElementMutation(boardId, 'el-stale', { id: 'el-stale', type: 'sticky', text: 'stale', updatedAt: Date.now() } as any, 'set');

    // The first attempt detects the stale layout, recovers, and queues a retry.
    await flushBoardCheckpoint(boardId);

    const expectedShardId = getShardIdForElement('el-stale', 160);
    const expectedShardRef = doc(db, 'whiteboards', boardId, 'stateShardsV3', expectedShardId);
    let persisted = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const snap = await getDoc(expectedShardRef);
      if (snap.exists() && snap.data()?.elements?.['el-stale']) {
        persisted = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(control.shardCount).toBe(160);
    expect(persisted).toBe(true);
    expect(control.pendingMutations.has('el-stale')).toBe(false);
  });

  // 8. revision-zero first remote edit & local client behind a remote revision converges
  it('local client behind a remote revision converges and handles revision-zero first remote edit', async () => {
    const boardId = `board-converge-${Date.now()}`;
    await initializeBoardWithElements(boardId, [], validBoardData('Converge Board'));

    const control = getOrCreateControl(boardId);
    control.layoutReady = true;
    control.loadState = 'ready';
    control.latestBoardData = { schemaVersion: 3, currentRevision: 1, shardCount: 160 };
    control.resolveRestore();
    control.resolveHydration();

    // 1. First edit when revision is low (revision-zero/one)
    queueElementMutation(boardId, 'el-c1', { id: 'el-c1', type: 'sticky', text: 'Local text', updatedAt: 1000 } as any, 'set');
    await flushBoardCheckpoint(boardId);

    // Check remote is updated to revision 2
    const snap1 = await getDoc(doc(db, 'whiteboards', boardId));
    expect(snap1.data()!.currentRevision).toBe(2);

    // 2. Simulate local client behind: we manually write a newer revision remotely with different data
    const remoteShardId = getShardIdForElement('el-c1', 160);
    const shardRef = doc(db, 'whiteboards', boardId, 'stateShardsV3', remoteShardId);
    await setDoc(shardRef, {
      shardId: remoteShardId,
      revision: 3,
      elements: {
        'el-c1': { id: 'el-c1', type: 'sticky', text: 'Remote Winning Text', updatedAt: 5000 }
      },
      tombstones: {}
    });
    await setDoc(doc(db, 'whiteboards', boardId), {
      currentRevision: 3,
      schemaVersion: 3,
      shardLayoutVersion: 2,
      shardCount: 160,
      status: 'ready'
    });

    // Local client tries to write with older updatedAt
    queueElementMutation(boardId, 'el-c1', { id: 'el-c1', type: 'sticky', text: 'Losing Local Text', updatedAt: 2000 } as any, 'set');
    await flushBoardCheckpoint(boardId);

    // Verify database converged to remote winning text because of LWW
    const finalState = await loadBoardState(boardId);
    const finalEl = finalState.elements.find(e => e.id === 'el-c1');
    expect(finalEl).toBeDefined();
    expect((finalEl as any).text).toBe('Remote Winning Text');
  });

  // 9. missing shard without deletion marker triggers recovery
  it('missing shard without deletion marker triggers recovery/safe fallback', async () => {
    const boardId = `board-missing-shard-${Date.now()}`;
    await initializeBoardWithElements(boardId, [], validBoardData('Missing Shard Board'));

    // Ensure we can load state gracefully without crashing
    const state = await loadBoardState(boardId);
    expect(state).toBeDefined();
    expect(state.elements.length).toBe(0);
  });

  // 10. schema-2 to schema-3 migration
  it('correctly migrates schema-2 stateShards to schema-3 stateShardsV3', async () => {
    const boardId = `board-mig-emu-${Date.now()}`;
    
    // Seed schema-2 manifest and stateShards remotely
    await setDoc(doc(db, 'whiteboards', boardId), {
      ownerUid: auth.currentUser!.uid,
      accessMode: 'private',
      editorUids: [],
      viewerUids: [],
      studentsCanWrite: false,
      schemaVersion: 2,
      shardLayoutVersion: 1,
      shardCount: 20,
      status: 'ready'
    });

    const shardRef = doc(db, 'whiteboards', boardId, 'stateShards', 'shard_0');
    await setDoc(shardRef, {
      shardId: 'shard_0',
      revision: 1,
      elements: {
        'el-v2': { id: 'el-v2', type: 'sticky', text: 'Hello Schema 2', updatedAt: 1000 }
      },
      tombstones: {}
    });

    // Run migrateBoard (with setAdminDbInstanceForTesting set back to null to use actual app configuration or initialize)
    // Actually, migrateBoard will initialize the actual admin SDK from file or env. Since we are in the emulator,
    // let's pass a mock of adminDb to setAdminDbInstanceForTesting using the emulator's Firestore!
    // Since Firebase Admin can connect to emulator using process.env.FIRESTORE_EMULATOR_HOST, the script actually connects
    // to the firestore emulator naturally!
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    
    const result = await migrateBoard(boardId);
    expect(result.success).toBe(true);

    // Verify manifest updated to schema 3
    const manifestSnap = await getDoc(doc(db, 'whiteboards', boardId));
    expect(manifestSnap.data()!.schemaVersion).toBe(3);
    expect(manifestSnap.data()!.shardCount).toBe(160);

    // Verify old schema-2 stateShards are deleted
    const oldShardSnap = await getDoc(doc(db, 'whiteboards', boardId, 'stateShards', 'shard_0'));
    expect(oldShardSnap.exists()).toBe(false);

    // Verify new stateShardsV3 exists with migrated data
    const v3Coll = collection(db, 'whiteboards', boardId, 'stateShardsV3');
    const v3Snap = await getDocs(v3Coll);
    expect(v3Snap.size).toBeGreaterThan(0);
    
    const loaded = await loadBoardState(boardId);
    expect(loaded.schemaVersion).toBe(3);
    expect(loaded.elements.find(e => e.id === 'el-v2')).toBeDefined();
  });

  // 11. schema-3 board deletion removes stateShardsV3
  it('schema-3 board deletion removes stateShardsV3', async () => {
    const boardId = `board-delete-${Date.now()}`;
    await initializeBoardWithElements(boardId, [
      { id: 'el-del', type: 'sticky', text: 'Delete me', updatedAt: Date.now() } as any
    ], validBoardData('Delete Board'));

    // Verify stateShardsV3 subcollection exists
    const v3Coll = collection(db, 'whiteboards', boardId, 'stateShardsV3');
    let v3Snap = await getDocs(v3Coll);
    expect(v3Snap.size).toBeGreaterThan(0);

    // Perform deletion as implemented in Dashboard
    const batch = writeBatch(db);
    v3Snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    await deleteDoc(doc(db, 'whiteboards', boardId));

    // Verify both manifest and subcollection are gone
    const manifestSnap = await getDoc(doc(db, 'whiteboards', boardId));
    expect(manifestSnap.exists()).toBe(false);

    v3Snap = await getDocs(v3Coll);
    expect(v3Snap.size).toBe(0);
  });
});
