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

/**
 * Per-month Rich-mode turn quota. Rich mode burns 5-10× the tokens of
 * Quick per turn, so it gets its own ceiling on top of the message-count
 * and token-budget gates. Free users get zero (the toggle exists for
 * discoverability but the API refuses). Paid users get a modest amount
 * that fits comfortably within their token budget at typical rates.
 */
export const FREE_PLAN_MONTHLY_RICH_TURNS = 0;
export const PAID_PLAN_MONTHLY_RICH_TURNS = 30;

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

/**
 * Rich-mode turn quota snapshot. Stored on the monthly usage doc as
 * `richTurns` (incremented by recordRichTurn). Limit derived from the plan.
 */
export interface MonthlyRichUsage {
  month: string;
  plan: Plan;
  used: number;
  limit: number;
  remaining: number;
}

export async function getMonthlyRichUsage(
  uid: string,
  month: string = currentMonthKey()
): Promise<MonthlyRichUsage> {
  const [plan, snap] = await Promise.all([
    resolvePlan(uid),
    adminDb.collection("users").doc(uid).collection("usage").doc(month).get(),
  ]);
  const used = (snap.data()?.richTurns as number | undefined) ?? 0;
  const limit =
    plan === "paid"
      ? PAID_PLAN_MONTHLY_RICH_TURNS
      : FREE_PLAN_MONTHLY_RICH_TURNS;
  return { month, plan, used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Atomically increments the Rich-turn counter for the current month.
 * Called only by /api/agent/chat-rich after a successful end_turn.
 */
export async function recordRichTurn(uid: string): Promise<void> {
  const month = currentMonthKey();
  const ref = adminDb.collection("users").doc(uid).collection("usage").doc(month);
  await ref.set(
    {
      month,
      richTurns: FieldValue.increment(1),
      lastRichTurnAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Anthropic web_search pricing — $10 per 1,000 invocations at time of
 * writing. Single source of truth for the cost line on the Usage card.
 * Verify quarterly against https://www.anthropic.com/pricing#anthropic-api.
 */
export const WEB_SEARCH_USD_PER_CALL = 0.01;

/**
 * Per-month web_search invocation snapshot. Stored as `webSearches` on
 * the monthly usage doc and incremented by recordWebSearches() at the
 * end of each chat turn that triggered any searches.
 */
export interface MonthlyWebSearchUsage {
  month: string;
  count: number;
  costUsd: number;
}

export async function getMonthlyWebSearchUsage(
  uid: string,
  month: string = currentMonthKey()
): Promise<MonthlyWebSearchUsage> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("usage")
    .doc(month)
    .get();
  const count = (snap.data()?.webSearches as number | undefined) ?? 0;
  return { month, count, costUsd: count * WEB_SEARCH_USD_PER_CALL };
}

/**
 * Atomically increments the web-search counter by the number of searches
 * that fired in a single chat turn. Called fire-and-forget after each
 * successful end_turn.
 */
export async function recordWebSearches(
  uid: string,
  count: number
): Promise<void> {
  if (count <= 0) return;
  const month = currentMonthKey();
  const ref = adminDb
    .collection("users")
    .doc(uid)
    .collection("usage")
    .doc(month);
  await ref.set(
    {
      month,
      webSearches: FieldValue.increment(count),
      webSearchCostUsd: FieldValue.increment(count * WEB_SEARCH_USD_PER_CALL),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Per-minute rate limit. Sliding 60-second window, counter stored at
 * /users/{uid}/rateLimits/chat. Returns the verdict and (if exceeded) how
 * many seconds the caller should wait. Implementation note: a Firestore
 * transaction is the right shape for read-then-write atomicity, but we
 * use a single set+increment with manual window detection — slightly less
 * precise under concurrent bursts but adequate for cost protection and
 * avoids transaction round-trips on the hot path.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 10;

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
  /** Tokens used this window (after the current request, if allowed). */
  count: number;
  limit: number;
}

export async function checkAndRecordRateLimit(
  uid: string,
  bucket: string = "chat"
): Promise<RateLimitVerdict> {
  const ref = adminDb
    .collection("users")
    .doc(uid)
    .collection("rateLimits")
    .doc(bucket);
  const now = Date.now();

  // Transaction keeps the read-modify-write atomic across concurrent
  // requests from the same user. Cheap because the doc is tiny.
  return adminDb.runTransaction<RateLimitVerdict>(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() ?? {}) : {};
    const windowStartMs =
      typeof data.windowStartMs === "number" ? data.windowStartMs : 0;
    const count = typeof data.count === "number" ? data.count : 0;
    const elapsed = now - windowStartMs;

    if (!snap.exists || elapsed >= RATE_LIMIT_WINDOW_SECONDS * 1000) {
      // Window expired (or first request) — start a fresh window with 1 token.
      tx.set(
        ref,
        {
          windowStartMs: now,
          count: 1,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: false }
      );
      return {
        allowed: true,
        retryAfterSeconds: 0,
        count: 1,
        limit: RATE_LIMIT_MAX_REQUESTS,
      };
    }

    if (count >= RATE_LIMIT_MAX_REQUESTS) {
      // Window still open and at cap — reject.
      const remainingMs = RATE_LIMIT_WINDOW_SECONDS * 1000 - elapsed;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
        count,
        limit: RATE_LIMIT_MAX_REQUESTS,
      };
    }

    // Window open and under cap — increment.
    tx.update(ref, {
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      allowed: true,
      retryAfterSeconds: 0,
      count: count + 1,
      limit: RATE_LIMIT_MAX_REQUESTS,
    };
  });
}
