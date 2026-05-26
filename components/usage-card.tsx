import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  getMonthlyUsage,
  getMonthlyTokenSummary,
  getMonthlyRichUsage,
  getMonthlyWebSearchUsage,
  currentMonthKey,
} from "@/lib/firebase/usage";

interface UsageCardProps {
  uid: string;
}

function humanMonth(monthKey: string): string {
  // monthKey is "YYYY-MM"
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function nextResetDate(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return "";
  // First of next month, UTC.
  const next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return next.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-GB");
}

function formatUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

/**
 * Server-rendered usage summary. Shows the user where they are against:
 *   - The monthly message rate limit (the actual blocker today).
 *   - The monthly token budget (informational; future Stripe metered billing).
 * When usage is approaching or over either threshold, surfaces an upgrade CTA.
 */
export async function UsageCard({ uid }: UsageCardProps) {
  const month = currentMonthKey();
  const [usage, tokens, rich, webSearch] = await Promise.all([
    getMonthlyUsage(uid, month),
    getMonthlyTokenSummary(uid, month),
    getMonthlyRichUsage(uid, month),
    getMonthlyWebSearchUsage(uid, month),
  ]);

  const tokenPct = tokens.budget
    ? Math.min(150, Math.round((tokens.totalTokens / tokens.budget) * 100))
    : 0;
  const messagePct = usage.limit
    ? Math.min(150, Math.round((usage.count / usage.limit) * 100))
    : 0;
  const richPct = rich.limit
    ? Math.min(150, Math.round((rich.used / rich.limit) * 100))
    : 0;

  const overMessages = usage.count >= usage.limit;
  const overTokens = tokens.totalTokens >= tokens.budget;
  const overRich = rich.limit > 0 && rich.used >= rich.limit;
  const nearMessages = !overMessages && messagePct >= 80;
  const nearTokens = !overTokens && tokenPct >= 80;
  const nearRich = !overRich && rich.limit > 0 && richPct >= 80;
  const showAlert =
    overMessages || overTokens || overRich || nearMessages || nearTokens || nearRich;

  const planLabel =
    tokens.budget === 5_000_000 ? "Pro" : tokens.budget === 500_000 ? "Free" : "Plan";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Usage</CardTitle>
            <CardDescription>
              {humanMonth(month)} — resets {nextResetDate(month)}.
            </CardDescription>
          </div>
          <Badge variant={planLabel === "Pro" ? "default" : "secondary"}>
            {planLabel} plan
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Messages — the actual blocker today */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">Messages</div>
            <div className="text-sm tabular-nums text-muted-foreground">
              <span
                className={
                  overMessages
                    ? "font-semibold text-destructive"
                    : nearMessages
                      ? "font-semibold text-amber-600"
                      : "font-medium text-foreground"
                }
              >
                {formatNumber(usage.count)}
              </span>
              <span> / {formatNumber(usage.limit)}</span>
            </div>
          </div>
          <Progress
            value={Math.min(100, messagePct)}
            className={
              overMessages
                ? "[&>div]:bg-destructive"
                : nearMessages
                  ? "[&>div]:bg-amber-500"
                  : undefined
            }
          />
          <div className="text-xs text-muted-foreground">
            {usage.remaining > 0
              ? `${formatNumber(usage.remaining)} messages remaining this month.`
              : "Monthly message limit reached. New chats are blocked until reset."}
          </div>
        </div>

        {/* Rich-mode turns — separate quota because each turn is materially
            more expensive than a Quick chat turn. */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">Rich-mode turns</div>
            <div className="text-sm tabular-nums text-muted-foreground">
              {rich.limit === 0 ? (
                <span className="text-muted-foreground">
                  Not available on free plan
                </span>
              ) : (
                <>
                  <span
                    className={
                      overRich
                        ? "font-semibold text-destructive"
                        : nearRich
                          ? "font-semibold text-amber-600"
                          : "font-medium text-foreground"
                    }
                  >
                    {formatNumber(rich.used)}
                  </span>
                  <span> / {formatNumber(rich.limit)}</span>
                </>
              )}
            </div>
          </div>
          {rich.limit > 0 && (
            <Progress
              value={Math.min(100, richPct)}
              className={
                overRich
                  ? "[&>div]:bg-destructive"
                  : nearRich
                    ? "[&>div]:bg-amber-500"
                    : undefined
              }
            />
          )}
          <div className="text-xs text-muted-foreground">
            {rich.limit === 0
              ? "Upgrade to Pro to enable Rich mode (file generation, web search, multi-step agent work)."
              : overRich
                ? "Rich-mode quota reached. Quick-mode chats continue to work; contact us for additional Rich capacity."
                : `${formatNumber(rich.remaining)} Rich turns remaining. Each Rich turn typically costs 5–10× a Quick turn.`}
          </div>
        </div>

        {/* Tokens — informational, foundation for future metered overage */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">Tokens</div>
            <div className="text-sm tabular-nums text-muted-foreground">
              <span
                className={
                  overTokens
                    ? "font-semibold text-destructive"
                    : nearTokens
                      ? "font-semibold text-amber-600"
                      : "font-medium text-foreground"
                }
              >
                {formatNumber(tokens.totalTokens)}
              </span>
              <span> / {formatNumber(tokens.budget)}</span>
            </div>
          </div>
          <Progress
            value={Math.min(100, tokenPct)}
            className={
              overTokens
                ? "[&>div]:bg-destructive"
                : nearTokens
                  ? "[&>div]:bg-amber-500"
                  : undefined
            }
          />
          <div className="text-xs text-muted-foreground">
            Total cost this month: {formatUsd(tokens.totalCostUsd + webSearch.costUsd)}
            {webSearch.count > 0 && (
              <>
                {" "}
                <span className="text-muted-foreground/80">
                  (incl. {formatNumber(webSearch.count)} web search
                  {webSearch.count === 1 ? "" : "es"} ≈ {formatUsd(webSearch.costUsd)})
                </span>
              </>
            )}
            {"."}
            {tokens.overageTokens > 0 && (
              <>
                {" "}
                <span className="text-destructive">
                  {formatNumber(tokens.overageTokens)} tokens over budget.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Detailed token breakdown */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Token breakdown
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Input</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(tokens.inputTokens)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Output</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(tokens.outputTokens)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cache read</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(tokens.cacheReadInputTokens)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cache write</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(tokens.cacheCreationInputTokens)}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>

      {showAlert && (
        <CardFooter className="flex flex-col items-stretch gap-2 border-t bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {overMessages || overTokens ? (
              <span className="font-medium text-destructive">
                You&apos;ve hit this month&apos;s limit.
              </span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                You&apos;re approaching this month&apos;s limit.
              </span>
            )}{" "}
            <span className="text-muted-foreground">
              {usage.plan === "free"
                ? "Upgrade to Pro for 10× more messages and 10× the token budget."
                : "Contact us about additional capacity if you need more this month."}
            </span>
          </div>
          {usage.plan === "free" && (
            <Link
              href="/pricing"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Upgrade to Pro
            </Link>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
