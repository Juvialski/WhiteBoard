import {
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
} from 'firebase/firestore';
import { db } from '../src/firebase';

export async function cleanupStaleCursors(boardId: string, maxAgeMs: number = 60000): Promise<number> {
  console.log(`Cleaning up stale cursor documents for board: ${boardId}...`);
  const cursorsRef = collection(db, 'whiteboards', boardId, 'cursors');
  const snap = await getDocs(query(cursorsRef));

  if (snap.empty) {
    console.log(`No cursor documents found for board ${boardId}.`);
    return 0;
  }

  const now = Date.now();
  const batch = writeBatch(db);
  let count = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const lastActive = data.lastActive || 0;
    if (now - lastActive > maxAgeMs) {
      batch.delete(docSnap.ref);
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully deleted ${count} stale cursor documents for board ${boardId}.`);
  } else {
    console.log(`All ${snap.size} cursor documents are fresh.`);
  }

  return count;
}
