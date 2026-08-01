import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  query,
} from 'firebase/firestore';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { db } from '../firebase';
import { BoardElement, Whiteboard } from '../types';
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
}

const activeControls = new Map<string, BoardControl>();

const IDLE_FLUSH_DELAY = 2000;
const MAX_FLUSH_INTERVAL = 10000;
const TARGET_CHUNK_SIZE_BYTES = 250000; // ~250KB per chunk

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
    };
    activeControls.set(boardId, control);
  }
  return control;
}

/**
 * Sanitize element objects for Firestore (removes undefined values)
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
 * High performance point simplification to reduce stroke coordinate payload sizes
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
 * Chunk board elements size-awarely into deterministic state chunks
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
    const byteSize = jsonString.length * 2; // rough byte estimate

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
 * Loads board state once (reads manifest doc and stateChunks).
 * NEVER performs automatic migration writes or mass deletes.
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

  // Check if legacy board format
  if (schemaVersion < 2) {
    const legacyColl = collection(db, 'whiteboards', boardId, 'elements');
    trackOperation('read', 'legacy-check', 1);
    const legacySnap = await getDocs(query(legacyColl));
    if (!legacySnap.empty) {
      return {
        boardId,
        schemaVersion: 1,
        currentRevision: 0,
        chunkIds: [],
        totalElements: legacySnap.size,
        elements: [],
        isLegacy: true,
        migrationRequired: true,
        updatedAt: boardData.updatedAt || Date.now(),
      };
    }
  }

  // Modern stateChunks loading
  const chunksColl = collection(db, 'whiteboards', boardId, 'stateChunks');
  trackOperation('read', 'board-initial-load', 1);
  const chunksSnap = await getDocs(query(chunksColl));

  const elementsMap = new Map<string, BoardElement>();
  chunksSnap.forEach((docSnap) => {
    const chunkData = docSnap.data();
    if (chunkData && chunkData.elements) {
      Object.entries(chunkData.elements).forEach(([elId, rawEl]: [string, any]) => {
        if (rawEl && typeof rawEl === 'object') {
          elementsMap.set(elId, { id: elId, ...rawEl } as BoardElement);
        }
      });
    }
  });

  const elements = Array.from(elementsMap.values());

  return {
    boardId,
    schemaVersion: 2,
    currentRevision: boardData.currentRevision || 1,
    chunkIds: boardData.chunkIds || Array.from(chunksSnap.docs.map((d) => d.id)),
    totalElements: elements.length,
    elements,
    isLegacy: false,
    migrationRequired: false,
    updatedAt: boardData.updatedAt || Date.now(),
  };
}

/**
 * Subscribes to board state changes via Firestore stateChunks.
 * Processes snapshot docChanges() incrementally and detects legacy boards.
 * Performs ZERO migration writes or deletes.
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

  // 1. Listen to board manifest document
  const boardRef = doc(db, 'whiteboards', boardId);
  let boardMeta = {
    schemaVersion: 2,
    currentRevision: 0,
    chunkIds: [] as string[],
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
        updatedAt: data.updatedAt || Date.now(),
      };

      if (boardMeta.schemaVersion < 2) {
        // If legacy board, verify if legacy elements exist
        const legacyColl = collection(db, 'whiteboards', boardId, 'elements');
        getDocs(query(legacyColl))
          .then((legacySnap) => {
            trackOperation('read', 'legacy-check', legacySnap.size);
            if (!legacySnap.empty) {
              callback({
                boardId,
                schemaVersion: 1,
                currentRevision: 0,
                chunkIds: [],
                totalElements: legacySnap.size,
                elements: [],
                isLegacy: true,
                migrationRequired: true,
                updatedAt: boardMeta.updatedAt,
              });
            }
          })
          .catch((err) => console.error('Error checking legacy elements:', err));
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

      // Do not overwrite client state if local pending mutations are being committed
      if (control.pendingMutations.size > 0 && control.dirtyGeneration > control.committedGeneration) {
        return;
      }

      let chunksChanged = false;

      snapshot.docChanges().forEach((change) => {
        const chunkId = change.doc.id;
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
        const flattened = new Map<string, BoardElement>();
        control.chunksMap.forEach((chunkElements) => {
          chunkElements.forEach((el, id) => {
            flattened.set(id, el);
          });
        });

        control.currentElementsMap = flattened;
        const elementsList = Array.from(flattened.values());

        // Cache locally to IndexedDB asynchronously
        try {
          idbSet(`board_elements_${boardId}`, elementsList).catch(() => {});
        } catch (_) {}

        callback({
          boardId,
          schemaVersion: boardMeta.schemaVersion,
          currentRevision: boardMeta.currentRevision,
          chunkIds: boardMeta.chunkIds,
          totalElements: elementsList.length,
          elements: elementsList,
          isLegacy: boardMeta.schemaVersion < 2 && snapshot.empty,
          migrationRequired: boardMeta.schemaVersion < 2 && snapshot.empty,
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
 * Coalesces repeated updates to the same element in memory and schedules controlled checkpoint flushes.
 */
export function queueElementMutation(
  boardId: string,
  elementId: string,
  data: BoardElement | null,
  action: 'set' | 'delete' = 'set'
): void {
  const control = getOrCreateControl(boardId);
  control.dirtyGeneration++;

  control.pendingMutations.set(elementId, {
    elementId,
    data: data ? sanitizeForFirestore(data) : null,
    action,
    generation: control.dirtyGeneration,
  });

  // Update in-memory board state immediately
  if (action === 'delete') {
    control.currentElementsMap.delete(elementId);
  } else if (data) {
    control.currentElementsMap.set(elementId, data);
  }

  // Update local sandbox or localStorage cache
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
    flushBoardCheckpoint(boardId, 'max-interval');
  }
}

/**
 * Flushes pending element mutations to Firestore stateChunks in controlled checkpoints.
 * Uses mutex guard (isFlushInProgress), queue generations, and exponential backoff retry.
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
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 1000;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const currentElements = new Map(control.currentElementsMap);

        // Partition elements into size-aware stateChunks
        const chunkMap = partitionElementsIntoChunks(currentElements);
        const chunkIds = Array.from(chunkMap.keys());

        const batch = writeBatch(db);
        let batchOps = 0;

        // Write stateChunks
        chunkMap.forEach((chunkData, chunkId) => {
          const chunkRef = doc(db, 'whiteboards', boardId, 'stateChunks', chunkId);
          batch.set(
            chunkRef,
            {
              chunkId,
              elements: chunkData,
              elementCount: Object.keys(chunkData).length,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
          batchOps++;
        });

        // Update board manifest document
        const boardRef = doc(db, 'whiteboards', boardId);
        const nextRevision = (control.lastAppliedRevision || 0) + 1;
        batch.set(
          boardRef,
          {
            schemaVersion: 2,
            currentRevision: nextRevision,
            chunkIds,
            totalElements: currentElements.size,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        batchOps++;

        trackOperation('write', 'board-checkpoint', batchOps);
        await batch.commit();

        control.lastAppliedRevision = nextRevision;
        control.committedGeneration = Math.max(control.committedGeneration, committingGeneration);

        // Clear only committed mutations up to captured generation
        for (const [elId, item] of mutationsSnapshot.entries()) {
          const currentPending = control.pendingMutations.get(elId);
          if (currentPending && currentPending.generation <= committingGeneration) {
            control.pendingMutations.delete(elId);
          }
        }

        break; // Success
      } catch (err: any) {
        console.error(`Flush checkpoint failed (attempt ${attempts}/${maxAttempts}):`, err);
        if (attempts >= maxAttempts) {
          throw err;
        }
        await new Promise((res) => setTimeout(res, delay));
        delay = Math.min(delay * 2, 16000); // Bounded exponential backoff
      }
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
 * Dispose and clean up active subscriptions and timers for a board
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
