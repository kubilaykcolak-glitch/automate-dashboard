import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "firebase/storage";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db, storage } from "./client";
import type { StoredFile } from "@/types/database";

export const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

export const BYPASS_STORAGE =
  process.env.NEXT_PUBLIC_DEV_BYPASS_STORAGE === "true";

function filesCollection(uid: string) {
  return collection(db, "users", uid, "files");
}

function storagePathFor(uid: string, fileName: string) {
  return `users/${uid}/files/${fileName}`;
}

function docIdFor(fileName: string) {
  // Firestore document IDs cannot contain "/". Encode to be safe.
  return encodeURIComponent(fileName);
}

function snapshotToFile(id: string, data: Record<string, unknown>): StoredFile {
  return {
    id,
    name: (data.name as string) ?? id,
    size: typeof data.size === "number" ? (data.size as number) : 0,
    type: (data.type as string) ?? "",
    storagePath: (data.storagePath as string) ?? "",
    downloadUrl: (data.downloadUrl as string) ?? "",
    createdAt: (data.createdAt as StoredFile["createdAt"]) ?? null,
  };
}

export function uploadFile(
  uid: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<StoredFile> {
  if (BYPASS_STORAGE) {
    return uploadFileMetadataOnly(uid, file, onProgress);
  }
  return new Promise((resolve, reject) => {
    const storagePath = storagePathFor(uid, file.name);
    const objectRef = ref(storage, storagePath);
    const task = uploadBytesResumable(objectRef, file, {
      contentType: file.type || undefined,
    });

    task.on(
      "state_changed",
      (snap) => {
        if (snap.totalBytes > 0) {
          onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      (err) => reject(err),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(objectRef);
          const id = docIdFor(file.name);
          const payload = {
            name: file.name,
            size: file.size,
            type: file.type || "",
            storagePath,
            downloadUrl,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(filesCollection(uid), id), payload);
          resolve({
            id,
            name: file.name,
            size: file.size,
            type: file.type || "",
            storagePath,
            downloadUrl,
            createdAt: null,
          });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

async function uploadFileMetadataOnly(
  uid: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<StoredFile> {
  // Simulate a quick upload so the progress bar animates.
  for (const pct of [10, 40, 75, 100]) {
    onProgress?.(pct);
    await new Promise((r) => setTimeout(r, 80));
  }
  const id = docIdFor(file.name);
  const payload = {
    name: file.name,
    size: file.size,
    type: file.type || "",
    storagePath: "",
    downloadUrl: "",
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(filesCollection(uid), id), payload);
  return {
    id,
    name: file.name,
    size: file.size,
    type: file.type || "",
    storagePath: "",
    downloadUrl: "",
    createdAt: null,
  };
}

export async function listFiles(uid: string): Promise<StoredFile[]> {
  const snap = await getDocs(
    query(filesCollection(uid), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((d) => snapshotToFile(d.id, d.data()));
}

export function subscribeFiles(
  uid: string,
  onChange: (files: StoredFile[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(filesCollection(uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => snapshotToFile(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

export async function deleteFile(uid: string, fileName: string): Promise<void> {
  if (!BYPASS_STORAGE) {
    const storagePath = storagePathFor(uid, fileName);
    await deleteObject(ref(storage, storagePath)).catch((e) => {
      // If the object is already gone we still want to clean up Firestore.
      if (
        e instanceof Error &&
        "code" in e &&
        (e as { code?: string }).code === "storage/object-not-found"
      ) {
        return;
      }
      throw e;
    });
  }
  await deleteDoc(doc(filesCollection(uid), docIdFor(fileName)));
}

export function getDownloadUrl(uid: string, fileName: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePathFor(uid, fileName)));
}

/**
 * Uploads an avatar to users/{uid}/avatar and returns a usable URL.
 * In storage-bypass mode the image is encoded as a data URL so it can still
 * round-trip through Firestore without Firebase Storage being enabled.
 */
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (BYPASS_STORAGE) {
    if (file.size > 700 * 1024) {
      throw new Error(
        "Avatar must be under 700KB while Firebase Storage is disabled."
      );
    }
    return await readAsDataUrl(file);
  }
  const objectRef = ref(storage, `users/${uid}/avatar`);
  await uploadBytes(objectRef, file, { contentType: file.type || undefined });
  return await getDownloadURL(objectRef);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}
