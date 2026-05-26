import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Dashboard" };
import {
  Bot,
  Plug,
  Files,
  Zap,
  ArrowRight,
  Activity as ActivityIcon,
} from "lucide-react";
import { Timestamp } from "firebase-admin/firestore";
import { getSessionUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { UsageStat } from "@/components/usage-stat";
import { getMonthlyUsage } from "@/lib/firebase/usage";
import type { UserProfile } from "@/types/database";

interface ActivityEntry {
  id: string;
  type: string;
  message: string;
  createdAt: Date | null;
}

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  return "Good evening";
}

async function countCollection(uid: string, name: string): Promise<number> {
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection(name)
      .count()
      .get();
    return snap.data().count;
  } catch {
    return 0;
  }
}

async function fetchRecentActivity(uid: string): Promise<ActivityEntry[]> {
  try {
    const snap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("activity")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    return snap.docs.map((d) => {
      const data = d.data() as {
        type?: string;
        message?: string;
        createdAt?: Timestamp;
      };
      return {
        id: d.id,
        type: data.type ?? "event",
        message: data.message ?? "Activity",
        createdAt: data.createdAt ? data.createdAt.toDate() : null,
      };
    });
  } catch {
    return [];
  }
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default async function DashboardPage() {
  const session = await getSessionUser();
  if (!session) return null;

  const userRef = adminDb.collection("users").doc(session.uid);
  const [profileSnap, agents, integrations, files, activity, usage] =
    await Promise.all([
      userRef.get(),
      countCollection(session.uid, "agents"),
      countCollection(session.uid, "integrations"),
      countCollection(session.uid, "files"),
      fetchRecentActivity(session.uid),
      getMonthlyUsage(session.uid),
    ]);

  const profile = (profileSnap.data() as Partial<UserProfile> | undefined) ?? {};
  const automationsRun =
    typeof (profile as { automationsRunCount?: number }).automationsRunCount ===
    "number"
      ? (profile as { automationsRunCount: number }).automationsRunCount
      : 0;
  const firstName =
    (profile.fullName ?? session.name ?? "").split(" ")[0] || "there";

  const greeting = greetingFor(new Date());

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        subtitle="Here's what's happening in your workspace."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Active Agents"
          value={agents}
          icon={<Bot className="h-4 w-4" />}
        />
        <StatCard
          label="Connected Integrations"
          value={integrations}
          icon={<Plug className="h-4 w-4" />}
        />
        <StatCard
          label="Files Uploaded"
          value={files}
          icon={<Files className="h-4 w-4" />}
        />
        <StatCard
          label="Automations Run"
          value={automationsRun}
          icon={<Zap className="h-4 w-4" />}
        />
        <UsageStat usage={usage} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Quick actions
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <QuickActionCard
            href="/dashboard/agents"
            icon={<Bot className="h-5 w-5" />}
            title="Set up your first agent"
            description="Spin up an AI agent that runs on a schedule or in response to events."
          />
          <QuickActionCard
            href="/dashboard/integrations"
            icon={<Plug className="h-5 w-5" />}
            title="Connect your tools"
            description="Plug in Slack, Gmail, Notion or any service to give agents real-world reach."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          Recent activity
        </h2>
        <Card>
          {activity.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="rounded-full border bg-muted/50 p-3 text-muted-foreground">
                <ActivityIcon className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No activity yet</div>
              <p className="max-w-sm text-sm text-muted-foreground">
                Once your agents start running, you&apos;ll see their work here.
              </p>
            </CardContent>
          ) : (
            <ul className="divide-y">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 px-4 py-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
                      <ActivityIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{entry.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {entry.type}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {entry.createdAt ? timeAgo(entry.createdAt) : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border bg-card transition-colors hover:bg-accent/40"
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{icon}</span>
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
