import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { isSandboxEnvironment } from "../utils/firebaseSandboxGuard";
import { trackOperation } from "../utils/firestoreInstrumentation";

export interface BoardAssetDoc {
  assetId: string;
  encoding: 'base64';
  mimeType: string;
  data: string;
  encodedByteSize: number;
  originalByteSize?: number;
  width?: number;
  height?: number;
  contentHash: string;
  createdAt: number;
  createdBy?: string;
}

export interface SavedAssetMeta {
  assetId: string;
  mimeType: string;
  encodedByteSize: number;
  width?: number;
  height?: number;
}

// In-memory asset cache to ensure asset documents are read at most ONCE per session
const assetCacheMap = new Map<string, BoardAssetDoc>();
const hashToAssetIdMap = new Map<string, string>(); // boardId:contentHash -> assetId
const inFlightAssetRequests = new Map<string, Promise<BoardAssetDoc | null>>();

export const MAX_ASSET_DOCUMENT_BYTES = 750_000; // ~750KB strict document size limit for Spark plan
export const MAX_SAFE_ASSET_BYTES = MAX_ASSET_DOCUMENT_BYTES;

/**
 * Computes SHA-256 hash using Web Crypto API with fallback
 */
export async function computeSHA256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback below
    }
  }

  // Simple deterministic fallback hashing algorithm for environments without crypto.subtle
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const absHash = Math.abs(hash).toString(16).padStart(8, '0');
  return `sha256_fb_${absHash}_${data.length}`;
}

export function computeContentHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${data.length}`;
}

/**
 * Client-side image compression helper to keep base64 payloads safely below document limits
 */
export async function compressImageBase64(
  base64DataUrl: string,
  maxWidth: number = 1600,
  maxHeight: number = 1600,
  quality: number = 0.85
): Promise<string> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return base64DataUrl;
  }

  if (base64DataUrl.length < 500000) {
    return base64DataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let w = img.width;
      let h = img.height;

      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64DataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const isPng = base64DataUrl.startsWith('data:image/png');
      const outputType = isPng ? 'image/png' : 'image/jpeg';
      const compressed = canvas.toDataURL(outputType, quality);
      resolve(compressed.length < base64DataUrl.length ? compressed : base64DataUrl);
    };
    img.onerror = () => resolve(base64DataUrl);
    img.src = base64DataUrl;
  });
}

/**
 * Saves a base64 asset into whiteboards/{boardId}/assets/{assetId} in Firestore.
 * Uses SHA-256 content hash for deduplication and asset ID generation (asset_${sha256Hash}).
 * Returns metadata ONLY (assetId, mimeType, encodedByteSize) without base64 or downloadURL.
 */
export async function saveBoardAsset(
  boardId: string,
  providedAssetId: string | undefined,
  base64DataUrl: string,
  contentType: string = "image/png",
  userId?: string
): Promise<SavedAssetMeta> {
  let finalBase64 = base64DataUrl;
  if (contentType.startsWith('image/')) {
    finalBase64 = await compressImageBase64(base64DataUrl);
  }

  const encodedByteSize = new TextEncoder().encode(finalBase64).byteLength;
  const contentHash = await computeSHA256Hash(finalBase64);
  const hashKey = `${boardId}:${contentHash}`;

  // Deterministic assetId based on SHA-256 hash if not explicitly provided
  const assetId = providedAssetId || `asset_${contentHash.slice(0, 32)}`;

  // Deduplication check: Reuse existing asset document if identical asset exists for this board
  const existingAssetId = hashToAssetIdMap.get(hashKey);
  if (existingAssetId && assetCacheMap.has(`${boardId}:${existingAssetId}`)) {
    const cached = assetCacheMap.get(`${boardId}:${existingAssetId}`)!;
    return {
      assetId: cached.assetId,
      mimeType: cached.mimeType,
      encodedByteSize: cached.encodedByteSize,
      width: cached.width,
      height: cached.height,
    };
  }

  const assetDoc: BoardAssetDoc = {
    assetId,
    encoding: 'base64',
    mimeType: contentType,
    data: finalBase64,
    encodedByteSize,
    contentHash,
    createdAt: Date.now(),
    createdBy: userId || 'anonymous',
  };

  // Enforce document byte size check
  const documentBytes = new TextEncoder().encode(JSON.stringify(assetDoc)).byteLength;
  if (documentBytes > MAX_ASSET_DOCUMENT_BYTES) {
    throw new Error(
      `File payload (${Math.round(documentBytes / 1024)}KB) exceeds maximum safe Firestore document size limit (${Math.round(MAX_ASSET_DOCUMENT_BYTES / 1024)}KB). Please upload a smaller file.`
    );
  }

  // Cache locally
  const cacheKey = `${boardId}:${assetId}`;
  assetCacheMap.set(cacheKey, assetDoc);
  hashToAssetIdMap.set(hashKey, assetId);

  if (isSandboxEnvironment()) {
    return {
      assetId,
      mimeType: contentType,
      encodedByteSize,
    };
  }

  try {
    const assetRef = doc(db, 'whiteboards', boardId, 'assets', assetId);

    // Check existence first to avoid redundant writes for deterministic SHA-256 assets
    const assetSnap = await getDoc(assetRef);
    if (assetSnap.exists()) {
      trackOperation('read', 'asset-doc-exist-check', 1);
      const existingData = assetSnap.data() as BoardAssetDoc;
      assetCacheMap.set(cacheKey, existingData);
      hashToAssetIdMap.set(hashKey, assetId);
      return {
        assetId,
        mimeType: existingData.mimeType,
        encodedByteSize: existingData.encodedByteSize,
        width: existingData.width,
        height: existingData.height,
      };
    }

    await setDoc(assetRef, assetDoc);
    trackOperation('write', 'asset-doc-write', 1);

    return {
      assetId,
      mimeType: contentType,
      encodedByteSize,
    };
  } catch (err) {
    // Clear failed cache entries and reject without falling back to in-memory base64 string
    assetCacheMap.delete(cacheKey);
    hashToAssetIdMap.delete(hashKey);
    console.error(`Firestore asset write failed for ${assetId}:`, err);
    throw new Error(`Failed to save asset document: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Save board asset function already returns SavedAssetMeta only.

/**
 * Loads a base64 asset document from whiteboards/{boardId}/assets/{assetId}.
 * Utilizes in-memory caching and request deduplication.
 */
export async function getBoardAsset(
  boardId: string,
  assetId: string
): Promise<BoardAssetDoc | null> {
  const cacheKey = `${boardId}:${assetId}`;
  if (assetCacheMap.has(cacheKey)) {
    return assetCacheMap.get(cacheKey)!;
  }

  if (inFlightAssetRequests.has(cacheKey)) {
    return inFlightAssetRequests.get(cacheKey)!;
  }

  if (isSandboxEnvironment()) {
    return null;
  }

  const fetchPromise = (async () => {
    try {
      const assetRef = doc(db, 'whiteboards', boardId, 'assets', assetId);
      const snap = await getDoc(assetRef);
      if (snap.exists()) {
        trackOperation('read', 'asset-doc-read', 1);
        const assetDoc = snap.data() as BoardAssetDoc;
        assetCacheMap.set(cacheKey, assetDoc);
        if (assetDoc.contentHash) {
          hashToAssetIdMap.set(`${boardId}:${assetDoc.contentHash}`, assetId);
        }
        return assetDoc;
      }
      return null;
    } catch (err) {
      console.error(`Error loading asset ${assetId}:`, err);
      return null;
    } finally {
      inFlightAssetRequests.delete(cacheKey);
    }
  })();

  inFlightAssetRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Safely deletes an asset document from Firestore subcollection if no active element references it.
 */
export async function deleteAssetFromStorage(
  boardId: string,
  assetId: string,
  activeElementAssetIds?: Set<string>
): Promise<void> {
  if (!assetId || isSandboxEnvironment()) return;

  // Orphan protection: Do not delete if an element still references this assetId
  if (activeElementAssetIds && activeElementAssetIds.has(assetId)) {
    return;
  }

  const cacheKey = `${boardId}:${assetId}`;
  const cached = assetCacheMap.get(cacheKey);
  if (cached && cached.contentHash) {
    hashToAssetIdMap.delete(`${boardId}:${cached.contentHash}`);
  }
  assetCacheMap.delete(cacheKey);

  try {
    const assetRef = doc(db, 'whiteboards', boardId, 'assets', assetId);
    await deleteDoc(assetRef);
    trackOperation('delete', 'asset-doc-delete', 1);
  } catch (err) {
    console.warn(`Failed to delete asset ${assetId}:`, err);
  }
}

/**
 * Clears in-memory asset cache
 */
export function clearAssetCache(boardId?: string): void {
  if (boardId) {
    for (const key of assetCacheMap.keys()) {
      if (key.startsWith(`${boardId}:`)) {
        assetCacheMap.delete(key);
      }
    }
  } else {
    assetCacheMap.clear();
    hashToAssetIdMap.clear();
    inFlightAssetRequests.clear();
  }
}
