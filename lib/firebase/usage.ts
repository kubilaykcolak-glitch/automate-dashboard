import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { computeCostUsd, type TokenUsage } from "@/lib/anthropic/pricing";

export const FREE_PLAN_MONTHLY_LIMIT = 100;
export const PAID_PLAN_MONTHLY_LIMIT = 1000;

/**
 * Soft token budget per month, used for billing overage rather than blocking
 * usage outright. Free users get a smaller pot; paid users a larger one.
 * Overage above the budget is tracked in `overageTokens` on the monthly
 * usage doc — future metered Stripe billing reads this field.
 */
export const FREE_PLAN_MONTHLY_TOKEN_BUDGET = 500_000;
export const PAID_PLAN_MONTHLY_TOKEN_BUDGET = 5_000_000;

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

/**
 * Records the token usage and computed USD cost of a single chat round-trip
 * onto the user's monthly usage doc. Designed to be called once per message,
 * non-blocking, after the stream completes. Errors are swallowed by the
 * caller — chat already shipped, so a failed counter write is not fatal.
 *
 * Storage shape on /users/{uid}/usage/{YYYY-MM}:
 *   - inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens
 *     (cumulative counters via FieldValue.increment)
 *   - totalCostUsd (cumulative, computed from the same pricing source)
 *   - lastModel, lastUsageAt (informational)
 *
 * Future overage billing reads totalCostUsd and the plan's token budget to
 * decide whether to invoice metered overage via Stripe.
 */
export async function recordTokenUsage(
  uid: string,
  usage: TokenUsage,
  model: string
): Promise<void> {
  const month = currentMonthKey();
  const cost = computeCostUsd(usage, model);
  const ref = adminDb.collection("users").doc(uid).collection("usage").doc(month);
  await ref.set(
    {
      month,
      inputTokens: FieldValue.increment(usage.inputTokens),
      outputTokens: FieldValue.increment(usage.outputTokens),
      cacheReadInputTokens: FieldValue.increment(usage.cacheReadInputTokens),
      cacheCreationInputTokens: FieldValue.increment(
        usage.cacheCreationInputTokens
      ),
      totalCostUsd: FieldValue.increment(cost),
      lastModel: model,
      lastUsageAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Detailed monthly token + cost summary for the dashboard / billing UI. */
export interface MonthlyTokenSummary {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  /** Plan's monthly token budget; anything above counts as overage. */
  budget: number;
  overageTokens: number;
}

export async function getMonthlyTokenSummary(
  uid: string,
  month: string = currentMonthKey()
): Promise<MonthlyTokenSummary> {
  const [plan, snap] = await Promise.all([
    resolvePlan(uid),
    adminDb.collection("users").doc(uid).collection("usage").doc(month).get(),
  ]);
  const data = snap.data() ?? {};
  const input = (data.inputTokens as number | undefined) ?? 0;
  const output = (data.outputTokens as number | undefined) ?? 0;
  const cacheRead = (data.cacheReadInputTokens as number | undefined) ?? 0;
  const cacheWrite =
    (data.cacheCreationInputTokens as number | undefined) ?? 0;
  const cost = (data.totalCostUsd as number | undefined) ?? 0;
  const budget =
    plan === "paid"
      ? PAID_PLAN_MONTHLY_TOKEN_BUDGET
      : FREE_PLAN_MONTHLY_TOKEN_BUDGET;
  const total = input + output + cacheRead + cacheWrite;
  return {
    month,
    inputTokens: input,
    outputTokens: output,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheWrite,
    totalTokens: total,
    totalCostUsd: cost,
    budget,
    overageTokens: Math.max(0, total - budget),
  };
}
