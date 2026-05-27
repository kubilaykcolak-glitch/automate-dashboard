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
  getMonthlyTokenSummary,
  getMonthlyWebSearchUsage,
  currentMonthKey,
  PAID_PLAN_MONTHLY_TOKEN_BUDGET,
} from "@/lib/firebase/usage";

interface UsageCardProps {
  uid: string;
}

function humanMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function nextResetDate(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return "";
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
 * Server-rendered usage summary. Tokens are the single billing axis:
 * the user's plan grants a monthly token budget, and crossing it blocks
 * the chat routes until either the monthly reset or a top-up / upgrade.
 *
 * Per-minute rate-limit and message counts used to live here too; both
 * were removed during audit #32 to keep the pricing narrative single-axis.
 * The per-minute rate-limit still runs server-side for abuse protection,
 * it just isn't a billing concept.
 */
export async function UsageCard({ uid }: UsageCardProps) {
  const month = currentMonthKey();
  const [tokens, webSearch] = await Promise.all([
    getMonthlyTokenSummary(uid, month),
    getMonthlyWebSearchUsage(uid, month),
  ]);

  const tokenPct = tokens.budget
    ? Math.min(150, Math.round((tokens.totalTokens / tokens.budget) * 100))
    : 0;
  const overTokens = tokens.totalTokens >= tokens.budget;
  const nearTokens = !overTokens && tokenPct >= 80;

  const planLabel = tokens.plan === "paid" ? "Pro" : "Free";
  const totalCost = tokens.totalCostUsd + webSearch.costUsd;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Token usage</CardTitle>
            <CardDescription>
              {humanMonth(month)} — resets {nextResetDate(month)}.
            </CardDescription>
          </div>
          <Badge variant={tokens.plan === "paid" ? "default" : "secondary"}>
            {planLabel} plan
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Primary metric: tokens used vs budget. */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">This month</div>
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
              <span> / {formatNumber(tokens.budget)} tokens</span>
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
            {overTokens ? (
              <span className="text-destructive">
                Budget reached. Top up or wait for monthly reset to chat again.
              </span>
            ) : (
              <>
                {formatNumber(tokens.remaining)} tokens remaining ·{" "}
                {formatUsd(totalCost)} cost so far this month
                {webSearch.count > 0 && (
                  <>
                    {" "}
                    <span className="text-muted-foreground/80">
                      (incl. {formatNumber(webSearch.count)} web search
                      {webSearch.count === 1 ? "" : "es"})
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Detailed token breakdown — surfaces where the cost is going. */}
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs font-medium text-muted-foreground">
            Where your tokens went
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

      {(overTokens || nearTokens) && (
        <CardFooter className="flex flex-col items-stretch gap-2 border-t bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            {overTokens ? (
              <span className="font-medium text-destructive">
                You&apos;ve hit this month&apos;s token budget.
              </span>
            ) : (
              <span className="font-medium text-amber-700 dark:text-amber-400">
                You&apos;re close to this month&apos;s token budget.
              </span>
            )}{" "}
            <span className="text-muted-foreground">
              {tokens.plan === "free"
                ? `Upgrade to Pro for ${PAID_PLAN_MONTHLY_TOKEN_BUDGET.toLocaleString()} tokens/month (10× the free tier).`
                : "Top up your tokens to keep going, or wait for the monthly reset."}
            </span>
          </div>
          {tokens.plan === "free" ? (
            <Link
              href="/pricing"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Upgrade to Pro
            </Link>
          ) : (
            <a
              href="mailto:support@automate-dashboard.example?subject=Token%20top-up%20request"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Buy more tokens
            </a>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
