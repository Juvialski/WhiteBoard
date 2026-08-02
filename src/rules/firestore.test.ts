import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { setDoc, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

describe('Firestore Security Rules', () => {
  beforeAll(async () => {
    // Fail immediately if test environment fails to initialize
    testEnv = await initializeTestEnvironment({
      projectId: 'lucid-spark-test-rules',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      }
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // Seed board helper
  async function seedBoard(boardId: string, data: any) {
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'whiteboards', boardId), {
        ownerUid: 'owner_1',
        accessMode: 'private',
        editorUids: [],
        viewerUids: [],
        studentsCanWrite: false,
        schemaVersion: 3,
        shardLayoutVersion: 2,
        shardCount: 160,
        status: 'ready',
        ...data,
      });
    });
  }

  // 1. Unauthenticated private-board read denied
  it('denies unauthenticated users from reading a private board', async () => {
    await seedBoard('board_private', { ownerUid: 'owner_1', accessMode: 'private' });
    const context = testEnv.unauthenticatedContext();
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_private');
    await expect(getDoc(docRef)).rejects.toThrow();
  });

  // 2. Owner read and write allowed
  it('allows the owner to read and write to their board', async () => {
    await seedBoard('board_owner', { ownerUid: 'owner_1' });
    const context = testEnv.authenticatedContext('owner_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_owner');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { status: 'archived' })).resolves.not.toThrow();
  });

  // 3. Editor read and ordinary write allowed
  it('allows editors to read and perform ordinary updates', async () => {
    await seedBoard('board_editor', { ownerUid: 'owner_1', editorUids: ['editor_1'] });
    const context = testEnv.authenticatedContext('editor_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_editor');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { description: 'Editor update', currentRevision: 1, changedShardIds: [] })).resolves.not.toThrow();
  });

  // 4. Editor cannot modify owner or ACL fields
  it('denies editors from modifying owner or ACL settings', async () => {
    await seedBoard('board_editor_acl', { ownerUid: 'owner_1', editorUids: ['editor_1'] });
    const context = testEnv.authenticatedContext('editor_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_editor_acl');

    await expect(updateDoc(docRef, { ownerUid: 'editor_1' })).rejects.toThrow();
    await expect(updateDoc(docRef, { accessMode: 'link-view' })).rejects.toThrow();
    await expect(updateDoc(docRef, { schemaVersion: 4 })).rejects.toThrow();
    await expect(updateDoc(docRef, { shardLayoutVersion: 3 })).rejects.toThrow();
    await expect(updateDoc(docRef, { shardCount: 999 })).rejects.toThrow();
    await expect(updateDoc(docRef, { migrationStatus: 'in-progress' })).rejects.toThrow();
    await expect(updateDoc(docRef, { status: 'archived' })).rejects.toThrow();
  });

  // 5. Viewer read allowed and write denied
  it('allows viewers to read but denies write access', async () => {
    await seedBoard('board_viewer', { ownerUid: 'owner_1', viewerUids: ['viewer_1'] });
    const context = testEnv.authenticatedContext('viewer_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_viewer');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { status: 'changed' })).rejects.toThrow();
  });

  // 6. Unrelated private-board user denied
  it('denies unrelated users from reading or writing a private board', async () => {
    await seedBoard('board_private_unrelated', { ownerUid: 'owner_1', accessMode: 'private' });
    const context = testEnv.authenticatedContext('unrelated_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_private_unrelated');

    await expect(getDoc(docRef)).rejects.toThrow();
    await expect(updateDoc(docRef, { status: 'hacked' })).rejects.toThrow();
  });

  // 7. Link-view user can read but not write
  it('allows link-view visitors to read but denies them write access', async () => {
    await seedBoard('board_link_view', { ownerUid: 'owner_1', accessMode: 'link-view' });
    const context = testEnv.authenticatedContext('link_visitor_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_link_view');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { status: 'modified' })).rejects.toThrow();
  });

  // 8. Link-edit user can write when studentsCanWrite is true
  it('allows link-edit visitors to write when studentsCanWrite is enabled', async () => {
    await seedBoard('board_link_edit_yes', { ownerUid: 'owner_1', accessMode: 'link-edit', studentsCanWrite: true });
    const context = testEnv.authenticatedContext('link_visitor_2');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_link_edit_yes');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { description: 'Link visitor update', currentRevision: 1, changedShardIds: [] })).resolves.not.toThrow();
  });

  // 9. Link-edit user cannot write when studentsCanWrite is false
  it('denies link-edit visitors from writing when studentsCanWrite is disabled', async () => {
    await seedBoard('board_link_edit_no', { ownerUid: 'owner_1', accessMode: 'link-edit', studentsCanWrite: false });
    const context = testEnv.authenticatedContext('link_visitor_3');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_link_edit_no');

    await expect(updateDoc(docRef, { description: 'Denied write', currentRevision: 1, changedShardIds: [] })).rejects.toThrow();
  });

  // 10. Link visitor cannot add themselves to editorUids
  it('denies link visitors from adding themselves to editorUids', async () => {
    await seedBoard('board_link_no_self_promo', { ownerUid: 'owner_1', accessMode: 'link-edit', studentsCanWrite: true, editorUids: [] });
    const context = testEnv.authenticatedContext('visitor_evil');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_link_no_self_promo');

    await expect(updateDoc(docRef, { editorUids: ['visitor_evil'] })).rejects.toThrow();
    await expect(updateDoc(docRef, { schemaVersion: 4 })).rejects.toThrow();
    await expect(updateDoc(docRef, { shardCount: 20 })).rejects.toThrow();
    await expect(updateDoc(docRef, { status: 'archived' })).rejects.toThrow();
  });

  // 11. Owner can change access settings
  it('allows owners to change access and ACL settings', async () => {
    await seedBoard('board_owner_acl_change', { ownerUid: 'owner_1' });
    const context = testEnv.authenticatedContext('owner_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_owner_acl_change');

    await expect(updateDoc(docRef, { accessMode: 'link-edit', studentsCanWrite: true })).resolves.not.toThrow();
  });

  // 12. Admin custom claim works
  it('allows admin users with admin custom claims full access', async () => {
    await seedBoard('board_admin_test', { ownerUid: 'owner_1', accessMode: 'private' });
    const context = testEnv.authenticatedContext('admin_user', { admin: true });
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_admin_test');

    await expect(getDoc(docRef)).resolves.not.toThrow();
    await expect(updateDoc(docRef, { status: 'admin-overridden' })).resolves.not.toThrow();
  });

  // 13. Hardcoded email grants no privilege
  it('does not grant privileges to specific emails without authentic credentials', async () => {
    await seedBoard('board_email_check', { ownerUid: 'owner_1', accessMode: 'private' });
    const context = testEnv.authenticatedContext('some_evil_uid', { email: 'al.matubis17@gmail.com' });
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_email_check');

    await expect(getDoc(docRef)).rejects.toThrow();
  });

  // 14. Asset permissions follow board permissions
  it('ensures asset subcollection permissions follow the parent board ACL', async () => {
    await seedBoard('board_assets_check', { ownerUid: 'owner_1', accessMode: 'private' });
    
    // Owner can write asset
    const ownerCtx = testEnv.authenticatedContext('owner_1');
    const ownerDb = ownerCtx.firestore();
    const assetRef = doc(ownerDb, 'whiteboards', 'board_assets_check', 'assets', 'asset_1');
    await expect(setDoc(assetRef, {
      assetId: 'asset_1',
      encoding: 'base64',
      data: 'abc',
      encodedByteSize: 3,
      mimeType: 'image/png',
      contentHash: 'hash1'
    })).resolves.not.toThrow();

    // Unrelated user cannot read asset
    const strangerCtx = testEnv.authenticatedContext('stranger_1');
    const strangerDb = strangerCtx.firestore();
    const strangerAssetRef = doc(strangerDb, 'whiteboards', 'board_assets_check', 'assets', 'asset_1');
    await expect(getDoc(strangerAssetRef)).rejects.toThrow();
  });

  // 15. stateShards permissions follow board permissions
  it('ensures schema-2 stateShards permissions follow board ACL', async () => {
    await seedBoard('board_shards_check', { ownerUid: 'owner_1', accessMode: 'private' });

    const ownerCtx = testEnv.authenticatedContext('owner_1');
    const shardRef = doc(ownerCtx.firestore(), 'whiteboards', 'board_shards_check', 'stateShards', 'shard_0');
    await expect(setDoc(shardRef, { revision: 1, elements: {}, tombstones: {} })).resolves.not.toThrow();

    const strangerCtx = testEnv.authenticatedContext('stranger_1');
    const strangerShardRef = doc(strangerCtx.firestore(), 'whiteboards', 'board_shards_check', 'stateShards', 'shard_0');
    await expect(getDoc(strangerShardRef)).rejects.toThrow();
  });

  // 16. stateShardsV3 permissions follow board permissions
  it('ensures schema-3 stateShardsV3 permissions follow board ACL', async () => {
    await seedBoard('board_shard_v3_check', { ownerUid: 'owner_1', accessMode: 'private' });

    const ownerCtx = testEnv.authenticatedContext('owner_1');
    const shardRef = doc(ownerCtx.firestore(), 'whiteboards', 'board_shard_v3_check', 'stateShardsV3', 'shard_0');
    await expect(setDoc(shardRef, { revision: 1, elements: {}, tombstones: {} })).resolves.not.toThrow();

    const strangerCtx = testEnv.authenticatedContext('stranger_1');
    const strangerShardRef = doc(strangerCtx.firestore(), 'whiteboards', 'board_shard_v3_check', 'stateShardsV3', 'shard_0');
    await expect(getDoc(strangerShardRef)).rejects.toThrow();
  });

  // 17. Oversized asset is rejected
  it('rejects assets that exceed size limits', async () => {
    await seedBoard('board_oversized', { ownerUid: 'owner_1' });
    const context = testEnv.authenticatedContext('owner_1');
    const db = context.firestore();
    const docRef = doc(db, 'whiteboards', 'board_oversized', 'assets', 'huge_asset');

    await expect(setDoc(docRef, {
      assetId: 'huge_asset',
      encoding: 'base64',
      data: 'a'.repeat(800000), // exceeds 750,000 bytes limit
      encodedByteSize: 800000,
      mimeType: 'image/png',
      contentHash: 'hash2'
    })).rejects.toThrow();
  });

  // 18. User can write only their own presence
  it('allows users to write only their own presence documents under presence collection', async () => {
    const context = testEnv.authenticatedContext('user_123');
    const db = context.firestore();
    const myPresence = doc(db, 'presence', 'user_123');
    const strangerPresence = doc(db, 'presence', 'user_456');

    await expect(setDoc(myPresence, { id: 'user_123', name: 'Alice', isOnline: true })).resolves.not.toThrow();
    await expect(setDoc(strangerPresence, { id: 'user_456', name: 'Bob', isOnline: true })).rejects.toThrow();
  });

  // 19. Ordinary users cannot query global presence
  it('denies ordinary users from reading or querying global presence documents of others', async () => {
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'presence', 'user_456'), { id: 'user_456', name: 'Bob' });
    });

    const context = testEnv.authenticatedContext('user_123');
    const db = context.firestore();
    const strangerPresence = doc(db, 'presence', 'user_456');

    await expect(getDoc(strangerPresence)).rejects.toThrow();
  });

  // 20. Admin can query and delete presence
  it('allows admins to query and delete presence documents', async () => {
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'presence', 'user_456'), { id: 'user_456', name: 'Bob' });
    });

    const adminCtx = testEnv.authenticatedContext('admin_1', { admin: true });
    const db = adminCtx.firestore();
    const presenceRef = doc(db, 'presence', 'user_456');

    await expect(getDoc(presenceRef)).resolves.not.toThrow();
    await expect(deleteDoc(presenceRef)).resolves.not.toThrow();
  });
});
