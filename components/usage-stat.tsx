import Link from "next/link";
import { Coins, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { MonthlyTokenSummary } from "@/lib/firebase/usage";

/**
 * Dashboard-home tile. Two states:
 *   - Subscriber: shows monthly token usage with a progress bar.
 *   - Non-subscriber: shows a 'Subscribe to start chatting' prompt
 *     linking to /pricing (because the chat is paid-only).
 * Click-through goes to /dashboard/billing in both cases for the full
 * breakdown / management.
 */
export function UsageStat({ tokens }: { tokens: MonthlyTokenSummary }) {
  const subscribed = tokens.plan === "paid";

  if (!subscribed) {
    return (
      <Link
        href="/pricing"
        className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label="Subscribe to start chatting"
      >
        <Card className="transition-colors group-hover:bg-accent/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Chat access
            </CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-base font-semibold tracking-tight">
              Subscribe to start
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pro · 5M tokens/month · click for plans
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  const pct = tokens.budget
    ? Math.min(100, Math.round((tokens.totalTokens / tokens.budget) * 100))
    : 0;
  const over = tokens.totalTokens >= tokens.budget;
  const danger = pct >= 90;

  return (
    <Link
      href="/dashboard/billing"
      className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label="View detailed token usage and billing"
    >
      <Card className="transition-colors group-hover:bg-accent/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Tokens this month
          </CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {tokens.totalTokens.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {tokens.budget.toLocaleString()}
            </span>
          </div>
          <Progress
            value={pct}
            className={danger ? "[&>div]:bg-destructive" : undefined}
          />
          <p className="text-[10px] text-muted-foreground">
            Pro plan{over ? " · budget reached" : " · view details"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
