"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  MessageSquare,
  Plus,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import {
  activateAgentFromConfig,
  subscribeAgents,
  updateAgentSettings,
} from "@/lib/firebase/agents";
import { listAgentConfigs, getAgentConfig } from "@/lib/anthropic/agent-configs";
import type { AgentConfig } from "@/lib/anthropic/types";
import type { Agent } from "@/types/database";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SkeletonCardGrid } from "@/components/ui/skeleton-card";
import { Textarea } from "@/components/ui/textarea";

export default function AgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingType, setActivatingType] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeAgents(
      user.uid,
      (next) => {
        setAgents(next);
        setLoading(false);
      },
      (err) => {
        toast.error(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  // Partition into active vs available.
  const { activeAgents, availableConfigs } = useMemo(() => {
    const allConfigs = listAgentConfigs();
    const agentByType = new Map<string, Agent>();
    for (const a of agents) agentByType.set(a.type, a);

    const active: Agent[] = [];
    const available: AgentConfig[] = [];

    for (const cfg of allConfigs) {
      const agent = agentByType.get(cfg.type);
      if (agent && agent.status === "active") {
        active.push(agent);
      } else {
        available.push(cfg);
      }
    }
    return { activeAgents: active, availableConfigs: available };
  }, [agents]);

  async function activate(type: string) {
    if (!user) return;
    setActivatingType(type);
    try {
      const config = getAgentConfig(type);
      await activateAgentFromConfig(user.uid, type);
      toast.success(`${config?.name ?? "Agent"} activated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Activation failed.");
    } finally {
      setActivatingType(null);
    }
  }

  async function saveSettings(updates: {
    name: string;
    customSystemPrompt: string | null;
  }) {
    if (!user || !editingAgent) return;
    try {
      await updateAgentSettings(user.uid, editingAgent.id, updates);
      toast.success("Agent settings saved");
      setEditingAgent(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  }

  const isLoading = authLoading || loading;
  const showEmpty =
    !isLoading && activeAgents.length === 0 && availableConfigs.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Agents"
        subtitle="Activate a built-in agent to start using it, or customise one you've already activated."
      />

      {isLoading && <SkeletonCardGrid count={3} withIcon />}

      {showEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="rounded-full border bg-muted/50 p-3 text-muted-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">No agents available</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              The built-in agent registry is empty. Check{" "}
              <code className="font-mono text-xs">lib/anthropic/agent-configs.ts</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && activeAgents.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight">
              Your active agents
            </h2>
            <Badge variant="secondary" className="text-[10px]">
              {activeAgents.length}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeAgents.map((agent) => (
              <ActiveAgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => setEditingAgent(agent)}
              />
            ))}
          </div>
        </section>
      )}

      {!isLoading && availableConfigs.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold tracking-tight">
            Available agents
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableConfigs.map((cfg) => (
              <AvailableAgentCard
                key={cfg.type}
                config={cfg}
                pending={activatingType === cfg.type}
                onActivate={() => activate(cfg.type)}
              />
            ))}
          </div>
        </section>
      )}

      <AgentSettingsSheet
        agent={editingAgent}
        onClose={() => setEditingAgent(null)}
        onSave={saveSettings}
      />
    </div>
  );
}

function ActiveAgentCard({
  agent,
  onEdit,
}: {
  agent: Agent;
  onEdit: () => void;
}) {
  const config = getAgentConfig(agent.type);
  const messageCount = agent.messageCount ?? 0;
  const lastMessageAt = agent.lastMessageAt?.toDate?.() ?? null;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted p-2 text-muted-foreground">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base">
                {agent.name || config?.name || "Agent"}
              </CardTitle>
              <Badge
                variant="default"
                className="mt-1 gap-1 bg-emerald-600 text-white hover:bg-emerald-600"
              >
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit agent settings"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
        <CardDescription className="pt-2">
          {agent.description || config?.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Stat
            label="Messages"
            value={messageCount.toLocaleString()}
            icon={<MessageSquare className="h-3 w-3" />}
          />
          <Stat
            label="Last active"
            value={lastMessageAt ? formatRelative(lastMessageAt) : "Never"}
          />
        </div>
        {agent.customSystemPrompt && (
          <Badge variant="outline" className="text-[10px]">
            Customised
          </Badge>
        )}
      </CardContent>
      <CardFooter>
        <Link
          href={`/dashboard/agents/${agent.id}`}
          className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Open
          <ArrowRight className="h-4 w-4" />
        </Link>
      </CardFooter>
    </Card>
  );
}

function AvailableAgentCard({
  config,
  pending,
  onActivate,
}: {
  config: AgentConfig;
  pending: boolean;
  onActivate: () => void;
}) {
  return (
    <Card className="flex flex-col border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted p-2 text-muted-foreground">
            <Bot className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">{config.name}</CardTitle>
        </div>
        <CardDescription className="pt-2">{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Capabilities
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {config.capabilities.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px] font-normal">
              {c}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          className="w-full"
          onClick={onActivate}
          disabled={pending}
        >
          <Plus className="mr-2 h-4 w-4" />
          {pending ? "Activating…" : "Activate"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function AgentSettingsSheet({
  agent,
  onClose,
  onSave,
}: {
  agent: Agent | null;
  onClose: () => void;
  onSave: (updates: {
    name: string;
    customSystemPrompt: string | null;
  }) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const config = agent ? getAgentConfig(agent.type) : null;
  const defaultPrompt = config?.systemPrompt ?? "";

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setSystemPrompt(agent.customSystemPrompt ?? defaultPrompt);
  }, [agent, defaultPrompt]);

  async function handleSave() {
    setSaving(true);
    try {
      const isCustomised = systemPrompt.trim() !== defaultPrompt.trim();
      await onSave({
        name: name.trim(),
        customSystemPrompt: isCustomised ? systemPrompt : null,
      });
    } finally {
      setSaving(false);
    }
  }

  function restoreDefault() {
    setSystemPrompt(defaultPrompt);
  }

  const open = agent !== null;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Edit agent</SheetTitle>
          <SheetDescription>
            Rename the agent and customise its system prompt. Leaving the prompt
            unchanged keeps the built-in behaviour.
          </SheetDescription>
        </SheetHeader>
        {agent && (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="agent-prompt">System prompt</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={restoreDefault}
                >
                  Restore default
                </Button>
              </div>
              <Textarea
                id="agent-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[280px] resize-none font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Edit carefully — this prompt steers everything the agent does.
              </p>
            </div>
          </div>
        )}
        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !agent || !name.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function formatRelative(date: Date): string {
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
