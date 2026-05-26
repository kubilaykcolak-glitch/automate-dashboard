import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./client";

export interface AgentSessionSummary {
  id: string;
  agentId: string;
  status: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  lastMessageAt: Timestamp | null;
  lastMessagePreview: string | null;
}

export interface AgentSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Timestamp | null;
}

function sessionsCollection(uid: string) {
  return collection(db, "users", uid, "agentSessions");
}

function messagesCollection(uid: string, sessionId: string) {
  return collection(db, "users", uid, "agentSessions", sessionId, "messages");
}

/**
 * Returns every session for an agent, newest first. Backed by the Firestore
 * composite index on (agentId, updatedAt). Firebase will prompt you with a
 * one-click index-creation link the first time this runs.
 */
export async function getSessions(
  uid: string,
  agentId: string
): Promise<AgentSessionSummary[]> {
  const q = query(
    sessionsCollection(uid),
    where("agentId", "==", agentId),
    orderBy("updatedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Partial<AgentSessionSummary> & {
      agentId?: string;
    };
    return {
      id: d.id,
      agentId: data.agentId ?? agentId,
      status: data.status ?? "active",
      createdAt: (data.createdAt as Timestamp | undefined) ?? null,
      updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
      lastMessageAt: (data.lastMessageAt as Timestamp | undefined) ?? null,
      lastMessagePreview: data.lastMessagePreview ?? null,
    };
  });
}

export async function getMessages(
  uid: string,
  sessionId: string
): Promise<AgentSessionMessage[]> {
  // Confirm the session exists first so a missing session is surfaced clearly.
  const sessionRef = doc(db, "users", uid, "agentSessions", sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) {
    throw new Error("Session not found.");
  }
  const snap = await getDocs(
    query(messagesCollection(uid, sessionId), orderBy("createdAt", "asc"))
  );
  return snap.docs.map((d) => {
    const data = d.data() as {
      role?: "user" | "assistant";
      content?: string;
      createdAt?: Timestamp;
    };
    return {
      id: d.id,
      role: data.role === "assistant" ? "assistant" : "user",
      content: data.content ?? "",
      createdAt: data.createdAt ?? null,
    };
  });
}

/**
 * Deletes the session document and every message in its `messages`
 * subcollection. The client SDK doesn't support recursive deletes natively, so
 * we enumerate in batches of 500 and commit until empty. Rules already restrict
 * each subcollection doc to its owner, so the per-message deletes are allowed.
 */
export async function deleteSession(
  uid: string,
  sessionId: string
): Promise<void> {
  const sessionRef = doc(db, "users", uid, "agentSessions", sessionId);

  // Walk the messages subcollection in pages of 500.
  while (true) {
    const page = await getDocs(
      query(messagesCollection(uid, sessionId), limit(500))
    );
    if (page.empty) break;
    const batch = writeBatch(db);
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < 500) break;
  }

  await deleteDoc(sessionRef);
}
