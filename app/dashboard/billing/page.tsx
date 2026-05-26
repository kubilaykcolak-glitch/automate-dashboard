import type { Metadata } from "next";
import { getSessionUser } from "@/lib/firebase/session";

export const metadata: Metadata = { title: "Billing" };
import { adminDb } from "@/lib/firebase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManageBillingButton } from "@/components/manage-billing-button";
import { PageHeader } from "@/components/ui/page-header";
import { UsageCard } from "@/components/usage-card";
import type { UserProfile } from "@/types/database";

const STATUS_LABEL: Record<string, { label: string; tone: "default" | "secondary" | "destructive" }> = {
  active: { label: "Active", tone: "default" },
  trialing: { label: "Trialing", tone: "secondary" },
  past_due: { label: "Past due", tone: "destructive" },
  canceled: { label: "Canceled", tone: "destructive" },
  incomplete: { label: "Incomplete", tone: "secondary" },
  incomplete_expired: { label: "Expired", tone: "destructive" },
  unpaid: { label: "Unpaid", tone: "destructive" },
  paused: { label: "Paused", tone: "secondary" },
  none: { label: "No plan", tone: "secondary" },
};

export default async function BillingPage() {
  const session = await getSessionUser();
  if (!session) return null;

  const snap = await adminDb.collection("users").doc(session.uid).get();
  const profile = (snap.data() as Partial<UserProfile>) ?? {};
  const status = profile.subscriptionStatus ?? "none";
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.none;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Billing"
        subtitle="Manage your subscription and payment details."
      />

      <UsageCard uid={session.uid} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Current plan</CardTitle>
              <CardDescription>
                Update your card, view invoices, or cancel anytime.
              </CardDescription>
            </div>
            <Badge variant={meta.tone}>{meta.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {profile.stripeSubscriptionId
            ? "Your subscription is managed through Stripe."
            : "No active subscription on file."}
        </CardContent>
        <CardFooter>
          <ManageBillingButton />
        </CardFooter>
      </Card>
    </div>
  );
}
