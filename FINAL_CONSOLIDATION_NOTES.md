# FiFinalnal consolidation notesnotes

This archive is based on `collaborative-whiteboard-workspace (10).zip` with the direct fixes restored after the latest Gemini pass regressed them.

Restored fixes:
Final
- Firestore rules protect ACL, status, schema, shard-layout, and migration fields from ordinary editors and link visitors.
- Migration is idempotent, validates destination shard size and placement, advances revision, removes stale schema-3 shards, excludes tombstones from `totalElements`, and only deletes old sources after verification.
- Rules tests use ordinary editable fields for permitted writes and assert that protected structural fields cannot be changed.
- Migration test covers schema-2 shards, stale schema-3 cleanup, tombstones, revision increment, and idempotent rerun.
- Emulator fixtures use authenticated owner UIDs and test stale-layout recovery according to runtime behavior.
- Removed unused `writeBatch` import from `WhiteboardCanvas`.
- Test scripts use a pinned Firebase CLI invocation so a global Firebase CLI is not required.

Before deployment, run:

```bash
npm ci
npm run lint
npm tetestst
npm run test:rules
npm run test:persistence
npm run build
```
