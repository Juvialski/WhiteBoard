const fs = require('fs');
let code = fs.readFileSync('src/components/WhiteboardCanvas.tsx', 'utf8');

const regex = /\/\/ Update shards[\s\S]*?console\.log\("Migration successful!"\);/;

const replacement = `             // Update shards
             for (const blobId of Object.keys(shardUpdates)) {
               if (Object.keys(shardUpdates[blobId]).length > 0) {
                 try {
                   await setDoc(doc(db, "whiteboards", boardId, "elements", blobId), { data: shardUpdates[blobId] }, { merge: true });
                 } catch (err) {
                   console.error("Migration setDoc failed for blob", blobId, err);
                   showSyncToast("Migration setDoc failed: " + err.message, "error", 10000);
                   throw err;
                 }
               }
             }
             
             // Delete strays in batches of 400
             for (let i = 0; i < straysToDelete.length; i += 400) {
                const chunk = straysToDelete.slice(i, i + 400);
                const deleteBatch = writeBatch(db);
                chunk.forEach(strayId => {
                   deleteBatch.delete(doc(db, "whiteboards", boardId, "elements", strayId));
                });
                try {
                  await deleteBatch.commit();
                } catch (err) {
                   console.error("Migration deleteBatch failed for chunk", i, err);
                   showSyncToast("Migration deleteBatch failed: " + err.message, "error", 10000);
                   throw err;
                }
             }
             console.log("Migration successful!");`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/components/WhiteboardCanvas.tsx', code);
