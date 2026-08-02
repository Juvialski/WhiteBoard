import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveBoardAsset,
  getBoardAsset,
  deleteAssetFromStorage,
  computeContentHash,
  clearAssetCache,
  MAX_SAFE_ASSET_BYTES,
} from '../storageService';

describe('Storage & Base64 Asset Firestore Subcollection Suite', () => {
  beforeEach(() => {
    clearAssetCache();
  });

  it('computes stable content hash for base64 string', () => {
    const data1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const data2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const data3 = 'data:image/png;base64,differentBase64PayloadString12345';

    const hash1 = computeContentHash(data1);
    const hash2 = computeContentHash(data2);
    const hash3 = computeContentHash(data3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it('saves asset in sandbox mode and deduplicates identical content hash', async () => {
    const boardId = 'board-asset-test';
    const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const meta1 = await saveBoardAsset(boardId, 'asset-1', base64Data, 'image/png');
    expect(meta1.assetId).toBe('asset-1');
    expect(meta1.mimeType).toBe('image/png');
    expect(meta1).not.toHaveProperty('downloadURL');

    // Duplicate upload with same base64 data should reuse existing asset
    const meta2 = await saveBoardAsset(boardId, 'asset-2', base64Data, 'image/png');
    expect(meta2.assetId).toBe('asset-1'); // Reused!
  });

  it('rejects oversized asset data exceeding safe document size limit', async () => {
    const boardId = 'board-asset-huge';
    // Create payload larger than MAX_SAFE_ASSET_BYTES
    const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(MAX_SAFE_ASSET_BYTES * 2);

    await expect(
      saveBoardAsset(boardId, 'asset-huge', hugeBase64, 'application/pdf')
    ).rejects.toThrow(/exceeds maximum safe Firestore document size limit/);
  });

  it('deletes asset safely with orphan protection', async () => {
    const boardId = 'board-delete-test';
    const activeAssetIds = new Set(['asset-in-use']);

    // Attempting to delete an active asset should be ignored
    await deleteAssetFromStorage(boardId, 'asset-in-use', activeAssetIds);
    // Attempting to delete an orphaned asset should proceed
    await deleteAssetFromStorage(boardId, 'asset-orphan', activeAssetIds);
  });
});
