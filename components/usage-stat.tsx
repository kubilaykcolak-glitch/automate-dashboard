import Link from "next/link";
import { MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { MonthlyUsage } from "@/lib/firebase/usage";

export function UsageStat({ usage }: { usage: MonthlyUsage }) {
  const pct = usage.limit > 0
    ? Math.min(100, Math.round((usage.count / usage.limit) * 100))
    : 0;
  const danger = pct >= 90;

  return (
    // Clickable tile → full token + cost breakdown lives on /dashboard/billing.
    <Link
      href="/dashboard/billing"
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
      aria-label="View detailed usage and billing"
    >
      <Card className="transition-colors group-hover:bg-accent/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            Messages this month
          </CardTitle>
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-2xl font-semibold tracking-tight">
            {usage.count.toLocaleString()}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {usage.limit.toLocaleString()}
            </span>
          </div>
          <Progress
            value={pct}
            className={danger ? "[&>div]:bg-destructive" : undefined}
          />
          <p className="text-[10px] text-muted-foreground">
            {usage.plan === "paid" ? "Pro plan" : "Free plan"} · view details
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
