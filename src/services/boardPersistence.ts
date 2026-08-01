import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  query,
  deleteField,
} from 'firebase/firestore';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { db } from '../firebase';
import { BoardElement } from '../types';
import { isSandboxEnvironment, getSandboxLocalElements, saveSandboxLocalElements } from '../utils/firebaseSandboxGuard';
import { trackOperation } from '../utils/firestoreInstrumentation';

export interface BoardState {
  boardId: string;
  schemaVersion: number;
  currentRevision: number;
  chunkIds: string[];
  totalElements: number;
  elements: BoardElement[];
  isLegacy: boolean;
  migrationRequired: boolean;
  updatedAt: number;
}

export interface MutationItem {
  elementId: string;
  data: BoardElement | null;
  action: 'set' | 'delete';
  generation: number;
  updatedAt: number;
}

export interface RemoteOperation {
  operationId: string;
  clientId: string;
  baseRevision: number;
  elementId: string;
  action: 'set' | 'delete';
  data: BoardElement | null;
  updatedAt: number;
}

interface BoardControl {
  boardId: string;
  pendingMutations: Map<string, MutationItem>;
  dirtyGeneration: number;
  committedGeneration: number;
  isFlushInProgress: boolean;
  flushPromise: Promise<void> | null;
  nextFlushRequested: boolean;
  idleTimer: any;
  maxTimer: any;
  firstMutationTime: number | null;
  lastAppliedRevision: number;
  unsubscribers: (() => void)[];
  currentElementsMap: Map<string, BoardElement>;
  chunksMap: Map<string, Map<string, BoardElement>>;
  elementChunkMap: Map<string, string>;
  chunkIdsList: string[];
  appliedOperationIds: Set<string>;
}

const activeControls = new Map<string, BoardControl>();

const IDLE_FLUSH_DELAY = 2000;
const MAX_FLUSH_INTERVAL = 10000;
export const TARGET_CHUNK_SIZE_BYTES = 250000; // ~250KB max per chunk
export const MAX_SINGLE_ELEMENT_BYTES = 250000;

function getOrCreateControl(boardId: string): BoardControl {
  let control = activeControls.get(boardId);
  if (!control) {
    control = {
      boardId,
      pendingMutations: new Map(),
      dirtyGeneration: 0,
      committedGeneration: 0,
      isFlushInProgress: false,
      flushPromise: null,
      nextFlushRequested: false,
      idleTimer: null,
      maxTimer: null,
      firstMutationTime: null,
      lastAppliedRevision: 0,
      unsubscribers: [],
      currentElementsMap: new Map(),
      chunksMap: new Map(),
      elementChunkMap: new Map(),
      chunkIdsList: [],
      appliedOperationIds: new Set(),
    };
    activeControls.set(boardId, control);
  }
  return control;
}

/**
 * Sanitize element objects for Firestore (removes undefined values recursively)
 */
export function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      clean[key] = sanitizeForFirestore(val);
    }
  }
  return clean;
}

/**
 * High performance point simplification to reduce freehand stroke payload sizes
 */
export function simplifyPoints(points: { x: number; y: number }[], tolerance: number = 1.2): { x: number; y: number }[] {
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

/**
 * Partition elements into size-aware chunks
 */
export function partitionElementsIntoChunks(
  input: Map<string, BoardElement> | BoardElement[],
  maxSizeBytes: number = TARGET_CHUNK_SIZE_BYTES
): Map<string, Record<string, any>> {
  const elementsMap = input instanceof Map 
    ? input 
    : new Map((input || []).map(el => [el.id, el]));

  const chunks = new Map<string, Record<string, any>>();
  let currentChunkIndex = 0;
  let currentChunkId = `chunk_${currentChunkIndex}`;
  let currentChunkData: Record<string, any> = {};
  let currentChunkBytes = 0;

  for (const [id, rawEl] of elementsMap.entries()) {
    let el = sanitizeForFirestore(rawEl);
    if (el.type === 'drawing' && Array.isArray(el.points)) {
      el = { ...el, points: simplifyPoints(el.points, 1.2) };
    }

    const jsonString = JSON.stringify(el);
    const byteSize = jsonString.length * 2;

    if (byteSize > MAX_SINGLE_ELEMENT_BYTES) {
      console.warn(`Element ${id} size (${byteSize} bytes) exceeds maximum single element limit!`);
    }

    if (currentChunkBytes + byteSize > maxSizeBytes && Object.keys(currentChunkData).length > 0) {
      chunks.set(currentChunkId, currentChunkData);
      currentChunkIndex++;
      currentChunkId = `chunk_${currentChunkIndex}`;
      currentChunkData = {};
      currentChunkBytes = 0;
    }

    currentChunkData[id] = el;
    currentChunkBytes += byteSize;
  }

  if (Object.keys(currentChunkData).length > 0 || chunks.size === 0) {
    chunks.set(currentChunkId, currentChunkData);
  }

  return chunks;
}

/**
 * Loads board state once without querying legacy /elements collection.
 */
export async function loadBoardState(boardId: string): Promise<BoardState> {
  if (isSandboxEnvironment()) {
    const local = getSandboxLocalElements(boardId);
    return {
      boardId,
      schemaVersion: 2,
      currentRevision: 1,
      chunkIds: ['chunk_0'],
      totalElements: local.length,
      elements: local,
      isLegacy: false,
      migrationRequired: false,
      updatedAt: Date.now(),
    };
  }

  const boardRef = doc(db, 'whiteboards', boardId);
  trackOperation('read', 'board-initial-load', 1);
  const boardSnap = await getDoc(boardRef);

  if (!boardSnap.exists()) {
    return {
      boardId,
      schemaVersion: 2,
      currentRevision: 0,
      chunkIds: [],
      totalElements: 0,
      elements: [],
      isLegacy: false,
      migrationRequired: false,
      updatedAt: Date.now(),
    };
  }

  const boardData = boardSnap.data();
  const schemaVersion = boardData.schemaVersion || 1;
  const migrationStatus = boardData.migrationStatus;

  // Modern client NEVER queries legacy /elements collection
  if (schemaVersion < 2 || migrationStatus === 'pending') {
    return {
      boardId,
      schemaVersion,
      currentRevision: 0,
      chunkIds: [],
      totalElements: 0,
      elements: [],
      isLegacy: true,
      migrationRequired: true,
      updatedAt: boardData.updatedAt || Date.now(),
    };
  }

  // Modern stateChunks loading
  const chunksColl = collection(db, 'whiteboards', boardId, 'stateChunks');
  trackOperation('read', 'board-initial-load', 1);
  const chunksSnap = await getDocs(query(chunksColl));

  const validChunkIds = new Set(boardData.chunkIds || []);
  const elementsMap = new Map<string, BoardElement>();

  chunksSnap.forEach((docSnap) => {
    // Read ONLY chunks listed in current manifest chunkIds
    if (validChunkIds.has(docSnap.id)) {
      const chunkData = docSnap.data();
      if (chunkData && chunkData.elements) {
        Object.entries(chunkData.elements).forEach(([elId, rawEl]: [string, any]) => {
          if (rawEl && typeof rawEl === 'object') {
            elementsMap.set(elId, { id: elId, ...rawEl } as BoardElement);
          }
        });
      }
    }
  });

  const elements = Array.from(elementsMap.values());

  return {
    boardId,
    schemaVersion: 2,
    currentRevision: boardData.currentRevision || 1,
    chunkIds: boardData.chunkIds || [],
    totalElements: elements.length,
    elements,
    isLegacy: false,
    migrationRequired: false,
    updatedAt: boardData.updatedAt || Date.now(),
  };
}

/**
 * Subscribes to board state changes.
 * ZERO queries or writes to legacy /elements collection.
 */
export function subscribeToBoardState(
  boardId: string,
  callback: (state: BoardState) => void
): () => void {
  const control = getOrCreateControl(boardId);

  if (isSandboxEnvironment()) {
    const local = getSandboxLocalElements(boardId);
    callback({
      boardId,
      schemaVersion: 2,
      currentRevision: 1,
      chunkIds: ['chunk_0'],
      totalElements: local.length,
      elements: local,
      isLegacy: false,
      migrationRequired: false,
      updatedAt: Date.now(),
    });

    const handleSandboxUpdate = (e: CustomEvent) => {
      if (e.detail && e.detail.boardId === boardId) {
        const updated = getSandboxLocalElements(boardId);
        callback({
          boardId,
          schemaVersion: 2,
          currentRevision: 1,
          chunkIds: ['chunk_0'],
          totalElements: updated.length,
          elements: updated,
          isLegacy: false,
          migrationRequired: false,
          updatedAt: Date.now(),
        });
      }
    };

    window.addEventListener('lucid_spark_elements_updated', handleSandboxUpdate as EventListener);
    const unsub = () => {
      window.removeEventListener('lucid_spark_elements_updated', handleSandboxUpdate as EventListener);
    };
    control.unsubscribers.push(unsub);
    return unsub;
  }

  // 1. Listen to board manifest
  const boardRef = doc(db, 'whiteboards', boardId);
  let boardMeta = {
    schemaVersion: 2,
    currentRevision: 0,
    chunkIds: [] as string[],
    migrationStatus: 'complete',
    updatedAt: Date.now(),
  };

  const unsubBoard = onSnapshot(
    boardRef,
    (snap) => {
      trackOperation('read', 'board-listener-update', 1);
      if (!snap.exists()) return;
      const data = snap.data();
      boardMeta = {
        schemaVersion: data.schemaVersion || 1,
        currentRevision: data.currentRevision || 0,
        chunkIds: data.chunkIds || [],
        migrationStatus: data.migrationStatus || (data.schemaVersion >= 2 ? 'complete' : 'pending'),
        updatedAt: data.updatedAt || Date.now(),
      };

      control.chunkIdsList = boardMeta.chunkIds;

      if (boardMeta.schemaVersion < 2 || boardMeta.migrationStatus === 'pending') {
        callback({
          boardId,
          schemaVersion: boardMeta.schemaVersion,
          currentRevision: 0,
          chunkIds: [],
          totalElements: 0,
          elements: [],
          isLegacy: true,
          migrationRequired: true,
          updatedAt: boardMeta.updatedAt,
        });
      }
    },
    (err) => console.error('Error in board manifest snapshot:', err)
  );

  // 2. Listen to stateChunks subcollection
  const chunksColl = collection(db, 'whiteboards', boardId, 'stateChunks');
  const unsubChunks = onSnapshot(
    chunksColl,
    (snapshot) => {
      trackOperation('read', 'board-listener-update', snapshot.docChanges().length || 1);

      if (boardMeta.schemaVersion < 2 || boardMeta.migrationStatus === 'pending') {
        return;
      }

      const validChunkIds = new Set(boardMeta.chunkIds);
      let chunksChanged = false;

      snapshot.docChanges().forEach((change) => {
        const chunkId = change.doc.id;
        
        // Ignore stale chunks not in current manifest chunkIds
        if (!validChunkIds.has(chunkId)) {
          if (control.chunksMap.has(chunkId)) {
            control.chunksMap.delete(chunkId);
            chunksChanged = true;
          }
          return;
        }

        if (change.type === 'removed') {
          if (control.chunksMap.has(chunkId)) {
            control.chunksMap.delete(chunkId);
            chunksChanged = true;
          }
        } else {
          const docData = change.doc.data();
          const chunkElements = new Map<string, BoardElement>();
          if (docData && docData.elements) {
            Object.entries(docData.elements).forEach(([elId, rawEl]: [string, any]) => {
              if (rawEl && typeof rawEl === 'object') {
                chunkElements.set(elId, { id: elId, ...rawEl } as BoardElement);
              }
            });
          }
          control.chunksMap.set(chunkId, chunkElements);
          chunksChanged = true;
        }
      });

      if (chunksChanged || snapshot.empty) {
        // Flatten ONLY chunks listed in validChunkIds
        const flattened = new Map<string, BoardElement>();
        control.elementChunkMap.clear();

        validChunkIds.forEach((cId) => {
          const chunkElements = control.chunksMap.get(cId);
          if (chunkElements) {
            chunkElements.forEach((el, id) => {
              // Remote snapshot merging: do not overwrite local pending uncommitted mutations
              const pending = control.pendingMutations.get(id);
              if (pending) {
                if (pending.action === 'set' && pending.data) {
                  flattened.set(id, pending.data);
                }
                // If pending delete, do not set
              } else {
                flattened.set(id, el);
              }
              control.elementChunkMap.set(id, cId);
            });
          }
        });

        // Add any locally added elements that are pending
        control.pendingMutations.forEach((item, id) => {
          if (item.action === 'set' && item.data) {
            flattened.set(id, item.data);
          } else if (item.action === 'delete') {
            flattened.delete(id);
          }
        });

        control.currentElementsMap = flattened;
        const elementsList = Array.from(flattened.values());

        // Cache locally in IndexedDB
        try {
          idbSet(`board_elements_${boardId}`, {
            revision: boardMeta.currentRevision,
            elements: elementsList,
          }).catch(() => {});
        } catch (_) {}

        callback({
          boardId,
          schemaVersion: boardMeta.schemaVersion,
          currentRevision: boardMeta.currentRevision,
          chunkIds: boardMeta.chunkIds,
          totalElements: elementsList.length,
          elements: elementsList,
          isLegacy: false,
          migrationRequired: false,
          updatedAt: boardMeta.updatedAt,
        });
      }
    },
    (err) => console.error('Error in stateChunks snapshot:', err)
  );

  const cleanup = () => {
    unsubBoard();
    unsubChunks();
  };

  control.unsubscribers.push(cleanup);
  return cleanup;
}

/**
 * Queue an element mutation (set or delete).
 * Coalesces repeated updates in memory and schedules checkpoint flushes.
 */
export function queueElementMutation(
  boardId: string,
  elementId: string,
  data: BoardElement | null,
  action: 'set' | 'delete' = 'set'
): void {
  const control = getOrCreateControl(boardId);

  // Validate single element size limit
  if (action === 'set' && data) {
    let sanitized = sanitizeForFirestore(data);
    if (sanitized.type === 'drawing' && Array.isArray(sanitized.points)) {
      sanitized = { ...sanitized, points: simplifyPoints(sanitized.points, 1.2) };
    }
    const byteSize = JSON.stringify(sanitized).length * 2;
    if (byteSize > MAX_SINGLE_ELEMENT_BYTES) {
      console.error(`Element ${elementId} (${byteSize} bytes) exceeds max single element size limit!`);
      throw new Error(`Element exceeds maximum allowable size per chunk (${MAX_SINGLE_ELEMENT_BYTES} bytes).`);
    }
  }

  control.dirtyGeneration++;

  control.pendingMutations.set(elementId, {
    elementId,
    data: data ? sanitizeForFirestore(data) : null,
    action,
    generation: control.dirtyGeneration,
    updatedAt: Date.now(),
  });

  // Update in-memory state immediately for instant UI feedback
  if (action === 'delete') {
    control.currentElementsMap.delete(elementId);
  } else if (data) {
    let el = sanitizeForFirestore(data);
    if (el.type === 'drawing' && Array.isArray(el.points)) {
      el = { ...el, points: simplifyPoints(el.points, 1.2) };
    }
    control.currentElementsMap.set(elementId, el);
  }

  if (isSandboxEnvironment()) {
    saveSandboxLocalElements(boardId, Array.from(control.currentElementsMap.values()));
    return;
  }

  // Schedule debounced flush
  if (!control.firstMutationTime) {
    control.firstMutationTime = Date.now();
  }

  if (control.idleTimer) clearTimeout(control.idleTimer);
  control.idleTimer = setTimeout(() => {
    flushBoardCheckpoint(boardId, 'idle-debounce');
  }, IDLE_FLUSH_DELAY);

  const elapsed = Date.now() - (control.firstMutationTime || Date.now());
  if (elapsed >= MAX_FLUSH_INTERVAL && !control.maxTimer) {
    control.maxTimer = setTimeout(() => {
      flushBoardCheckpoint(boardId, 'max-interval');
    }, MAX_FLUSH_INTERVAL - elapsed);
  }
}

/**
 * Apply a remote WebSocket operation preview in memory without marking it as a local pending mutation.
 */
export function applyRemoteOperation(boardId: string, op: RemoteOperation): void {
  const control = getOrCreateControl(boardId);
  if (control.appliedOperationIds.has(op.operationId)) {
    return; // Deduplicate
  }
  control.appliedOperationIds.add(op.operationId);
  if (control.appliedOperationIds.size > 2000) {
    const oldest = Array.from(control.appliedOperationIds).slice(0, 500);
    oldest.forEach((id) => control.appliedOperationIds.delete(id));
  }

  // If local uncommitted mutation exists for this element, local mutation takes precedence
  if (control.pendingMutations.has(op.elementId)) {
    return;
  }

  if (op.action === 'delete') {
    control.currentElementsMap.delete(op.elementId);
  } else if (op.data) {
    control.currentElementsMap.set(op.elementId, op.data);
  }
}

/**
 * Flushes pending mutations to Firestore stateChunks using concurrency-safe transactions.
 * Rewrites ONLY affected chunks and updates manifest revision atomically.
 */
export async function flushBoardCheckpoint(boardId: string, reason: string = 'manual'): Promise<void> {
  const control = getOrCreateControl(boardId);

  if (isSandboxEnvironment()) {
    control.pendingMutations.clear();
    control.committedGeneration = control.dirtyGeneration;
    return;
  }

  if (control.pendingMutations.size === 0) {
    return;
  }

  if (control.isFlushInProgress) {
    control.nextFlushRequested = true;
    return control.flushPromise || Promise.resolve();
  }

  control.isFlushInProgress = true;
  if (control.idleTimer) clearTimeout(control.idleTimer);
  if (control.maxTimer) clearTimeout(control.maxTimer);
  control.idleTimer = null;
  control.maxTimer = null;
  control.firstMutationTime = null;

  const committingGeneration = control.dirtyGeneration;
  const mutationsSnapshot = new Map(control.pendingMutations);

  const executeFlush = async () => {
    try {
      const currentElements = new Map(control.currentElementsMap);

      // Incremental stable chunk partitioning
      const partitionResult = partitionElementsIntoChunks(currentElements);
      const newChunkIds = Array.from(partitionResult.keys());

      // Use runTransaction for concurrency-safe atomic manifest & chunk commit
      await runTransaction(db, async (transaction) => {
        const boardRef = doc(db, 'whiteboards', boardId);
        const boardSnap = await transaction.get(boardRef);

        const currentRev = boardSnap.exists() ? boardSnap.data().currentRevision || 0 : 0;
        const nextRevision = currentRev + 1;

        let totalOps = 1;

        // Write updated stateChunks
        partitionResult.forEach((chunkData, chunkId) => {
          const chunkRef = doc(db, 'whiteboards', boardId, 'stateChunks', chunkId);
          // Complete document overwrite (merge: false) ensures removed nested keys do not survive!
          transaction.set(chunkRef, {
            chunkId,
            elements: chunkData,
            elementCount: Object.keys(chunkData).length,
            updatedAt: Date.now(),
          });
          totalOps++;
        });

        // Delete stale chunks removed from manifest
        const oldChunkIds = boardSnap.exists() ? (boardSnap.data().chunkIds || []) : [];
        const staleChunkIds = oldChunkIds.filter((id: string) => !partitionResult.has(id));
        staleChunkIds.forEach((staleId: string) => {
          const staleRef = doc(db, 'whiteboards', boardId, 'stateChunks', staleId);
          transaction.delete(staleRef);
          totalOps++;
        });

        // Update board manifest doc
        transaction.set(
          boardRef,
          {
            schemaVersion: 2,
            currentRevision: nextRevision,
            chunkIds: newChunkIds,
            totalElements: currentElements.size,
            migrationStatus: 'complete',
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        trackOperation('write', 'board-checkpoint', totalOps);
        control.lastAppliedRevision = nextRevision;
      });

      control.committedGeneration = Math.max(control.committedGeneration, committingGeneration);

      // Clear only mutations up to captured generation
      for (const [elId, item] of mutationsSnapshot.entries()) {
        const currentPending = control.pendingMutations.get(elId);
        if (currentPending && currentPending.generation <= committingGeneration) {
          control.pendingMutations.delete(elId);
        }
      }
    } catch (err: any) {
      console.error('Flush checkpoint transaction failed:', err);
      throw err;
    }
  };

  control.flushPromise = executeFlush()
    .finally(() => {
      control.isFlushInProgress = false;
      control.flushPromise = null;

      if (control.nextFlushRequested || control.pendingMutations.size > 0) {
        control.nextFlushRequested = false;
        flushBoardCheckpoint(boardId, 'queued-next');
      }
    });

  return control.flushPromise;
}

/**
 * Clean up active persistence controls, timers, and snapshot subscriptions.
 */
export function disposeBoardPersistence(boardId?: string): void {
  if (boardId) {
    const control = activeControls.get(boardId);
    if (control) {
      if (control.idleTimer) clearTimeout(control.idleTimer);
      if (control.maxTimer) clearTimeout(control.maxTimer);
      control.unsubscribers.forEach((unsub) => unsub());
      activeControls.delete(boardId);
    }
  } else {
    activeControls.forEach((control) => {
      if (control.idleTimer) clearTimeout(control.idleTimer);
      if (control.maxTimer) clearTimeout(control.maxTimer);
      control.unsubscribers.forEach((unsub) => unsub());
    });
    activeControls.clear();
  }
}
