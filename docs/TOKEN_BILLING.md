# Token tracking and overage billing

> **Status:** tracking implemented (live). Stripe metered billing for overage: not yet wired.

---

## Why we track tokens, not just messages

The original rate limit counted messages (`/users/{uid}/usage/{YYYY-MM}.count`). That worked as a simple guardrail but is useless for actual cost economics:

- A one-line "what is VAT?" question and a ten-file accountancy review both count as one message.
- A loaded chat with thousands of cached tokens is wildly more expensive than a fresh one.
- Skill loads (future Phase 2) will widen the cost-per-message spread further.

Tokens are what Anthropic actually charges for. So we track them — and we compute the dollar cost on the same data — so billing can later cleanly invoice the overage above each plan's monthly allowance.

## Where the data lives

Every chat request, after the stream completes, the route at `app/api/agent/chat/route.ts` writes to two places:

### Per-message — `/users/{uid}/agentSessions/{sid}/messages/{msgId}`

The assistant message doc records the round-trip's usage:

```js
{
  role: "assistant",
  content: "...",
  createdAt: <ts>,
  stopReason: "stop",
  model: "claude-sonnet-4-6",
  usage: {
    inputTokens: 1234,
    outputTokens: 567,
    cacheReadInputTokens: 4321,
    cacheCreationInputTokens: 0,
  },
}
```

`model` is captured so historical messages can be re-priced if Anthropic changes the rate card.

### Per-month — `/users/{uid}/usage/{YYYY-MM}`

The monthly doc accumulates the same four counters plus a cumulative USD figure:

```js
{
  month: "2026-05",
  count: 42,                          // message count (legacy, still maintained)
  inputTokens: 51234,
  outputTokens: 12890,
  cacheReadInputTokens: 199000,
  cacheCreationInputTokens: 0,
  totalCostUsd: 0.4567,
  lastModel: "claude-sonnet-4-6",
  lastUsageAt: <ts>,
  updatedAt: <ts>,
}
```

All counters use `FieldValue.increment` so concurrent writes don't trample each other.

## How cost is computed

`lib/anthropic/pricing.ts` is the single source of truth. Per-model rates in USD per 1M tokens:

| Model | Input | Output | Cache write | Cache read |
|---|---|---|---|---|
| `claude-sonnet-4-6` | $3.00 | $15.00 | $3.75 | $0.30 |

Cost per request is the sum across the four token classes. `computeCostUsd(usage, model)` returns USD as a JS number — store full precision, round on display.

**When Anthropic updates prices**, edit the pricing table once. Future writes will use the new rate; historical message docs keep their `model` and `usage` fields so prior costs are reconstructable.

## Plan budgets and overage

Defined in `lib/firebase/usage.ts`:

```
FREE_PLAN_MONTHLY_TOKEN_BUDGET   =   500,000 tokens
PAID_PLAN_MONTHLY_TOKEN_BUDGET   = 5,000,000 tokens
```

The chat is **subscription-only** — there's no free monthly allowance. Two distinct refusals:

| Refusal | Status | Code | When |
|---|---|---|---|
| Not subscribed | **402 Payment Required** | `subscription_required` | User exists but has no active Pro subscription. Drive them to `/pricing`. |
| Budget exhausted | **429 Too Many Requests** | `token_budget_exceeded` | Subscribed Pro user has burned through their 5M monthly tokens. Drive them to top-up or wait for reset. |

**Tokens are the single billing axis.** Earlier versions ran a separate 500K monthly allowance for non-subscribers, a message count, and a rich-turn count alongside the token budget. All removed during the audit — non-subscribers no longer get any chat access, and Pro grants a flat 5M tokens/month covering everything. Rich-mode and Quick chats both draw from the same pool.

The per-minute rate limit (10 req/min) is a fairness / abuse guard, not a pricing concept. It applies regardless of plan.

`getMonthlyTokenSummary(uid)` returns the breakdown including `overageTokens = max(0, totalTokens - budget)` for a future billing UI to read.

## Wiring overage into Stripe (the path, not implemented yet)

Three steps when ready:

1. **Create a metered Stripe product** with a per-token price (e.g. $X per 1M tokens of overage). Add the price ID to env (`STRIPE_OVERAGE_PRICE_ID`).
2. **Add a subscription item** to each paid customer when their monthly token usage crosses the budget. Stripe usage records can be posted from the chat route (every message, after recording usage) or from a nightly cron that scans the previous day's overage delta. Cron is cleaner.
3. **On `customer.subscription.updated`** Stripe webhooks, ensure the metered item ID is captured against the user so subsequent usage records can target it.

The data foundation is already in place. The wiring is purely Stripe API work.

## How to inspect a user's usage today

There is no UI yet. Either:

- Query the user's monthly doc directly via Firebase Console at `users/{uid}/usage/{YYYY-MM}`.
- Call `getMonthlyTokenSummary(uid)` from a server-side helper (e.g. a dev-only `/api/admin/usage` endpoint, which does not exist yet — add when needed).

## Caveats

- **Pricing table can drift.** Anthropic's published rates can change. **Quarterly verification checklist:**
  1. Open https://www.anthropic.com/pricing#anthropic-api
  2. Compare each model in `lib/anthropic/pricing.ts` against the listed rates:
     - input per 1M
     - output per 1M
     - cache write (ephemeral 5-min, currently 1.25× input)
     - cache read (currently 0.1× input)
  3. Confirm `WEB_SEARCH_USD_PER_CALL` in `lib/firebase/usage.ts` still matches the published per-search rate.
  4. If anything changed: bump the constants, commit with a note like "Update Anthropic pricing — Q2 2026". Historical messages keep their stored `model` so prior costs stay reconstructable at the rates that applied at the time.
  - Add a calendar reminder (every 1st of Jan, Apr, Jul, Oct) if you don't want to rely on this doc.
- **Output tokens come from the `message_delta` stream event.** If the stream errors mid-way, `outputTokens` may underreport. Errors are logged via `console.error` from `recordTokenUsage`. Tolerable for now.
- **Cache creation tokens are billed at 1.25× input rate**, cache reads at 0.1×. The pricing table reflects that — don't apply the multiplier separately.
- **`incrementMonthlyUsage(by=1)` still runs**, even though token tracking is what actually matters. It is kept for backwards compatibility with the existing rate-limit check and the legacy 100/1000 message limit. When you flip to token-based blocking, remove the count check.
