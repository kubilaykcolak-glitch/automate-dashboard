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
 * Server-rendered usage summary. The chat is subscription-only — users
 * who aren't on Pro see a 'subscribe to start chatting' state, not a
 * zero-budget progress bar. Subscribed users see their monthly token
 * consumption against the Pro budget.
 *
 * Per-minute rate limit (10/min) runs server-side as a fairness guard
 * but isn't a pricing concept; it doesn't surface here.
 */
export async function UsageCard({ uid }: UsageCardProps) {
  const month = currentMonthKey();
  const [tokens, webSearch] = await Promise.all([
    getMonthlyTokenSummary(uid, month),
    getMonthlyWebSearchUsage(uid, month),
  ]);

  // Non-subscriber state — no chat access; surface the subscribe prompt.
  if (tokens.plan !== "paid") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Subscribe to start chatting</CardTitle>
              <CardDescription>
                The chat is available on Pro. {humanMonth(month)}.
              </CardDescription>
            </div>
            <Badge variant="secondary">No active subscription</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Pro includes a monthly token budget that powers every chat,
            file generation, web search, and connected-integration call.
            You don&apos;t pay per message — you pay a flat subscription
            and the budget refreshes each month.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              5,000,000 tokens / month — typically thousands of Quick
              chats or dozens of Rich-mode runs.
            </li>
            <li>Full UK accountancy skill library + file exports.</li>
            <li>Google Drive / Sheets read access when connected.</li>
          </ul>
        </CardContent>
        <CardFooter className="border-t bg-muted/20">
          <Link
            href="/pricing"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Subscribe to Pro
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // Subscriber state — normal token usage view.
  const tokenPct = tokens.budget
    ? Math.min(150, Math.round((tokens.totalTokens / tokens.budget) * 100))
    : 0;
  const overTokens = tokens.totalTokens >= tokens.budget;
  const nearTokens = !overTokens && tokenPct >= 80;
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
          <Badge>Pro plan</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
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
                Budget reached. Top up or wait for the monthly reset to chat again.
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
              Top up your tokens to keep going, or wait for the monthly reset.
            </span>
          </div>
          <a
            href="mailto:support@automate-dashboard.example?subject=Token%20top-up%20request"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Buy more tokens
          </a>
        </CardFooter>
      )}
    </Card>
  );
}
