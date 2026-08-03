import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  query,
} from 'firebase/firestore';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

function safeIdbGet(key: string): Promise<any> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return idbGet(key).catch(() => null);
}

function safeIdbSet(key: string, val: any): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return idbSet(key, val).catch(() => {});
}

function safeIdbDel(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return idbDel(key).catch(() => {});
}

import { signInAnonymously } from 'firebase/auth';
import { db, auth, authPersistenceReady } from '../firebase';
import { BoardElement } from '../types';
import { isSandboxEnvironment, getSandboxLocalElements, saveSandboxLocalElements } from '../utils/firebaseSandboxGuard';
import { trackOperation } from '../utils/firestoreInstrumentation';

export type BoardLoadState = 'idle' | 'loading-manifest' | 'loading-shards' | 'ready' | 'error';

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
  boardData?: any;
  loadState?: BoardLoadState;
}

export const SHARD_COUNT = 160;
export const MAX_STATE_SHARD_DOCUMENT_BYTES = 700_000;
export const TARGET_CHUNK_SIZE_BYTES = 250000;
export const MAX_SINGLE_ELEMENT_BYTES = 250000;

// Legacy boards are loaded read-only. Cache the in-flight/completed read for the
// current browser session so loadBoardState() and the manifest listener cannot
// repeat the same historical collection scans. No browser-side migration writes
// are allowed.
const legacyReadInFlight = new Map<string, Promise<BoardElement[]>>();
const legacyReadCache = new Map<string, BoardElement[]>();

export function getShardCountForBoard(boardData: any): number {
  if (!boardData) return 20;
  if (boardData.shardCount !== undefined) {
    return Number(boardData.shardCount);
  }
  if (boardData.shardLayoutVersion === 2 || boardData.schemaVersion === 3) {
    return 160;
  }
  return 20;
}

function isLegacyBoardData(boardData: any): boolean {
  const schemaVersion = Number(boardData?.schemaVersion ?? 1);
  const migrationStatus = boardData?.migrationStatus;
  const usesHistoricalStateChunks =
    schemaVersion < 3 &&
    Array.isArray(boardData?.chunkIds) &&
    boardData.chunkIds.length > 0;

  return (
    schemaVersion < 2 ||
    migrationStatus === 'pending' ||
    migrationStatus === 'in-progress' ||
    usesHistoricalStateChunks
  );
}

/**
 * Asserts that an element contains no inline base64 or blob binary payloads.
 */
export function assertNoInlineBinaryPayload(element: any): void {
  function check(val: any, path: string): void {
    if (!val) return;
    if (typeof val === 'string') {
      if (val.includes('data:image/') || val.includes('data:audio/') || val.includes(';base64,') || val.startsWith('blob:')) {
        throw new Error(`Inline base64/blob string detected on field '${path}' for element '${element.id || 'unknown'}'. Binary assets must be saved via saveBoardAsset.`);
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => check(item, `${path}[${index}]`));
    } else if (typeof val === 'object') {
      for (const k of Object.keys(val)) {
        check(val[k], path ? `${path}.${k}` : k);
      }
    }
  }
  check(element, '');
}

/**
 * Sanitizes element for Firestore storage and strips legacy inline fields if assetId exists.
 */
export function sanitizeElementForStorage(element: BoardElement): BoardElement {
  let clean: any = sanitizeForFirestore(element);
  if (clean.assetId) {
    delete clean.src;
    delete clean.audioUrl;
    delete clean.signatureDataUrl;
    delete clean.dataUrl;
    delete clean.signatureUrl;
  }
  assertNoInlineBinaryPayload(clean);
  return clean as BoardElement;
}

/**
 * Stable deterministic element-to-shard mapping
 */
export function getShardIdForElement(elementId: string, shardCount: number = 20): string {
  return `shard_${stableHash(elementId) % shardCount}`;
}

/**
 * Standard JS stable hashing function
 */
export function stableHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
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
  if (rawEl.assetId) clean.assetId = rawEl.assetId;
  if (rawEl.shapeType) clean.shapeType = rawEl.shapeType;
  if (rawEl.fontSize) clean.fontSize = Number(rawEl.fontSize) || 16;
  if (rawEl.locked !== undefined) clean.locked = Boolean(rawEl.locked);

  return sanitizeForFirestore(clean) as BoardElement;
}

type CompatibilityElementVersion = {
  element: BoardElement | null;
  updatedAt: number;
  updatedByClientId: string;
  isDeleted: boolean;
};

function normalizeCompatibilityElement(raw: any, fallbackId: string): BoardElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || raw.elementId || fallbackId);

  // Preserve complete elements from stateChunks/stateShards. The old parser was
  // intentionally conservative and dropped newer fields such as connectors,
  // reactions, graph settings, and media metadata.
  if (raw.type && (raw.x !== undefined || raw.points || raw.assetId || raw.src)) {
    return sanitizeForFirestore({ id, ...raw }) as BoardElement;
  }
  return parseLegacyElement(raw, id);
}

function mergeCompatibilityElement(
  target: Map<string, CompatibilityElementVersion>,
  id: string,
  raw: any,
  forceDeleted = false
): void {
  const element = normalizeCompatibilityElement(raw, id);
  const updatedAt = Number(raw?.updatedAt || raw?.timestamp || element?.updatedAt || 0);
  const updatedByClientId = String(raw?.updatedByClientId || '');
  const isDeleted = forceDeleted || Boolean(raw?.isDeleted);
  const existing = target.get(id);
  const incomingWins = !existing ||
    updatedAt > existing.updatedAt ||
    (updatedAt === existing.updatedAt && updatedByClientId > existing.updatedByClientId) ||
    (updatedAt === existing.updatedAt && updatedByClientId === existing.updatedByClientId && isDeleted && !existing.isDeleted);

  if (incomingWins) {
    target.set(id, {
      element: isDeleted ? null : element,
      updatedAt,
      updatedByClientId,
      isDeleted,
    });
  }
}

function ingestCompatibilityContainer(
  target: Map<string, CompatibilityElementVersion>,
  data: any,
  fallbackId: string
): void {
  if (!data || typeof data !== 'object') return;

  const containers = [data.elements, data.drawings, data.data, data.items].filter(Boolean);
  if (containers.length === 0) {
    const parsed = normalizeCompatibilityElement(data, fallbackId);
    if (parsed) mergeCompatibilityElement(target, parsed.id, data);
  } else {
    containers.forEach((container: any) => {
      if (Array.isArray(container)) {
        container.forEach((item, index) => {
          const parsed = normalizeCompatibilityElement(item, `${fallbackId}_arr_${index}`);
          if (parsed) mergeCompatibilityElement(target, parsed.id, item);
        });
      } else if (container && typeof container === 'object') {
        Object.entries(container).forEach(([id, value]) => {
          mergeCompatibilityElement(target, id, value);
        });
      }
    });
  }

  if (data.tombstones && typeof data.tombstones === 'object') {
    Object.entries(data.tombstones).forEach(([id, value]) => {
      mergeCompatibilityElement(target, id, value, true);
    });
  }
}

async function readCompatibleBoardElements(boardId: string, boardData: any): Promise<BoardElement[]> {
  const versions = new Map<string, CompatibilityElementVersion>();
  ingestCompatibilityContainer(versions, boardData, `${boardId}_manifest`);

  for (const collectionName of ['stateShardsV3', 'stateShards', 'stateChunks', 'elements']) {
    try {
      const snapshot = await getDocs(collection(db, 'whiteboards', boardId, collectionName));
      trackOperation('read', `compatibility-${collectionName}`, snapshot.size);
      snapshot.forEach((docSnap) => {
        ingestCompatibilityContainer(versions, docSnap.data(), docSnap.id);
      });
    } catch (error) {
      console.warn(`Compatibility read skipped for ${collectionName}:`, error);
    }
  }

  return Array.from(versions.values())
    .filter((entry) => !entry.isDeleted && entry.element)
    .map((entry) => entry.element as BoardElement);
}

/**
 * Loads every known historical board layout without modifying Firestore.
 * Old boards deliberately stay read-only until the administrator runs the
 * separate Admin SDK migration script.
 */
export async function loadLegacyBoardReadOnly(
  boardId: string,
  boardDataOverride?: any
): Promise<BoardElement[]> {
  const cached = legacyReadCache.get(boardId);
  if (cached) return cached;

  const existing = legacyReadInFlight.get(boardId);
  if (existing) return existing;

  const readPromise = (async () => {
    let boardData = boardDataOverride || {};
    if (!boardDataOverride) {
      try {
        const boardSnap = await getDoc(doc(db, 'whiteboards', boardId));
        trackOperation('read', 'legacy-readonly-manifest', 1);
        if (boardSnap.exists()) boardData = boardSnap.data() || {};
      } catch (error) {
        console.warn('Unable to read legacy board manifest:', error);
      }
    }

    const elements = await readCompatibleBoardElements(boardId, boardData);
    legacyReadCache.set(boardId, elements);
    return elements;
  })();

  legacyReadInFlight.set(boardId, readPromise);
  try {
    return await readPromise;
  } finally {
    if (legacyReadInFlight.get(boardId) === readPromise) {
      legacyReadInFlight.delete(boardId);
    }
  }
}

/**
 * Backward-compatible export retained for older imports. Despite the historical
 * name, this function performs reads only and never migrates from the browser.
 */
export async function loadAndMigrateLegacyBoard(boardId: string): Promise<BoardElement[]> {
  return loadLegacyBoardReadOnly(boardId);
}

/**
 * Helper to ensure Firebase Auth user is ready prior to Firestore write operations
 */
export async function ensureAuthUser() {
  await authPersistenceReady;
  if (auth.currentUser) return auth.currentUser;
  if (isSandboxEnvironment()) return null;
  try {
    if (typeof (auth as any).authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err) {
    return null;
  }
}

export interface MutationItem {
  elementId: string;
  data: BoardElement | null;
  action: 'set' | 'delete';
  generation: number;
  updatedAt: number;
  updatedByClientId?: string;
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
  initializationPromise: Promise<void>;
  restorePromise: Promise<void>;
  hydrationPromise: Promise<void>;
  resolveRestore: () => void;
  resolveHydration: () => void;
  layoutReady: boolean;
  pendingMutations: Map<string, MutationItem>;
  dirtyGeneration: number;
  committedGeneration: number;
  isFlushInProgress: boolean;
  flushPromise: Promise<void> | null;
  nextFlushRequested: boolean;
  idleTimer: any;
  maxTimer: any;
  firstMutationTime: number | null;
  subscribers: Set<(state: BoardState) => void>;
  manifestListenerUnsubscribe: (() => void) | null;
  currentElementsMap: Map<string, BoardElement>;
  shardsMap: Map<string, Map<string, BoardElement>>; // shardId -> elements
  loadedRevision: number;
  appliedOperationIds: Set<string>;
  localCommittedRevisions: Map<number, { changedShardIds: string[]; committedShardResults: Map<string, Record<string, any>> }>;
  fetchRevisionToken: number;
  loadState: BoardLoadState;
  subscriberCount: number;
  disposed: boolean;
  latestBoardData: any;
  shardCount: number;
  isLegacyReadOnly: boolean;
}

const activeControls = new Map<string, BoardControl>();

const IDLE_FLUSH_DELAY = 2000;
const MAX_FLUSH_INTERVAL = 10000;

function persistPendingMutationsToIdb(boardId: string, mutations: Map<string, MutationItem>) {
  const arr = Array.from(mutations.values());
  if (arr.length === 0) {
    safeIdbDel(`pending_mutations_${boardId}`);
  } else {
    safeIdbSet(`pending_mutations_${boardId}`, arr);
  }
}

export function getOrCreateControl(boardId: string): BoardControl {
  let control = activeControls.get(boardId);
  if (!control) {
    let resolveInit: () => void = () => {};
    const initPromise = new Promise<void>((resolve) => {
      resolveInit = resolve;
    });

    let resolveRestore: () => void = () => {};
    const restorePromise = new Promise<void>((resolve) => {
      resolveRestore = resolve;
    });

    let resolveHydration: () => void = () => {};
    const hydrationPromise = new Promise<void>((resolve) => {
      resolveHydration = resolve;
    });

    const newControl: BoardControl = {
      boardId,
      initializationPromise: initPromise,
      restorePromise,
      hydrationPromise,
      resolveRestore,
      resolveHydration,
      layoutReady: false,
      pendingMutations: new Map(),
      dirtyGeneration: 0,
      committedGeneration: 0,
      isFlushInProgress: false,
      flushPromise: null,
      nextFlushRequested: false,
      idleTimer: null,
      maxTimer: null,
      firstMutationTime: null,
      subscribers: new Set(),
      manifestListenerUnsubscribe: null,
      currentElementsMap: new Map(),
      shardsMap: new Map(),
      loadedRevision: 0,
      appliedOperationIds: new Set(),
      localCommittedRevisions: new Map(),
      fetchRevisionToken: 0,
      loadState: 'idle',
      subscriberCount: 0,
      disposed: false,
      latestBoardData: null,
      shardCount: 20,
      isLegacyReadOnly: false,
    };
    control = newControl;
    activeControls.set(boardId, control);

    if (isSandboxEnvironment()) {
      newControl.layoutReady = true;
      newControl.loadState = 'ready';
      resolveHydration();
    }

    // Restore pending mutations from IndexedDB if present with 30-day expiration policy
    safeIdbGet(`pending_mutations_${boardId}`).then((saved) => {
      if (Array.isArray(saved) && saved.length > 0) {
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        saved.forEach((item: MutationItem) => {
          if (item && item.elementId) {
            if (item.updatedAt < thirtyDaysAgo) {
              console.warn(`Local offline mutation for element ${item.elementId} has expired (older than 30 days) and will not be uploaded.`);
            } else {
              if (!newControl.pendingMutations.has(item.elementId)) {
                newControl.pendingMutations.set(item.elementId, item);
              }
            }
          }
        });
        // Save the cleaned mutations back to IDB
        persistPendingMutationsToIdb(boardId, newControl.pendingMutations);
      }
      resolveRestore();
      resolveInit();
    }).catch(() => {
      resolveRestore();
      resolveInit();
    });

    // Auto-flush when both restore and hydration are complete
    Promise.all([restorePromise, hydrationPromise]).then(() => {
      if (newControl.pendingMutations.size > 0 && !newControl.disposed && !newControl.isLegacyReadOnly) {
        flushBoardCheckpoint(boardId, 'idb-hydration-restore');
      }
    });
  } else {
    control.disposed = false;
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
 * Partitioning function supporting deterministic shards and byte-limit test splitting
 */
export function partitionElementsIntoChunks(
  input: Map<string, BoardElement> | BoardElement[],
  maxChunkBytes: number = TARGET_CHUNK_SIZE_BYTES,
  shardCount: number = 20
): Map<string, Record<string, any>> {
  const elementsMap = input instanceof Map 
    ? input 
    : new Map((input || []).map(el => [el.id, el]));

  if (maxChunkBytes < TARGET_CHUNK_SIZE_BYTES) {
    const splitChunks = new Map<string, Record<string, any>>();
    let currIdx = 0;
    let currSize = 0;
    let currChunk: Record<string, any> = {};

    elementsMap.forEach((el, id) => {
      const sanitized = sanitizeElementForStorage(el);
      const itemSize = JSON.stringify(sanitized).length * 2;
      if (currSize + itemSize > maxChunkBytes && Object.keys(currChunk).length > 0) {
        splitChunks.set(`chunk_${currIdx}`, currChunk);
        currIdx++;
        currChunk = {};
        currSize = 0;
      }
      currChunk[id] = sanitized;
      currSize += itemSize;
    });

    if (Object.keys(currChunk).length > 0) {
      splitChunks.set(`chunk_${currIdx}`, currChunk);
    }
    return splitChunks;
  }

  const chunks = new Map<string, Record<string, any>>();
  elementsMap.forEach((el, id) => {
    const shardId = getShardIdForElement(id, shardCount);
    if (!chunks.has(shardId)) {
      chunks.set(shardId, {});
    }
    chunks.get(shardId)![id] = sanitizeElementForStorage(el);
  });

  return chunks;
}

/**
 * Loads board state once from deterministic stateShards subcollection.
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
      loadState: 'ready',
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
      loadState: 'ready',
    };
  }

  const boardData = boardSnap.data();
  const schemaVersion = boardData.schemaVersion || 1;

  if (isLegacyBoardData(boardData)) {
    const recoveredElements = await loadLegacyBoardReadOnly(boardId, boardData);
    return {
      boardId,
      schemaVersion,
      currentRevision: boardData.currentRevision !== undefined ? Number(boardData.currentRevision) : 0,
      chunkIds: Array.isArray(boardData.chunkIds) ? boardData.chunkIds : [],
      totalElements: recoveredElements.length,
      elements: recoveredElements,
      isLegacy: true,
      migrationRequired: true,
      updatedAt: boardData.updatedAt || Date.now(),
      boardData,
      loadState: 'ready',
    };
  }

  const shardsCollName = schemaVersion === 3 ? 'stateShardsV3' : 'stateShards';
  const shardsColl = collection(db, 'whiteboards', boardId, shardsCollName);
  const shardsSnap = await getDocs(shardsColl);
  trackOperation('read', 'board-initial-load-shards', shardsSnap.size);

  const elementsMap = new Map<string, BoardElement>();
  shardsSnap.forEach((shardDoc) => {
    const sData = shardDoc.data();
    if (sData && sData.elements) {
      Object.entries(sData.elements).forEach(([elId, rawEl]: [string, any]) => {
        if (rawEl && typeof rawEl === 'object' && !rawEl.isDeleted) {
          elementsMap.set(elId, { id: elId, ...rawEl } as BoardElement);
        }
      });
    }
  });

  let elements = Array.from(elementsMap.values());

  // A schema-2 manifest from the previous implementation may still point to
  // stateChunks rather than stateShards. Never publish an empty board when the
  // manifest says data exists; recover all known historical layouts instead.
  if (elements.length === 0 && Number(boardData.totalElements || 0) > 0) {
    elements = await loadLegacyBoardReadOnly(boardId, boardData);
    return {
      boardId,
      schemaVersion,
      currentRevision: boardData.currentRevision !== undefined ? Number(boardData.currentRevision) : 0,
      chunkIds: Array.isArray(boardData.chunkIds) ? boardData.chunkIds : [],
      totalElements: elements.length,
      elements,
      isLegacy: true,
      migrationRequired: true,
      updatedAt: boardData.updatedAt || Date.now(),
      boardData,
      loadState: 'ready',
    };
  }

  return {
    boardId,
    schemaVersion,
    currentRevision: boardData.currentRevision !== undefined ? Number(boardData.currentRevision) : 0,
    chunkIds: shardsSnap.docs.map(d => d.id),
    totalElements: elements.length,
    elements,
    isLegacy: false,
    migrationRequired: false,
    updatedAt: boardData.updatedAt || Date.now(),
    boardData,
    loadState: 'ready',
  };
}

/**
 * Revision-consistent full recovery loop with manifest comparison.
 */
/**
 * Atomic publication of consistent whiteboard state to all subscribers.
 */
export function publishBoardState(boardId: string) {
  const control = activeControls.get(boardId);
  if (!control || control.disposed) return;

  const boardData = control.latestBoardData || {};
  const flattened = new Map<string, BoardElement>();

  // Merge in-memory active shards
  control.shardsMap.forEach((shardElements) => {
    shardElements.forEach((el: any, id) => {
      if (el && el.isDeleted) return; // Skip tombstones
      const pending = control.isLegacyReadOnly ? undefined : control.pendingMutations.get(id);
      if (pending) {
        if (pending.action === 'set' && pending.data) {
          flattened.set(id, pending.data);
        }
      } else {
        flattened.set(id, el);
      }
    });
  });

  // Never merge or display pending cloud mutations on a legacy read-only board.
  if (!control.isLegacyReadOnly) {
    control.pendingMutations.forEach((item, id) => {
      if (item.action === 'set' && item.data) {
        flattened.set(id, item.data);
      } else if (item.action === 'delete') {
        flattened.delete(id);
      }
    });
  }

  control.currentElementsMap = flattened;
  const elementsList = Array.from(flattened.values());

  const state: BoardState = {
    boardId,
    schemaVersion: boardData.schemaVersion || 2,
    currentRevision: control.loadedRevision,
    chunkIds: Array.from(control.shardsMap.keys()),
    totalElements: elementsList.length,
    elements: elementsList,
    isLegacy: control.isLegacyReadOnly,
    migrationRequired: control.isLegacyReadOnly,
    updatedAt: boardData.updatedAt || Date.now(),
    boardData,
    loadState: control.loadState,
  };

  control.subscribers.forEach((callback) => {
    try {
      callback(state);
    } catch (err) {
      console.error("Error in subscriber callback:", err);
    }
  });
}

/**
 * Revision-consistent full recovery loop with manifest comparison.
 */
async function triggerFullRecovery(
  boardId: string,
  control: BoardControl,
  currentToken: number,
  boardData: any
) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const boardRef = doc(db, 'whiteboards', boardId);
      const snapA = await getDoc(boardRef);
      trackOperation('read', 'board-recovery-manifest-a', 1);
      
      if (!snapA.exists()) {
        throw new Error("Manifest A does not exist.");
      }
      
      const dataA = snapA.data();
      const revA = dataA.currentRevision !== undefined ? Number(dataA.currentRevision) : 0;
      const schemaVersion = dataA.schemaVersion || 1;
      const shardCount = getShardCountForBoard(dataA);

      const shardsCollName = schemaVersion === 3 ? 'stateShardsV3' : 'stateShards';
      const shardsColl = collection(db, 'whiteboards', boardId, shardsCollName);
      const shardsSnap = await getDocs(shardsColl);
      trackOperation('read', 'board-recovery-shards', shardsSnap.size);

      const snapB = await getDoc(boardRef);
      trackOperation('read', 'board-recovery-manifest-b', 1);
      
      if (!snapB.exists()) {
        throw new Error("Manifest B does not exist.");
      }
      
      const dataB = snapB.data();
      const revB = dataB.currentRevision !== undefined ? Number(dataB.currentRevision) : 0;

      if (currentToken !== control.fetchRevisionToken || control.disposed) return;

      if (revA !== revB) {
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 150));
          continue;
        } else {
          throw new Error("Manifest revisions mismatch after maximum attempts.");
        }
      }

      // Build the new shard map separately and replace the active map only after complete validation.
      const nextShardsMap = new Map<string, Map<string, BoardElement>>();
      let isValidLayout = true;

      shardsSnap.forEach((shardDoc) => {
        const sData = shardDoc.data();
        const shardElements = new Map<string, BoardElement>();
        if (sData && sData.elements) {
          Object.entries(sData.elements).forEach(([elId, rawEl]: [string, any]) => {
            if (rawEl && typeof rawEl === 'object') {
              const expectedShardId = getShardIdForElement(elId, shardCount);
              if (expectedShardId !== shardDoc.id) {
                isValidLayout = false;
              }
              if (!rawEl.isDeleted) {
                shardElements.set(elId, { id: elId, ...rawEl } as BoardElement);
              }
            }
          });
        }
        nextShardsMap.set(shardDoc.id, shardElements);
      });

      if (!isValidLayout) {
        throw new Error("Shard layout mismatch or invalid elements found during full recovery.");
      }

      if (nextShardsMap.size === 0 && Number(dataB.totalElements || 0) > 0) {
        const legacyElements = await loadLegacyBoardReadOnly(boardId, dataB);
        const legacyShard = new Map<string, BoardElement>(legacyElements.map((el) => [el.id, el]));
        control.shardsMap = new Map([['legacy_readonly', legacyShard]]);
        control.currentElementsMap = new Map(legacyShard);
        if (control.pendingMutations.size > 0) {
          void safeIdbSet(
            `legacy_readonly_pending_backup_${boardId}`,
            Array.from(control.pendingMutations.values())
          );
          control.pendingMutations.clear();
          void safeIdbDel(`pending_mutations_${boardId}`);
        }
        control.loadedRevision = revB;
        control.loadState = 'ready';
        control.latestBoardData = dataB;
        control.layoutReady = false;
        control.isLegacyReadOnly = true;
        control.resolveHydration();
        publishBoardState(boardId);
        return;
      }

      // Atomic swap/assignment only after complete validation
      control.shardsMap = nextShardsMap;
      control.shardCount = shardCount;
      control.loadedRevision = revB;
      control.loadState = 'ready';
      control.latestBoardData = dataB;
      control.layoutReady = true;
      control.isLegacyReadOnly = false;
      control.resolveHydration();

      // Keep localCommittedRevisions bounded (max 10)
      if (control.localCommittedRevisions.size > 10) {
        const keys = Array.from(control.localCommittedRevisions.keys()).sort((a, b) => a - b);
        while (keys.length > 10) {
          const k = keys.shift();
          if (k !== undefined) control.localCommittedRevisions.delete(k);
        }
      }

      publishBoardState(boardId);
      return;
    } catch (err) {
      console.error(`Error during full recovery (attempt ${attempts}):`, err);
      if (attempts >= maxAttempts) {
        control.loadState = 'error';
        publishBoardState(boardId);
      } else {
        await new Promise((r) => setTimeout(r, 100 + Math.random() * 150));
      }
    }
  }
}

/**
 * Subscribes to board state changes with a single coordinated manifest listener.
 */
export function subscribeToBoardState(
  boardId: string,
  callback: (state: BoardState) => void
): () => void {
  const control = getOrCreateControl(boardId);
  control.subscriberCount++;
  control.subscribers.add(callback);

  if (isSandboxEnvironment()) {
    control.loadState = 'ready';
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
      loadState: 'ready',
    });

    const handleSandboxUpdate = (e: CustomEvent) => {
      if (e.detail && e.detail.boardId === boardId) {
        const updated = getSandboxLocalElements(boardId);
        const state: BoardState = {
          boardId,
          schemaVersion: 2,
          currentRevision: 1,
          chunkIds: ['chunk_0'],
          totalElements: updated.length,
          elements: updated,
          isLegacy: false,
          migrationRequired: false,
          updatedAt: Date.now(),
          loadState: 'ready',
        };
        control.subscribers.forEach((cb) => cb(state));
      }
    };

    window.addEventListener('lucid_spark_elements_updated', handleSandboxUpdate as EventListener);
    const unsub = () => {
      window.removeEventListener('lucid_spark_elements_updated', handleSandboxUpdate as EventListener);
      control.subscribers.delete(callback);
      control.subscriberCount = Math.max(0, control.subscriberCount - 1);
      if (control.subscriberCount === 0) {
        activeControls.delete(boardId);
        control.disposed = true;
      }
    };
    return unsub;
  }

  // If manifest snapshot listener is not yet created, build a single coordinated listener
  if (!control.manifestListenerUnsubscribe) {
    control.loadedRevision = 0;
    control.shardsMap.clear();
    control.currentElementsMap.clear();
    control.localCommittedRevisions.clear();
    control.loadState = 'loading-manifest';

    const boardRef = doc(db, 'whiteboards', boardId);
    control.manifestListenerUnsubscribe = onSnapshot(
      boardRef,
      async (snap) => {
        trackOperation('read', 'board-manifest-sync', 1);
        if (!snap.exists()) {
          control.shardCount = 160;
          control.latestBoardData = {
            schemaVersion: 3,
            shardLayoutVersion: 2,
            shardCount: 160,
            currentRevision: 0,
            totalElements: 0,
          };
          control.layoutReady = true;
          control.isLegacyReadOnly = false;
          control.resolveHydration();
          control.loadState = 'ready';
          publishBoardState(boardId);
          return;
        }

        const boardData = snap.data();
        control.shardCount = getShardCountForBoard(boardData);
        control.latestBoardData = boardData;
        control.layoutReady = true;

        if (isLegacyBoardData(boardData)) {
          const legacyToken = ++control.fetchRevisionToken;
          control.loadState = 'loading-shards';
          control.layoutReady = false;
          control.isLegacyReadOnly = true;

          try {
            const recoveredElements = await loadLegacyBoardReadOnly(boardId, boardData);
            if (legacyToken !== control.fetchRevisionToken || control.disposed) return;

            const legacyShard = new Map<string, BoardElement>(
              recoveredElements.map((element) => [element.id, element])
            );
            control.shardsMap = new Map([['legacy_readonly', legacyShard]]);
            control.currentElementsMap = new Map(legacyShard);
            control.latestBoardData = boardData;
            if (control.pendingMutations.size > 0) {
              void safeIdbSet(
                `legacy_readonly_pending_backup_${boardId}`,
                Array.from(control.pendingMutations.values())
              );
              control.pendingMutations.clear();
              void safeIdbDel(`pending_mutations_${boardId}`);
            }
            control.loadedRevision = boardData.currentRevision !== undefined
              ? Number(boardData.currentRevision)
              : 0;
            control.loadState = 'ready';
            control.resolveHydration();
            publishBoardState(boardId);
          } catch (error) {
            console.error('Unable to load historical whiteboard read-only:', error);
            control.loadState = 'error';
            control.resolveHydration();
            publishBoardState(boardId);
          }
          return;
        }

        control.isLegacyReadOnly = false;
        const R = boardData.currentRevision !== undefined ? boardData.currentRevision : 0;

        // Metadata update: if revision didn't change, publish metadata immediately without shard re-fetch
        if (R <= control.loadedRevision && control.loadState === 'ready') {
          control.resolveHydration();
          publishBoardState(boardId);
          return;
        }

        // If local client wrote revision R and holds committed shard data in memory
        if (control.localCommittedRevisions.has(R)) {
          control.loadedRevision = R;
          control.loadState = 'ready';
          control.resolveHydration();
          publishBoardState(boardId);
          return;
        }

        control.fetchRevisionToken++;
        const currentToken = control.fetchRevisionToken;
        control.loadState = 'loading-shards';

        if (R === control.loadedRevision + 1 && boardData.changedShardIds && boardData.changedShardIds.length > 0) {
          const changedShardIds: string[] = boardData.changedShardIds;
          const deletedShardIds: string[] = boardData.deletedShardIds || [];
          try {
            const fetchPromises = changedShardIds.map(async (shardId) => {
              const shardsCollName = (boardData.schemaVersion === 3) ? 'stateShardsV3' : 'stateShards';
              const shardRef = doc(db, 'whiteboards', boardId, shardsCollName, shardId);
              const shardSnap = await getDoc(shardRef);
              return { shardId, shardSnap };
            });

            const results = await Promise.all(fetchPromises);
            trackOperation('read', 'shard-incremental-sync', results.length);

            if (currentToken !== control.fetchRevisionToken || control.disposed) return;

            // Stage all changes in temporary structures
            const stagedShardsMap = new Map<string, Map<string, BoardElement>>();
            let validationFailed = false;

            for (const { shardId, shardSnap } of results) {
              if (shardSnap.exists()) {
                const sData = shardSnap.data();
                // Validation: Existing changed shards must have `revision === targetRevision`
                // Missing `revision` is invalid for modern shards.
                if (!sData || typeof sData.revision !== 'number' || sData.revision !== R) {
                  validationFailed = true;
                  break;
                } else {
                  const shardElements = new Map<string, BoardElement>();
                  if (sData.elements) {
                    Object.entries(sData.elements).forEach(([elId, rawEl]: [string, any]) => {
                      if (rawEl && typeof rawEl === 'object' && !rawEl.isDeleted) {
                        shardElements.set(elId, { id: elId, ...rawEl } as BoardElement);
                      }
                    });
                  }
                  stagedShardsMap.set(shardId, shardElements);
                }
              } else {
                // A missing shard is valid only when its ID is in deletedShardIds
                if (!deletedShardIds.includes(shardId)) {
                  validationFailed = true;
                  break;
                }
              }
            }

            if (validationFailed) {
              // Any mismatch triggers stable full recovery
              await triggerFullRecovery(boardId, control, currentToken, boardData);
              return;
            }

            // Apply all changes atomically
            stagedShardsMap.forEach((shardElements, shardId) => {
              control.shardsMap.set(shardId, shardElements);
            });

            // A deleted shard must not be removed before all results pass
            deletedShardIds.forEach((sId) => {
              control.shardsMap.delete(sId);
            });

            control.loadedRevision = R;
            control.loadState = 'ready';
            control.latestBoardData = boardData;
            control.resolveHydration();
            publishBoardState(boardId);
          } catch (err) {
            console.error("Error loading changed shards:", err);
            // On failure, fallback to full recovery
            await triggerFullRecovery(boardId, control, currentToken, boardData);
          }
        } else {
          await triggerFullRecovery(boardId, control, currentToken, boardData);
        }
      },
      (err: any) => {
        if (err?.code !== 'permission-denied') {
          console.error('Error in board manifest snapshot:', err);
        }
        control.loadState = 'error';
        publishBoardState(boardId);
      }
    );
  } else {
    // Subscriber joined while manifest listener was already active and loaded; publish currently held state immediately
    if (control.loadState === 'ready') {
      const boardData = control.latestBoardData || {};
      const flattened = new Map<string, BoardElement>();
      control.shardsMap.forEach((shardElements) => {
        shardElements.forEach((el, id) => {
          if (el && !(el as any).isDeleted) flattened.set(id, el);
        });
      });
      if (!control.isLegacyReadOnly) {
        control.pendingMutations.forEach((item, id) => {
          if (item.action === 'set' && item.data) flattened.set(id, item.data);
          else if (item.action === 'delete') flattened.delete(id);
        });
      }
      callback({
        boardId,
        schemaVersion: boardData.schemaVersion || 2,
        currentRevision: control.loadedRevision,
        chunkIds: Array.from(control.shardsMap.keys()),
        totalElements: flattened.size,
        elements: Array.from(flattened.values()),
        isLegacy: control.isLegacyReadOnly,
        migrationRequired: control.isLegacyReadOnly,
        updatedAt: boardData.updatedAt || Date.now(),
        boardData,
        loadState: control.loadState,
      });
    }
  }

  const cleanup = () => {
    control.subscribers.delete(callback);
    control.subscriberCount = Math.max(0, control.subscriberCount - 1);

    if (control.subscriberCount === 0) {
      if (control.manifestListenerUnsubscribe) {
        control.manifestListenerUnsubscribe();
        control.manifestListenerUnsubscribe = null;
      }
      control.fetchRevisionToken++;

      if (control.idleTimer) clearTimeout(control.idleTimer);
      if (control.maxTimer) clearTimeout(control.maxTimer);
      control.idleTimer = null;
      control.maxTimer = null;

      const cleanupControl = () => {
        if (control.pendingMutations.size === 0 && !control.isFlushInProgress) {
          activeControls.delete(boardId);
          control.disposed = true;
        }
      };

      if (control.flushPromise) {
        control.flushPromise.finally(cleanupControl);
      } else {
        cleanupControl();
      }
    }
  };

  return cleanup;
}

/**
 * Queue an element mutation (set or delete).
 */
export function queueElementMutation(
  boardId: string,
  elementId: string,
  data: BoardElement | null,
  action: 'set' | 'delete' = 'set',
  updatedByClientId?: string
): void {
  const control = getOrCreateControl(boardId);

  if (!isSandboxEnvironment() && control.isLegacyReadOnly) {
    console.warn(`Ignored mutation for legacy read-only board ${boardId}. Run the Admin SDK migration before editing.`);
    return;
  }

  if (action === 'set' && data) {
    let sanitized = sanitizeElementForStorage(data);
    if (sanitized.type === 'drawing' && Array.isArray((sanitized as any).points)) {
      sanitized = { ...sanitized, points: simplifyPoints((sanitized as any).points, 1.2) } as BoardElement;
    }
    const byteSize = new TextEncoder().encode(JSON.stringify(sanitized)).byteLength;
    if (byteSize > MAX_SINGLE_ELEMENT_BYTES) {
      console.error(`Element ${elementId} (${byteSize} bytes) exceeds max single element size limit!`);
      throw new Error(`Element exceeds maximum allowable size per chunk (${MAX_SINGLE_ELEMENT_BYTES} bytes).`);
    }
    data = sanitized;
  }

  control.dirtyGeneration++;

  const mutationItem: MutationItem = {
    elementId,
    data: data ? sanitizeElementForStorage(data) : null,
    action,
    generation: control.dirtyGeneration,
    updatedAt: Date.now(),
    updatedByClientId,
  };

  control.pendingMutations.set(elementId, mutationItem);
  persistPendingMutationsToIdb(boardId, control.pendingMutations);

  // Update in-memory state immediately for instant local UI feedback
  if (action === 'delete') {
    control.currentElementsMap.delete(elementId);
  } else if (data) {
    let el = sanitizeElementForStorage(data);
    if (el.type === 'drawing' && Array.isArray((el as any).points)) {
      el = { ...el, points: simplifyPoints((el as any).points, 1.2) } as BoardElement;
    }
    control.currentElementsMap.set(elementId, el);
  }

  if (isSandboxEnvironment()) {
    saveSandboxLocalElements(boardId, Array.from(control.currentElementsMap.values()));
    return;
  }

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
  if (!isSandboxEnvironment() && control.isLegacyReadOnly) return;
  if (control.appliedOperationIds.has(op.operationId)) {
    return;
  }
  control.appliedOperationIds.add(op.operationId);
  if (control.appliedOperationIds.size > 2000) {
    const oldest = Array.from(control.appliedOperationIds).slice(0, 500);
    oldest.forEach((id) => control.appliedOperationIds.delete(id));
  }

  if (control.pendingMutations.has(op.elementId)) {
    return;
  }

  if (op.action === 'delete') {
    control.currentElementsMap.delete(op.elementId);
  } else if (op.data) {
    control.currentElementsMap.set(op.elementId, op.data);
  }

  if (isSandboxEnvironment()) {
    const list = Array.from(control.currentElementsMap.values());
    saveSandboxLocalElements(boardId, list);
  }
}

/**
 * Flushes pending mutations to stateShards using concurrency-safe transaction locks.
 */
export async function flushBoardCheckpoint(boardId: string, reason: string = 'manual'): Promise<void> {
  const control = getOrCreateControl(boardId);
  await control.restorePromise;
  await control.hydrationPromise;

  if (isSandboxEnvironment()) {
    control.pendingMutations.clear();
    persistPendingMutationsToIdb(boardId, control.pendingMutations);
    control.committedGeneration = control.dirtyGeneration;
    return;
  }

  if (control.isLegacyReadOnly) {
    console.warn(`Skipped checkpoint for legacy read-only board ${boardId}.`);
    return;
  }

  if (control.pendingMutations.size === 0) {
    return;
  }

  if (control.loadState !== 'ready' || !control.layoutReady || !control.latestBoardData) {
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
      await ensureAuthUser();

      const affectedShardIds = new Set<string>();
      mutationsSnapshot.forEach((_, elId) => {
        affectedShardIds.add(getShardIdForElement(elId, control.shardCount));
      });

      const changedShardIds = Array.from(affectedShardIds);

      let transactionBaseRevision = 0;
      let committedNextRevision = 0;
      let committedShardWrites = 0;
      let committedShardDeletes = 0;
      let finalDeletedShardIds: string[] = [];
      const committedShardResults = new Map<string, Record<string, any>>();

      await runTransaction(db, async (transaction) => {
        trackOperation('tx_attempt', 'board-checkpoint', 1);

        const boardRef = doc(db, 'whiteboards', boardId);
        
        // 1. Transaction READ: Board manifest
        const boardSnap = await transaction.get(boardRef);
        trackOperation('read', 'board-checkpoint-manifest', 1);
        const boardMeta = boardSnap.exists() ? boardSnap.data() : {};
        const schemaVersion = boardMeta.schemaVersion || 2;
        const currentRev = boardMeta.currentRevision !== undefined ? boardMeta.currentRevision : 0;
        transactionBaseRevision = currentRev;
        const nextRevision = currentRev + 1;
        const shardsCollName = schemaVersion === 3 ? 'stateShardsV3' : 'stateShards';
        const shardCount = getShardCountForBoard(boardMeta);

        if (shardCount !== control.shardCount) {
          throw new Error('STALE_LAYOUT_DETECTED');
        }

        // 2. Transaction READ: All affected state shards
        const shardSnapshots = await Promise.all(
          changedShardIds.map(async (shardId) => {
            const shardRef = doc(db, 'whiteboards', boardId, shardsCollName, shardId);
            const snap = await transaction.get(shardRef);
            return { shardId, snap, shardRef };
          })
        );
        trackOperation('read', 'board-checkpoint-shards', changedShardIds.length);

        // 3. Transaction WRITES: Apply rebased mutations with LWW conflict resolution & tombstone tracking
        let attemptWrites = 0;
        let attemptDeletes = 0;
        let netElementCountChange = 0;
        const localShardResults = new Map<string, Record<string, any>>();
        const deletedShardIds: string[] = [];
        let appliedMutationCount = 0;
        let rejectedConflictCount = 0;

        shardSnapshots.forEach(({ shardId, snap, shardRef }) => {
          const sData = snap.exists() ? snap.data() : {};
          const currentShardElements: Record<string, any> = { ...(sData.elements || {}) };
          const currentShardTombstones: Record<string, any> = { ...(sData.tombstones || {}) };
          
          let beforeActiveCount = 0;
          Object.values(currentShardElements).forEach((el: any) => {
            if (el && !el.isDeleted) beforeActiveCount++;
          });

          mutationsSnapshot.forEach((item, elId) => {
            if (getShardIdForElement(elId, shardCount) === shardId) {
              const serverEl = currentShardElements[elId];
              const tombstone = currentShardTombstones[elId];

              const serverUpdatedAt = Number(serverEl?.updatedAt || 0);
              const serverClientId = String(serverEl?.updatedByClientId || '');
              const tombstoneUpdatedAt = Number(tombstone?.updatedAt || 0);
              const tombstoneClientId = String(tombstone?.updatedByClientId || '');
              const localUpdatedAt = Number(item.updatedAt || 0);
              const localClientId = String(item.updatedByClientId || '');

              let localWins = true;
              if (tombstone) {
                if (localUpdatedAt < tombstoneUpdatedAt) {
                  localWins = false;
                } else if (localUpdatedAt === tombstoneUpdatedAt && localClientId <= tombstoneClientId) {
                  localWins = false;
                }
              }
              if (serverEl) {
                if (localUpdatedAt < serverUpdatedAt) {
                  localWins = false;
                } else if (localUpdatedAt === serverUpdatedAt && localClientId <= serverClientId) {
                  localWins = false;
                }
              }

              if (localWins) {
                appliedMutationCount++;
                if (item.action === 'delete') {
                  delete currentShardElements[elId];
                  currentShardTombstones[elId] = {
                    updatedAt: localUpdatedAt,
                    updatedByClientId: localClientId,
                  };
                } else if (item.data) {
                  delete currentShardTombstones[elId];
                  currentShardElements[elId] = sanitizeElementForStorage({
                    ...item.data,
                    updatedAt: localUpdatedAt,
                    updatedByClientId: localClientId,
                  } as BoardElement);
                }
              } else {
                rejectedConflictCount++;
              }
            }
          });

          let afterActiveCount = Object.keys(currentShardElements).length;
          netElementCountChange += (afterActiveCount - beforeActiveCount);
          localShardResults.set(shardId, { ...currentShardElements });

          const shardDocToSave = {
            shardId,
            revision: nextRevision,
            elements: currentShardElements,
            tombstones: currentShardTombstones,
            updatedAt: Date.now(),
          };

          const docBytes = new TextEncoder().encode(JSON.stringify(shardDocToSave)).byteLength;
          if (docBytes > MAX_STATE_SHARD_DOCUMENT_BYTES) {
            throw new Error(`State shard ${shardId} document size (${docBytes} bytes) exceeds safe Firestore document limit (${MAX_STATE_SHARD_DOCUMENT_BYTES} bytes).`);
          }

          if (afterActiveCount === 0 && Object.keys(currentShardTombstones).length === 0) {
            transaction.delete(shardRef);
            attemptDeletes++;
            deletedShardIds.push(shardId);
          } else {
            transaction.set(shardRef, shardDocToSave);
            attemptWrites++;
          }
        });

        if (appliedMutationCount + rejectedConflictCount !== mutationsSnapshot.size) {
          throw new Error(`MUTATION_COUNT_MISMATCH: applied=${appliedMutationCount}, rejected=${rejectedConflictCount}, expected=${mutationsSnapshot.size}`);
        }

        if (appliedMutationCount === 0) {
          throw new Error('NO_APPLIED_MUTATIONS');
        }

        const currentTotalElements = boardMeta.totalElements || 0;
        const nextTotalElements = Math.max(0, currentTotalElements + netElementCountChange);

        transaction.set(
          boardRef,
          {
            schemaVersion: schemaVersion,
            currentRevision: nextRevision,
            changedShardIds,
            deletedShardIds,
            totalElements: nextTotalElements,
            migrationStatus: 'complete',
            updatedAt: Date.now(),
          },
          { merge: true }
        );

        committedNextRevision = nextRevision;
        committedShardWrites = attemptWrites;
        committedShardDeletes = attemptDeletes;
        finalDeletedShardIds = deletedShardIds;
        localShardResults.forEach((val, key) => committedShardResults.set(key, val));
      });

      // Post-transaction side effects
      trackOperation('tx_commit', 'board-checkpoint', 1);
      if (committedShardWrites > 0) trackOperation('write', 'shard-write', committedShardWrites);
      if (committedShardDeletes > 0) trackOperation('delete', 'shard-delete', committedShardDeletes);
      trackOperation('write', 'board-manifest-commit', 1);

      // Handle unseen remote revision discovery with exact revision handling
      if (transactionBaseRevision !== control.loadedRevision) {
        control.fetchRevisionToken++;
        const token = control.fetchRevisionToken;
        await triggerFullRecovery(boardId, control, token, { currentRevision: committedNextRevision });
      } else {
        committedShardResults.forEach((elementsObj, shardId) => {
          const elMap = new Map<string, BoardElement>();
          Object.entries(elementsObj).forEach(([id, el]) => {
            elMap.set(id, el as BoardElement);
          });
          control.shardsMap.set(shardId, elMap);
        });

        finalDeletedShardIds.forEach((sId) => control.shardsMap.delete(sId));

        control.loadedRevision = committedNextRevision;
        control.localCommittedRevisions.set(committedNextRevision, {
          changedShardIds,
          committedShardResults,
        });
        if (control.localCommittedRevisions.size > 10) {
          const keys = Array.from(control.localCommittedRevisions.keys()).sort((a, b) => a - b);
          while (keys.length > 10) {
            const k = keys.shift();
            if (k !== undefined) control.localCommittedRevisions.delete(k);
          }
        }
      }

      control.committedGeneration = Math.max(control.committedGeneration, committingGeneration);

      for (const [elId, item] of mutationsSnapshot.entries()) {
        const currentPending = control.pendingMutations.get(elId);
        if (currentPending && currentPending.generation <= committingGeneration) {
          control.pendingMutations.delete(elId);
        }
      }

      persistPendingMutationsToIdb(boardId, control.pendingMutations);
    } catch (err: any) {
      if (err?.message === 'STALE_LAYOUT_DETECTED') {
        console.warn('Stale layout detected in transaction, performing recovery and retry.');
        control.fetchRevisionToken++;
        const token = control.fetchRevisionToken;
        await triggerFullRecovery(boardId, control, token, control.latestBoardData);
        control.nextFlushRequested = true;
      } else if (err?.message === 'NO_APPLIED_MUTATIONS') {
        console.log('No mutations were applied (possibly all conflict-rejected or resolved), clearing snapshot.');
        for (const [elId, item] of mutationsSnapshot.entries()) {
          const currentPending = control.pendingMutations.get(elId);
          if (currentPending && currentPending.generation <= committingGeneration) {
            control.pendingMutations.delete(elId);
          }
        }
        persistPendingMutationsToIdb(boardId, control.pendingMutations);
      } else {
        console.error('Flush checkpoint transaction failed:', err);
        throw err;
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
 * Initialize board with elements and shard revisions.
 */
export async function initializeBoardWithElements(
  boardId: string,
  elementsList: BoardElement[],
  boardData: any
): Promise<void> {
  await ensureAuthUser();

  const shardCount = 160;
  const shardElementsMap = new Map<string, Record<string, any>>();
  elementsList.forEach((el) => {
    const shardId = getShardIdForElement(el.id, shardCount);
    if (!shardElementsMap.has(shardId)) {
      shardElementsMap.set(shardId, {});
    }
    shardElementsMap.get(shardId)![el.id] = sanitizeElementForStorage(el);
  });

  const changedShardIds = Array.from(shardElementsMap.keys());

  await runTransaction(db, async (transaction) => {
    trackOperation('tx_attempt', 'board-checkpoint', 1);

    const boardRef = doc(db, 'whiteboards', boardId);
    const boardSnap = await transaction.get(boardRef);
    trackOperation('read', 'board-checkpoint-manifest', 1);
    const currentRev = boardSnap.exists() && boardSnap.data()?.currentRevision !== undefined ? boardSnap.data().currentRevision : 0;
    const initRevision = currentRev > 0 ? currentRev + 1 : 1;

    shardElementsMap.forEach((elements, shardId) => {
      const shardRef = doc(db, 'whiteboards', boardId, 'stateShardsV3', shardId);
      const shardDoc = {
        shardId,
        revision: initRevision,
        elements,
        tombstones: {},
        updatedAt: Date.now(),
      };
      const docBytes = new TextEncoder().encode(JSON.stringify(shardDoc)).byteLength;
      if (docBytes > MAX_STATE_SHARD_DOCUMENT_BYTES) {
        throw new Error(`State shard ${shardId} document size (${docBytes} bytes) exceeds maximum limit (${MAX_STATE_SHARD_DOCUMENT_BYTES} bytes).`);
      }
      transaction.set(shardRef, shardDoc);
    });

    transaction.set(boardRef, {
      ...boardData,
      schemaVersion: 3,
      shardLayoutVersion: 2,
      shardCount: 160,
      currentRevision: initRevision,
      changedShardIds,
      totalElements: elementsList.length,
      migrationStatus: 'complete',
      chunkIds: [],
      updatedAt: Date.now(),
    }, { merge: true });
  });

  trackOperation('tx_commit', 'board-checkpoint', 1);
  trackOperation('write', 'shard-write', changedShardIds.length);
  trackOperation('write', 'board-manifest-commit', 1);
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
      if (control.manifestListenerUnsubscribe) {
        control.manifestListenerUnsubscribe();
        control.manifestListenerUnsubscribe = null;
      }
      control.subscribers.clear();
      control.disposed = true;
      activeControls.delete(boardId);
    }
  } else {
    activeControls.forEach((control) => {
      if (control.idleTimer) clearTimeout(control.idleTimer);
      if (control.maxTimer) clearTimeout(control.maxTimer);
      if (control.manifestListenerUnsubscribe) {
        control.manifestListenerUnsubscribe();
        control.manifestListenerUnsubscribe = null;
      }
      control.subscribers.clear();
      control.disposed = true;
    });
    activeControls.clear();
  }
}
