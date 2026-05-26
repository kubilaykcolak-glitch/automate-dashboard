import "server-only";
import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "./admin";

export type ActivityType =
  | "message_sent"
  | "session_started"
  | "files_attached"
  | "agent_activated"
  | "integration_connected"
  | "file_uploaded";

export interface ActivityEntry {
  type: ActivityType;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget activity log write. Never throws — activity logging is
 *  best-effort and should not break the primary code path. */
export async function logActivity(
  uid: string,
  entry: ActivityEntry
): Promise<void> {
  try {
    await adminDb
      .collection("users")
      .doc(uid)
      .collection("activity")
      .add({
        type: entry.type,
        message: entry.message,
        metadata: entry.metadata ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
  } catch (e) {
    console.warn("Failed to log activity:", e);
  }
}

/** Stage an activity write inside an existing batch — useful when the activity
 *  is part of an atomic transaction with the underlying business write. */
export function addActivityToBatch(
  batch: WriteBatch,
  uid: string,
  entry: ActivityEntry
): void {
  const ref = adminDb
    .collection("users")
    .doc(uid)
    .collection("activity")
    .doc();
  batch.set(ref, {
    type: entry.type,
    message: entry.message,
    metadata: entry.metadata ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
