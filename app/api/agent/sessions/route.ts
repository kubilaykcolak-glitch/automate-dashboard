import { NextResponse, type NextRequest } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";

export const runtime = "nodejs";

interface SessionListItem {
  id: string;
  agentId: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

function tsToIso(t: unknown): string | null {
  if (!t) return null;
  if (typeof (t as Timestamp).toDate === "function") {
    return (t as Timestamp).toDate().toISOString();
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json(
      { error: "Query parameter `agentId` is required." },
      { status: 400 }
    );
  }

  const snap = await adminDb
    .collection("users")
    .doc(session.uid)
    .collection("agentSessions")
    .where("agentId", "==", agentId)
    .orderBy("updatedAt", "desc")
    .get();

  const sessions: SessionListItem[] = snap.docs.map((d) => {
    const data = d.data() as {
      agentId?: string;
      status?: string;
      createdAt?: Timestamp;
      updatedAt?: Timestamp;
      lastMessageAt?: Timestamp;
      lastMessagePreview?: string;
    };
    return {
      id: d.id,
      agentId: data.agentId ?? agentId,
      status: data.status ?? "active",
      createdAt: tsToIso(data.createdAt),
      updatedAt: tsToIso(data.updatedAt),
      lastMessageAt: tsToIso(data.lastMessageAt),
      lastMessagePreview: data.lastMessagePreview ?? null,
    };
  });

  return NextResponse.json({ sessions });
}
