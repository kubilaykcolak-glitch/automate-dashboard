import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { getMonthlyUsage } from "@/lib/firebase/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

async function run<T>(
  name: string,
  fn: () => Promise<T>
): Promise<Check & { value?: T }> {
  try {
    const value = await fn();
    return { name, ok: true, value };
  } catch (e) {
    return {
      name,
      ok: false,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

export async function GET() {
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    has_FIREBASE_ADMIN_PROJECT_ID: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    has_FIREBASE_ADMIN_CLIENT_EMAIL: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    has_FIREBASE_ADMIN_PRIVATE_KEY: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    private_key_starts_with: (
      process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? ""
    ).slice(0, 30),
    private_key_contains_literal_backslash_n:
      (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").includes("\\n"),
    private_key_contains_real_newline: (
      process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? ""
    ).includes("\n"),
    private_key_length: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").length,
    has_ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    has_NEXT_PUBLIC_FIREBASE_API_KEY:
      !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    has_NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    has_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    BYPASS_PAYMENT: process.env.BYPASS_PAYMENT ?? null,
    ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? null,
  };

  const checks: Check[] = [];

  checks.push(
    await run("adminAuth.listUsers(1)", async () => {
      const result = await adminAuth.listUsers(1);
      return { count: result.users.length };
    })
  );

  checks.push(
    await run("adminDb read /users (limit 1)", async () => {
      const snap = await adminDb.collection("users").limit(1).get();
      return { docs: snap.size };
    })
  );

  const sessionCheck = await run("getSessionUser()", async () => {
    const s = await getSessionUser();
    return s ? { uid: s.uid, email: s.email ?? null } : null;
  });
  checks.push({
    name: sessionCheck.name,
    ok: sessionCheck.ok,
    detail: sessionCheck.detail,
  });

  if (sessionCheck.ok && sessionCheck.value) {
    const uid = sessionCheck.value.uid;
    checks.push(
      await run(`adminDb read /users/${uid}`, async () => {
        const snap = await adminDb.collection("users").doc(uid).get();
        return { exists: snap.exists };
      })
    );
    checks.push(
      await run("getMonthlyUsage()", async () => {
        return await getMonthlyUsage(uid);
      })
    );
    checks.push(
      await run(`count /users/${uid}/agents`, async () => {
        const snap = await adminDb
          .collection("users")
          .doc(uid)
          .collection("agents")
          .count()
          .get();
        return { count: snap.data().count };
      })
    );
  }

  return NextResponse.json({ env, checks }, { status: 200 });
}
