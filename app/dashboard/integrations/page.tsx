"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { subscribeIntegrations } from "@/lib/firebase/integrations";
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

interface ProviderCard {
  id: string;
  internalId: string;
  name: string;
  description: string;
  color: string;
}

// Visual catalogue only — `enabled` is fetched from /api/integrations/status
// at mount so the UI reflects which providers actually have credentials
// configured on the server right now.
const PROVIDER_CARDS: ProviderCard[] = [
  { id: "gmail", internalId: "google", name: "Gmail", description: "Read and search emails programmatically.", color: "bg-red-500" },
  { id: "google-sheets", internalId: "google", name: "Google Sheets", description: "Read spreadsheet data.", color: "bg-emerald-500" },
  { id: "google-drive", internalId: "google", name: "Google Drive", description: "Read files and folders.", color: "bg-amber-500" },
  { id: "slack", internalId: "slack", name: "Slack", description: "Post messages and read channels.", color: "bg-fuchsia-600" },
  { id: "quickbooks", internalId: "quickbooks", name: "QuickBooks", description: "Pull accounting and invoice data.", color: "bg-green-700" },
  { id: "stripe", internalId: "stripe-connect", name: "Stripe", description: "Sync payments, customers, and subscriptions.", color: "bg-indigo-500" },
  { id: "figma", internalId: "figma", name: "Figma", description: "Read design files and components.", color: "bg-neutral-800" },
  { id: "xero", internalId: "xero", name: "Xero", description: "Sync bookkeeping and reports.", color: "bg-sky-500" },
];

export default function IntegrationsPage() {
  const { user, loading: authLoading } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
  const searchParams = useSearchParams();

  // Fetch which providers have OAuth credentials configured server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/integrations/status");
        if (!res.ok) return;
        const data = (await res.json()) as { status: Record<string, boolean> };
        if (!cancelled) setEnabledMap(data.status ?? {});
      } catch {
        // best-effort; everything defaults to disabled which is the safe state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Surface ?connected=... and ?error=... params from the OAuth callback.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success(`${connected} connected`);
    if (error) toast.error(error);
  }, [searchParams]);

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

  const statusByInternalId = useMemo(() => {
    const map = new Map<string, Integration>();
    for (const i of integrations) map.set(i.provider, i);
    return map;
  }, [integrations]);

  async function onDisconnect(card: ProviderCard) {
    if (!user || !enabledMap[card.id]) return;
    const confirmMessage =
      card.internalId === "google"
        ? "Disconnect Google? Gmail, Drive, and Sheets share the same grant and will all disconnect."
        : `Disconnect ${card.name}?`;
    if (!confirm(confirmMessage)) return;
    setPendingId(card.id);
    try {
      const res = await fetch(`/api/integrations/${card.internalId}/disconnect`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Disconnect failed.");
      toast.success(`${card.name} disconnected`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setPendingId(null);
    }
  }

  function onConnect(card: ProviderCard) {
    if (!enabledMap[card.id]) return;
    const url = `/api/integrations/${card.internalId}/connect?card=${encodeURIComponent(card.id)}&returnTo=${encodeURIComponent("/dashboard/integrations")}`;
    window.location.href = url;
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
          {PROVIDER_CARDS.map((card) => {
            const enabled = enabledMap[card.id] ?? false;
            const integration = statusByInternalId.get(card.internalId);
            const isConnected = enabled && integration?.status === "connected";
            const pending = pendingId === card.id;
            const disabled = authLoading || !user || pending;

            return (
              <Card key={card.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ProviderAvatar name={card.name} color={card.color} />
                      <div>
                        <CardTitle className="text-base">{card.name}</CardTitle>
                      </div>
                    </div>
                    {isConnected && (
                      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                        <Check className="h-3 w-3" />
                        Connected
                      </Badge>
                    )}
                    {!enabled && (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Coming soon
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="pt-2">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  {isConnected && integration?.scopes && integration.scopes.length > 0 && (
                    <div className="text-[10px] text-muted-foreground">
                      {integration.scopes.length} scope
                      {integration.scopes.length === 1 ? "" : "s"} granted
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  {!enabled ? (
                    <Button variant="outline" className="w-full" disabled>
                      Coming soon
                    </Button>
                  ) : isConnected ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={disabled}
                      onClick={() => onDisconnect(card)}
                    >
                      {pending ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={disabled}
                      onClick={() => onConnect(card)}
                    >
                      {pending ? "…" : "Connect"}
                    </Button>
                  )}
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
