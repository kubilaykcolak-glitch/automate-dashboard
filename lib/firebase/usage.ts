import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";

export const FREE_PLAN_MONTHLY_LIMIT = 100;
export const PAID_PLAN_MONTHLY_LIMIT = 1000;

export type Plan = "free" | "paid";

export interface MonthlyUsage {
  month: string;
  count: number;
  plan: Plan;
  limit: number;
  remaining: number;
}

/**
 * Returns the current month key in the user's local-ish timezone using UTC
 * to keep the boundaries stable across servers. Format: "YYYY-MM".
 */
export function currentMonthKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function planLimit(plan: Plan): number {
  return plan === "paid" ? PAID_PLAN_MONTHLY_LIMIT : FREE_PLAN_MONTHLY_LIMIT;
}

async function resolvePlan(uid: string): Promise<Plan> {
  const snap = await adminDb.collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const status = (data.subscriptionStatus as string | undefined) ?? "none";
  const email = ((data.email as string | undefined) ?? "").toLowerCase();

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (email && adminEmails.includes(email)) return "paid";

  return status === "active" || status === "trialing" ? "paid" : "free";
}

export async function getMonthlyUsage(
  uid: string,
  month: string = currentMonthKey()
): Promise<MonthlyUsage> {
  const [plan, snap] = await Promise.all([
    resolvePlan(uid),
    adminDb.collection("users").doc(uid).collection("usage").doc(month).get(),
  ]);
  const count = (snap.data()?.count as number | undefined) ?? 0;
  const limit = planLimit(plan);
  return {
    month,
    count,
    plan,
    limit,
    remaining: Math.max(0, limit - count),
  };
}

/**
 * Atomically increments the monthly count. Returns the new count *and* the
 * plan limit so callers can react if the user just crossed it.
 */
export async function incrementMonthlyUsage(
  uid: string,
  by: number = 1
): Promise<MonthlyUsage> {
  const month = currentMonthKey();
  const ref = adminDb.collection("users").doc(uid).collection("usage").doc(month);
  await ref.set(
    {
      month,
      count: FieldValue.increment(by),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  // Re-read to return a fresh snapshot.
  return getMonthlyUsage(uid, month);
}
