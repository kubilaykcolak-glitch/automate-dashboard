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

  // Composite query: where(agentId) + orderBy(updatedAt). Firestore requires
  // a composite index on (agentId asc, updatedAt desc). If it doesn't exist
  // the query throws FAILED_PRECONDITION with a one-click URL to create it.
  // Catch and surface the real error so the client can guide the user
  // instead of showing a generic "Failed to load sessions".
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof Error && "code" in err
        ? (err as { code?: number | string }).code
        : undefined;
    console.error("[sessions list] query failed", { uid: session.uid, agentId, code, message });

    // FAILED_PRECONDITION = missing composite index. Firestore embeds a
    // create-index URL in the error string — pass that URL through to the
    // client so the user can click it (the URL inherently includes the
    // project ID by design; that's not a leak, it's the API). We do NOT
    // surface the full Firestore error blob to the client — that contains
    // document paths and other internal metadata users don't need to see.
    if (
      typeof message === "string" &&
      (message.includes("FAILED_PRECONDITION") ||
        message.includes("requires an index"))
    ) {
      const urlMatch = message.match(/https:\/\/console\.firebase\.google\.com\/[^\s"]+/);
      return NextResponse.json(
        {
          error:
            "Firestore is missing a composite index for this query. Create it once and this stops happening.",
          code: "missing_index",
          createIndexUrl: urlMatch ? urlMatch[0] : null,
        },
        { status: 503 }
      );
    }

    // Generic failure — only the server log gets the underlying message.
    return NextResponse.json(
      { error: "Failed to load sessions." },
      { status: 500 }
    );
  }
}
