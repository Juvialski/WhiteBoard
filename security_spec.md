# Firestore Security Specification (TDD SPEC)

## 1. Data Invariants

1. **Global Maintenance Lock**: When the application is suspended (`appEnabled == false` in `/admin_settings/global`), no read or write operations can be performed by any standard user. Only the system administrator (`al.matubis17@gmail.com`) is allowed access.
2. **Strict Presence Ownership**: A user's presence document (`/presence/{userId}`) can only be created or updated by that specific authenticated user (`request.auth.uid == userId`).
3. **Strict Cursor Ownership**: A user's transient cursor document (`/whiteboards/{boardId}/cursors/{cursorId}`) can only be created, updated, or deleted by that specific authenticated user (`request.auth.uid == cursorId`).
4. **Whiteboard Authorization & Access Control**:
   - Standard students can only create or edit elements on a whiteboard if `studentsCanWrite` is enabled (`true`) on the parent whiteboard document.
   - Teachers and administrators can always create, edit, or delete board elements.
   - Deleting a whiteboard is restricted strictly to teachers or administrators.

---

## 2. The "Dirty Dozen" Threat Payloads

Here are twelve highly targeted attack payloads that the secure ruleset mathematically blocks:

| Payload ID | Description / Attack Vector | Target Path | Attempted Action | Result |
|---|---|---|---|---|
| **T01** | Bypassing global suspension lock while app is disabled. | `/whiteboards/board_1` | `get` / `create` | `PERMISSION_DENIED` |
| **T02** | Identity Spoofing: Overwriting another user's presence document. | `/presence/victim_user_123` | `create` / `update` | `PERMISSION_DENIED` |
| **T03** | Cursor Hijacking: Writing coordinates on behalf of another student. | `/whiteboards/b1/cursors/victim_uid` | `create` / `update` | `PERMISSION_DENIED` |
| **T04** | Unauthorized Board Deletion: A standard student deleting a teacher's board. | `/whiteboards/board_1` | `delete` | `PERMISSION_DENIED` |
| **T05** | Locked Canvas Override: Modifying elements when `studentsCanWrite` is false. | `/whiteboards/locked_b1/elements/el_1` | `update` | `PERMISSION_DENIED` |
| **T06** | Orphaned Element Creation: Creating an element under a non-existent board. | `/whiteboards/invalid_board_id/elements/el_1` | `create` | `PERMISSION_DENIED` |
| **T07** | ID Poisoning: Creating a whiteboard with an invalid non-alphanumeric ID. | `/whiteboards/$$$bad_id$$$` | `create` | `PERMISSION_DENIED` |
| **T08** | Privilege Escalation: Self-assigning "teacher" role in presence profiles. | `/presence/my_user_id` | `update` with `role: "teacher"` (if not verified) | `PERMISSION_DENIED` |
| **T09** | Volume Exhaustion: Writing a massive 1MB string name or description. | `/whiteboards/board_1` | `create` | `PERMISSION_DENIED` |
| **T10** | Unsigned Presence Creation: Registering presence anonymously without auth. | `/presence/guest_user` | `create` | `PERMISSION_DENIED` |
| **T11** | Rogue Element Erasure: A student deleting elements on a locked teacher board. | `/whiteboards/locked_b1/elements/el_1` | `delete` | `PERMISSION_DENIED` |
| **T12** | Unauthorized Admin Setting Write: Writing custom rules to the global settings. | `/admin_settings/global` | `write` | `PERMISSION_DENIED` |

---

## 3. Test Runner Design

These assertions are mapped into the unit test assertions of `firestore.rules.test.ts` ensuring zero-regression security coverage.
