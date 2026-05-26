import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  SESSION_COOKIE_NAME,
  getSessionUser,
} from "@/lib/firebase/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = session.uid;

  try {
    // Recursively delete the user document and every subcollection beneath it.
    const userRef = adminDb.collection("users").doc(uid);
    await adminDb.recursiveDelete(userRef);

    // Revoke any outstanding session cookies before deleting the auth record.
    await adminAuth.revokeRefreshTokens(uid).catch(() => undefined);
    await adminAuth.deleteUser(uid);

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      maxAge: 0,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return response;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
