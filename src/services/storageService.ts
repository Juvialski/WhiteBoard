import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { isSandboxEnvironment } from "../utils/firebaseSandboxGuard";

export interface StorageAssetMeta {
  storagePath: string;
  downloadURL: string;
  contentType: string;
  width?: number;
  height?: number;
  size?: number;
}

/**
 * Uploads base64 data string (data:image/png;base64,... or audio/data) to Firebase Storage.
 * Falls back gracefully to base64 data URL in sandbox environment or if storage fails.
 */
export async function uploadAssetToStorage(
  boardId: string,
  assetId: string,
  base64DataUrl: string,
  contentType: string = "image/png"
): Promise<StorageAssetMeta> {
  const estimatedSize = Math.round((base64DataUrl.length * 3) / 4);

  if (isSandboxEnvironment()) {
    return {
      storagePath: `sandbox/${boardId}/${assetId}`,
      downloadURL: base64DataUrl,
      contentType,
      size: estimatedSize,
    };
  }

  try {
    const storagePath = `whiteboards/${boardId}/assets/${assetId}`;
    const storageRef = ref(storage, storagePath);

    await uploadString(storageRef, base64DataUrl, "data_url", {
      contentType,
    });

    const downloadURL = await getDownloadURL(storageRef);

    return {
      storagePath,
      downloadURL,
      contentType,
      size: estimatedSize,
    };
  } catch (err) {
    console.warn("Storage upload failed, returning embedded URL as fallback:", err);
    return {
      storagePath: "",
      downloadURL: base64DataUrl,
      contentType,
      size: estimatedSize,
    };
  }
}

/**
 * Safely deletes an asset from Firebase Storage.
 */
export async function deleteAssetFromStorage(storagePath: string): Promise<void> {
  if (!storagePath || storagePath.startsWith("sandbox/") || isSandboxEnvironment()) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Error deleting asset from storage:", err);
  }
}
