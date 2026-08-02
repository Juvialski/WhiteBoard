# Collaborative Whiteboard — Firestore Security Rules Specification

This document defines the data-driven security model and access-control matrix for the Collaborative Whiteboard application, satisfying production-grade security, anti-leakage policies, and tenant isolation constraints.

---

## 1. Access Control Matrix

| Role | Board Metadata Read | Board Metadata Write | Shards Read | Shards Write | Legacy Elements Read/Write |
|---|---|---|---|---|---|
| **Board Owner / Creator** | ✅ Yes | ✅ Yes (Full) | ✅ Yes | ✅ Yes (Full) | ❌ Denied |
| **Assigned Student (Member)** | ✅ Yes | ✅ If `studentsCanWrite` | ✅ Yes | ✅ If `studentsCanWrite` | ❌ Denied |
| **Guest / Anonymous User** | ✅ If `studentsCanWrite` | ❌ No | ✅ If `studentsCanWrite` | ❌ No | ❌ Denied |
| **Admin User** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (Admin Only) |

---

## 2. Document Fields Validation

### Whiteboards Collection (`/whiteboards/{boardId}`)
- `name`: string
- `createdBy`: string (Owner name or ID)
- `studentId`: string (Lowercased assigned student identifier)
- `studentsCanWrite`: boolean
- `schemaVersion`: integer (Must be 2)
- `currentRevision`: integer

### StateShards Subcollection (`/whiteboards/{boardId}/stateShards/{shardId}`)
- `shardId`: string (shard_0 to shard_19)
- `elements`: Map of elementId to Element
- `updatedAt`: timestamp or integer

---

## 3. Test Plan

1. **Owner Access**:
   - Verify that the user matching `createdBy` (or the owner's credential) can create, read, update, and delete the board and its sub-collection shards.
2. **Student Member Access**:
   - Verify that an assigned student whose ID matches the board's `studentId` can read the board and shards.
   - Verify that the assigned student can write to shards and board metadata ONLY when `studentsCanWrite` is `true`.
3. **Guest Access**:
   - Verify that anonymous users can read the board metadata and shards ONLY when `studentsCanWrite` is `true`.
   - Verify that anonymous users can NEVER write to board metadata or shards.
4. **Legacy Elements Protection**:
   - Verify that ordinary clients are strictly blocked from reading or writing the `/elements` sub-collection, reserving access strictly to administrators.
