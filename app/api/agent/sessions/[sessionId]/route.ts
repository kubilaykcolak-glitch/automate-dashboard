import { NextResponse, type NextRequest } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";

export const runtime = "nodejs";

interface MessageExportItem {
  filename: string;
  format: "csv" | "xlsx" | "pdf";
  size: number;
  downloadUrl: string;
  title: string | null;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string | null;
  exports?: MessageExportItem[];
  skillsUsed?: string[];
}

function tsToIso(t: unknown): string | null {
  if (!t) return null;
  if (typeof (t as Timestamp).toDate === "function") {
    return (t as Timestamp).toDate().toISOString();
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionRef = adminDb
    .collection("users")
    .doc(session.uid)
    .collection("agentSessions")
    .doc(params.sessionId);

  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const data = sessionSnap.data() as {
    agentId?: string;
    status?: string;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
  };

  const messagesSnap = await sessionRef
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();

  const messages: MessageItem[] = messagesSnap.docs.map((d) => {
    const m = d.data() as {
      role?: "user" | "assistant";
      content?: string;
      createdAt?: Timestamp;
      exports?: MessageExportItem[];
      skillsUsed?: string[];
    };
    return {
      id: d.id,
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content ?? "",
      createdAt: tsToIso(m.createdAt),
      exports: Array.isArray(m.exports) ? m.exports : [],
      skillsUsed: Array.isArray(m.skillsUsed) ? m.skillsUsed : [],
    };
  });

  return NextResponse.json({
    session: {
      id: params.sessionId,
      agentId: data.agentId ?? null,
      status: data.status ?? "active",
      createdAt: tsToIso(data.createdAt),
      updatedAt: tsToIso(data.updatedAt),
    },
    messages,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { sessionId: string } }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionRef = adminDb
    .collection("users")
    .doc(session.uid)
    .collection("agentSessions")
    .doc(params.sessionId);

  const snap = await sessionRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // recursiveDelete cleans the session doc plus the `messages` subcollection.
  await adminDb.recursiveDelete(sessionRef);

  return NextResponse.json({ ok: true });
}
