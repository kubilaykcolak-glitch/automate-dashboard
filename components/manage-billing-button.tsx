"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ManageBillingButtonProps {
  /**
   * True if the user has a stripeCustomerId on file (i.e. has been through
   * Checkout at least once). When false the button stays disabled and we
   * point at /pricing instead of calling the portal endpoint, which would
   * 400 with "No Stripe customer on file. Start a subscription first."
   */
  hasStripeCustomer: boolean;
}

export function ManageBillingButton({
  hasStripeCustomer,
}: ManageBillingButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasStripeCustomer) {
    return (
      <div className="space-y-2">
        <Button disabled title="Subscribe first to manage billing">
          Manage Billing
        </Button>
        <p className="text-xs text-muted-foreground">
          You don&apos;t have a subscription yet.{" "}
          <Link
            href="/pricing"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            See plans →
          </Link>
        </p>
      </div>
    );
  }

  async function onClick() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not open billing portal.");
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={onClick} disabled={loading}>
        {loading ? "Opening…" : "Manage Billing"}
      </Button>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
