import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { computeCostUsd, type TokenUsage } from "@/lib/anthropic/pricing";

/**
 * SUBSCRIPTION-ONLY BILLING MODEL.
 *
 * The chat is paid-only. A user must hold an active subscription before
 * the chat routes will serve a request — there's no free monthly
 * allowance. Subscribed users get a flat per-month token budget; running
 * out within a month blocks chat until either the next monthly reset or
 * a top-up.
 *
 * Two distinct refusal reasons:
 *   - HTTP 402 + code "subscription_required" — user is signed up but
 *     not subscribed. Drive them to /pricing.
 *   - HTTP 429 + code "token_budget_exceeded" — subscribed but burned
 *     through this month's tokens. Drive them to top-up / wait for reset.
 *
 * Per-minute rate limiting (RATE_LIMIT_MAX_REQUESTS) is a separate abuse
 * guard, not a billing concept.
 *
 * The `Plan` type carries "free" only because Firestore data still has
 * users whose subscriptionStatus is "none" — that maps to "free" here
 * and means "no chat access". Callers should treat anything other than
 * "paid" as a gate, not a tier with reduced features.
 */

export const PAID_PLAN_MONTHLY_TOKEN_BUDGET = 5_000_000;

export type Plan = "free" | "paid";

/**
 * Returns the current month key in UTC. Format: "YYYY-MM". UTC keeps the
 * boundaries stable across servers and developer machines.
 */
export function currentMonthKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

/** Public plan discriminator — used by callers that need to know free vs
 *  paid without loading the full token summary. */
export async function getUserPlan(uid: string): Promise<Plan> {
  return resolvePlan(uid);
}

/**
 * Records the token usage and computed USD cost of a single chat round-trip
 * onto the user's monthly usage doc. Called fire-and-forget after every
 * stream — including streams that errored mid-way — so we never lose track
 * of tokens we already paid Anthropic for. Errors are swallowed by the
 * caller because the chat already shipped.
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
  plan: Plan;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  /** Plan's monthly token budget — the hard gate. */
  budget: number;
  /** How many tokens remain before the gate. 0 once exceeded. */
  remaining: number;
  /** How many tokens over budget. Reads as 0 until the gate is hit. */
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
  // Non-subscribers have a budget of 0 — the chat route will refuse them
  // with "subscription_required" before they ever see this number, but
  // having budget=0 keeps any other caller's logic simple.
  const budget =
    plan === "paid" ? PAID_PLAN_MONTHLY_TOKEN_BUDGET : 0;
  const total = input + output + cacheRead + cacheWrite;
  return {
    month,
    plan,
    inputTokens: input,
    outputTokens: output,
    cacheReadInputTokens: cacheRead,
    cacheCreationInputTokens: cacheWrite,
    totalTokens: total,
    totalCostUsd: cost,
    budget,
    remaining: Math.max(0, budget - total),
    overageTokens: Math.max(0, total - budget),
  };
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
 * many seconds the caller should wait. This is a fairness / anti-abuse
 * guard, distinct from the token-budget gate — fires at 10 requests/min
 * regardless of plan.
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
