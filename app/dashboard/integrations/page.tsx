"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import {
  connectIntegration,
  disconnectIntegration,
  subscribeIntegrations,
} from "@/lib/firebase/integrations";
import type { Integration } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { cn } from "@/lib/utils";

interface Provider {
  id: string;
  name: string;
  description: string;
  color: string; // tailwind bg-* class
}

const PROVIDERS: Provider[] = [
  { id: "gmail", name: "Gmail", description: "Read and send emails programmatically.", color: "bg-red-500" },
  { id: "google-sheets", name: "Google Sheets", description: "Read and update spreadsheet data.", color: "bg-emerald-500" },
  { id: "google-drive", name: "Google Drive", description: "Sync files and folders.", color: "bg-amber-500" },
  { id: "quickbooks", name: "QuickBooks", description: "Pull accounting and invoice data.", color: "bg-green-700" },
  { id: "stripe", name: "Stripe", description: "Sync payments, customers, and subscriptions.", color: "bg-indigo-500" },
  { id: "figma", name: "Figma", description: "Read design files and components.", color: "bg-neutral-800" },
  { id: "xero", name: "Xero", description: "Sync bookkeeping and reports.", color: "bg-sky-500" },
  { id: "slack", name: "Slack", description: "Post messages and read channels.", color: "bg-fuchsia-600" },
];

export default function IntegrationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeIntegrations(
      user.uid,
      (next) => {
        setIntegrations(next);
        setLoading(false);
      },
      (err) => {
        toast.error(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const statusByProvider = useMemo(() => {
    const map = new Map<string, Integration>();
    for (const i of integrations) map.set(i.id, i);
    return map;
  }, [integrations]);

  async function onToggle(provider: Provider, connected: boolean) {
    if (!user) return;
    setPendingId(provider.id);
    try {
      if (connected) {
        await disconnectIntegration(user.uid, provider.id);
        toast.success(`${provider.name} disconnected`);
      } else {
        await connectIntegration(user.uid, provider.id);
        toast.success(`${provider.name} connected`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Connect external tools your agents can read from and write to."
      />

      {(authLoading || loading) && <SkeletonCardGrid count={6} withIcon />}

      {!loading && (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const integration = statusByProvider.get(provider.id);
          const isConnected = integration?.status === "connected";
          const pending = pendingId === provider.id;
          const disabled = authLoading || !user || pending;
          return (
            <Card key={provider.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ProviderAvatar name={provider.name} color={provider.color} />
                    <div>
                      <CardTitle className="text-base">{provider.name}</CardTitle>
                    </div>
                  </div>
                  {isConnected && (
                    <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                      <Check className="h-3 w-3" />
                      Connected
                    </Badge>
                  )}
                </div>
                <CardDescription className="pt-2">
                  {provider.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1" />
              <CardFooter>
                <Button
                  variant={isConnected ? "outline" : "default"}
                  className="w-full"
                  disabled={disabled}
                  onClick={() => onToggle(provider, isConnected)}
                >
                  {pending
                    ? "…"
                    : isConnected
                    ? "Disconnect"
                    : "Connect"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}

function ProviderAvatar({ name, color }: { name: string; color: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-base font-semibold text-white",
        color
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}
