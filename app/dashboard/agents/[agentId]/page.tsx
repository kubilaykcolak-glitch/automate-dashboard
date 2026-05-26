"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { getAgentConfig } from "@/lib/anthropic/agent-configs";
import { updateAgentProfile } from "@/lib/firebase/agents";
import { subscribeFiles } from "@/lib/firebase/storage";
import type { StoredFile } from "@/types/database";
import type { AgentProfile } from "@/lib/anthropic/types";
import { AgentOnboardingWizard } from "@/components/agent-onboarding-wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ChatMessageExport {
  filename: string;
  format: "csv" | "xlsx" | "pdf";
  size: number;
  downloadUrl: string;
  title: string | null;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  streaming?: boolean;
  /** The text of the user message that triggered this — used to retry. */
  retryText?: string;
  /** Downloadable files the agent generated for this turn. */
  exports?: ChatMessageExport[];
}

interface SessionListItem {
  id: string;
  updatedAt: string | null;
  lastMessagePreview: string | null;
}

interface AgentMeta {
  id: string;
  name: string;
  type: string;
  description: string;
  profile: AgentProfile | null;
}

const MAX_INPUT_CHARS = 10_000;
const SOFT_LIMIT = 8_000;

export default function AgentChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { user, loading: authLoading } = useAuth();

  // Agent meta resolved from Firestore agent doc + agent-configs registry.
  const [agentMeta, setAgentMeta] = useState<AgentMeta | null>(null);
  const config = useMemo(
    () => (agentMeta ? getAgentConfig(agentMeta.type) : null),
    [agentMeta]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ---------- Initial loads ----------

  useEffect(() => {
    if (!user || !agentId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agent/sessions?agentId=${encodeURIComponent(agentId)}`);
        if (!res.ok) throw new Error("Failed to load sessions.");
        const data = (await res.json()) as { sessions: SessionListItem[] };
        if (!cancelled) setSessions(data.sessions ?? []);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load sessions.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, agentId]);

  // We need the agent's type so we can show its name + capabilities. Pull it
  // straight from Firestore via the existing agents subcollection.
  // Also subscribe so profile updates (saved by the wizard) are reflected live.
  useEffect(() => {
    if (!user || !agentId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        const { doc, onSnapshot } = await import("firebase/firestore");
        const { db } = await import("@/lib/firebase/client");
        const ref = doc(db, "users", user.uid, "agents", agentId);
        unsubscribe = onSnapshot(
          ref,
          (snap) => {
            if (cancelled) return;
            if (!snap.exists()) {
              toast.error("Agent not found. Activate it from the agents page.");
              return;
            }
            const data = snap.data() as {
              name?: string;
              type?: string;
              description?: string;
              profile?: AgentProfile | null;
            };
            setAgentMeta({
              id: agentId,
              name: data.name ?? agentId,
              type: data.type ?? agentId,
              description: data.description ?? "",
              profile: data.profile ?? null,
            });
          },
          (err) => {
            if (!cancelled) toast.error(err.message);
          }
        );
      } catch (e) {
        if (!cancelled)
          toast.error(e instanceof Error ? e.message : "Failed to load agent.");
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, agentId]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeFiles(
      user.uid,
      (next) => setFiles(next),
      (err) => toast.error(err.message)
    );
    return () => unsub();
  }, [user]);

  // ---------- Auto-scroll on message changes ----------
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---------- Auto-expand textarea (max 4 lines ≈ 96px) ----------
  function handleInputChange(value: string) {
    if (value.length > MAX_INPUT_CHARS) return;
    setInput(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    }
  }

  function resetTextareaHeight() {
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  }

  // ---------- Session loading ----------

  async function loadSession(targetSessionId: string) {
    if (!user) return;
    try {
      const res = await fetch(`/api/agent/sessions/${targetSessionId}`);
      if (!res.ok) throw new Error("Failed to load session.");
      const data = (await res.json()) as {
        messages: {
          id: string;
          role: "user" | "assistant";
          content: string;
          exports?: ChatMessageExport[];
        }[];
      };
      setSessionId(targetSessionId);
      setMessages(
        data.messages.map((m) => ({
          ...m,
          exports: Array.isArray(m.exports) ? m.exports : [],
        }))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load session.");
    }
  }

  function newConversation() {
    setSessionId(null);
    setMessages([]);
    setAttachedFileIds([]);
    setInput("");
    resetTextareaHeight();
  }

  // ---------- Send ----------

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !user || !agentId || sending) return;

      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      const assistantPlaceholder: ChatMessage = {
        id: `local-${Date.now()}-a`,
        role: "assistant",
        content: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setInput("");
      resetTextareaHeight();
      setSending(true);
      setStreaming(true);

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            message: trimmed,
            sessionId,
            contextFileIds: attachedFileIds,
          }),
        });

        if (!res.ok || !res.body) {
          let errText = "";
          try {
            const data = await res.clone().json();
            errText = data?.error ?? "";
          } catch {
            errText = await res.text().catch(() => "");
          }
          if (res.status === 429) {
            throw new Error(
              errText ||
                "You've hit your monthly message limit. Upgrade to Pro for more messages."
            );
          }
          throw new Error(errText || `Request failed (${res.status})`);
        }

        const newSessionId = res.headers.get("x-session-id");
        if (newSessionId && newSessionId !== sessionId) {
          setSessionId(newSessionId);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Vercel AI SDK data stream: lines are `<code>:<JSON>\n`.
          let newlineIdx = buffer.indexOf("\n");
          while (newlineIdx !== -1) {
            const line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);
            newlineIdx = buffer.indexOf("\n");

            const colon = line.indexOf(":");
            if (colon === -1) continue;
            const code = line.slice(0, colon);
            const payload = line.slice(colon + 1);

            if (code === "0") {
              // Text delta.
              try {
                const text = JSON.parse(payload) as string;
                assistantText += text;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last?.role === "assistant") {
                    next[next.length - 1] = { ...last, content: assistantText };
                  }
                  return next;
                });
              } catch {
                // ignore malformed line
              }
            } else if (code === "2") {
              // Vercel AI SDK "data" event — arbitrary structured payload.
              // We use this for export download cards generated mid-stream
              // by the create_export tool. Each entry has the shape
              // { type: "export", export: ChatMessageExport }.
              try {
                const items = JSON.parse(payload) as unknown;
                if (!Array.isArray(items)) continue;
                const newExports: ChatMessageExport[] = [];
                for (const item of items) {
                  if (
                    item &&
                    typeof item === "object" &&
                    (item as { type?: unknown }).type === "export"
                  ) {
                    const exp = (item as { export?: ChatMessageExport })
                      .export;
                    if (exp && typeof exp.filename === "string") {
                      newExports.push(exp);
                    }
                  }
                }
                if (newExports.length > 0) {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant") {
                      next[next.length - 1] = {
                        ...last,
                        exports: [...(last.exports ?? []), ...newExports],
                      };
                    }
                    return next;
                  });
                }
              } catch {
                // ignore malformed line
              }
            } else if (code === "3") {
              // Error part.
              try {
                const errMsg = JSON.parse(payload) as string;
                throw new Error(errMsg);
              } catch (e) {
                if (e instanceof Error) throw e;
                throw new Error("Stream error.");
              }
            }
            // "e:" and "d:" are finish events — we don't need their data here.
          }
        }

        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, streaming: false };
          }
          return next;
        });

        // Refresh session list so the new/updated session appears in the sidebar.
        const sessionsRes = await fetch(
          `/api/agent/sessions?agentId=${encodeURIComponent(agentId)}`
        );
        if (sessionsRes.ok) {
          const data = (await sessionsRes.json()) as { sessions: SessionListItem[] };
          setSessions(data.sessions ?? []);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Something went wrong.";
        // Replace the assistant placeholder (or any partial reply) with an
        // inline error bubble that includes a Retry button for this turn.
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = {
              id: `error-${Date.now()}`,
              role: "error",
              content: message,
              retryText: trimmed,
            };
          } else {
            next.push({
              id: `error-${Date.now()}`,
              role: "error",
              content: message,
              retryText: trimmed,
            });
          }
          return next;
        });
      } finally {
        setSending(false);
        setStreaming(false);
      }
    },
    [user, agentId, sending, sessionId, attachedFileIds]
  );

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  // ---------- File picker ----------

  function openPicker() {
    setPickerSelection(new Set(attachedFileIds));
    setPickerOpen(true);
  }
  function togglePickerFile(id: string) {
    setPickerSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function confirmPicker() {
    setAttachedFileIds(Array.from(pickerSelection));
    setPickerOpen(false);
    toast.success(
      `${pickerSelection.size} file${pickerSelection.size === 1 ? "" : "s"} attached`
    );
  }
  function removeAttachedFile(id: string) {
    setAttachedFileIds((prev) => prev.filter((x) => x !== id));
  }

  const attachedFiles = useMemo(
    () => files.filter((f) => attachedFileIds.includes(f.id)),
    [files, attachedFileIds]
  );

  // ---------- Profile / onboarding ----------

  const [editingProfile, setEditingProfile] = useState(false);

  async function handleSaveProfile(profile: AgentProfile) {
    if (!user || !agentId) return;
    try {
      await updateAgentProfile(user.uid, agentId, profile);
      toast.success("Agent set up");
      setEditingProfile(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  }

  // ---------- Render ----------

  const loading = authLoading || !agentMeta;
  const hasMessages = messages.length > 0;
  const needsOnboarding =
    !loading &&
    agentMeta !== null &&
    config?.profileSchema &&
    !agentMeta.profile;
  const showWizard = needsOnboarding || editingProfile;

  if (showWizard && agentMeta && config?.profileSchema) {
    return (
      <div className="mx-auto max-w-3xl py-8">
        <AgentOnboardingWizard
          agentName={agentMeta.name}
          schema={config.profileSchema}
          initialValues={agentMeta.profile ?? undefined}
          editing={editingProfile && !needsOnboarding}
          onSave={handleSaveProfile}
          onCancel={
            editingProfile && !needsOnboarding
              ? () => setEditingProfile(false)
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] flex-col md:-m-6 md:flex-row md:pb-0">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card md:flex">
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted p-2 text-muted-foreground">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">
                {agentMeta?.name ?? "Agent"}
              </div>
              {agentMeta?.type && (
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  {agentMeta.type}
                </Badge>
              )}
            </div>
          </div>
          {config?.profileSchema && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setEditingProfile(true)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Edit profile
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={newConversation}
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            New conversation
          </Button>
        </div>

        <Separator />

        <div className="space-y-4 overflow-y-auto p-4 text-sm">
          {config?.capabilities && config.capabilities.length > 0 && (
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Capabilities
              </div>
              <ul className="space-y-1">
                {config.capabilities.map((cap) => (
                  <li key={cap} className="flex items-start gap-2 text-xs">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context files
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={openPicker}
              >
                <Paperclip className="mr-1 h-3 w-3" /> Attach
              </Button>
            </div>
            {attachedFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No files attached.
              </p>
            ) : (
              <ul className="space-y-1">
                {attachedFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate" title={f.name}>{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-3 w-3" /> Conversation history
            </div>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No past sessions yet.</p>
            ) : (
              <ul className="space-y-1">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => loadSession(s.id)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                        sessionId === s.id && "bg-accent"
                      )}
                    >
                      <div className="truncate">
                        {s.lastMessagePreview ?? "New conversation"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {s.updatedAt
                          ? new Date(s.updatedAt).toLocaleString()
                          : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-4 md:p-6">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Loading agent…
              </div>
            ) : !hasMessages ? (
              <EmptyState
                agentName={agentMeta!.name}
                description={agentMeta!.description}
                prompts={config?.starterPrompts ?? []}
                onPick={(prompt) => {
                  setInput(prompt);
                  textareaRef.current?.focus();
                }}
              />
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onRetry={(text) => {
                      // Remove the trailing error bubble and re-send.
                      setMessages((prev) => {
                        const next = [...prev];
                        if (next[next.length - 1]?.role === "error") next.pop();
                        // Also drop the duplicate user message we're about to re-add.
                        if (
                          next[next.length - 1]?.role === "user" &&
                          next[next.length - 1]?.content === text
                        ) {
                          next.pop();
                        }
                        return next;
                      });
                      void send(text);
                    }}
                  />
                ))}
                {streaming && messages[messages.length - 1]?.content === "" && (
                  <TypingIndicator />
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input area */}
        <div className="border-t bg-background">
          <div className="mx-auto max-w-3xl p-3 md:p-4">
            {attachedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachedFiles.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
                  >
                    <FileText className="h-3 w-3" />
                    {f.name}
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
              <button
                type="button"
                onClick={openPicker}
                aria-label="Attach context"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${agentMeta?.name ?? "agent"}…`}
                rows={1}
                disabled={sending}
                className="min-h-[36px] max-h-36 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void send(input)}
                disabled={sending || !input.trim()}
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Enter to send · Shift + Enter for new line</span>
              {input.length > SOFT_LIMIT && (
                <span
                  className={
                    input.length >= MAX_INPUT_CHARS
                      ? "text-destructive"
                      : undefined
                  }
                >
                  {input.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File picker modal */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach context files</DialogTitle>
            <DialogDescription>
              Pick files from your library. Their text will be sent with every
              message in this conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border">
            {files.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                You haven&apos;t uploaded any files yet. Visit the Files page first.
              </p>
            ) : (
              <ul className="divide-y">
                {files.map((f) => {
                  const checked = pickerSelection.has(f.id);
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/40">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePickerFile(f.id)}
                          className="h-4 w-4 rounded border-input"
                        />
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate text-sm">{f.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatBytes(f.size)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmPicker}>
              Attach {pickerSelection.size} file
              {pickerSelection.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry: (text: string) => void;
}) {
  if (message.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1 space-y-2">
              <div>{message.content}</div>
              {message.retryText && (
                <button
                  type="button"
                  onClick={() => onRetry(message.retryText!)}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background/50 px-2 py-1 text-xs font-medium hover:bg-background"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";
  const hasExports = !isUser && (message.exports?.length ?? 0) > 0;
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
          isUser
            ? "bg-purple-600 text-white"
            : "bg-muted text-foreground"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {message.content || "…"}
            </ReactMarkdown>
          </div>
        )}
        {hasExports && (
          <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
            {message.exports!.map((exp) => (
              <ExportDownloadCard key={exp.filename + exp.size} export={exp} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportDownloadCard({ export: exp }: { export: ChatMessageExport }) {
  const Icon =
    exp.format === "pdf"
      ? FileText
      : exp.format === "xlsx" || exp.format === "csv"
        ? FileSpreadsheet
        : FileText;
  const accent =
    exp.format === "pdf"
      ? "text-red-600 dark:text-red-400"
      : exp.format === "xlsx"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-sky-600 dark:text-sky-400";
  const formatLabel = exp.format.toUpperCase();
  const displayTitle = exp.title ?? exp.filename;
  return (
    <a
      href={exp.downloadUrl}
      download={exp.filename}
      className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2 transition-colors hover:bg-background"
    >
      <div className={cn("shrink-0 rounded-md bg-muted/60 p-2", accent)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {displayTitle}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {exp.filename === displayTitle ? "" : `${exp.filename} · `}
          {formatLabel} · {formatExportSize(exp.size)}
        </div>
      </div>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

function formatExportSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
      </div>
    </div>
  );
}

function EmptyState({
  agentName,
  description,
  prompts,
  onPick,
}: {
  agentName: string;
  description: string;
  prompts: string[];
  onPick: (p: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 rounded-full border bg-muted/50 p-3 text-muted-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="text-xl font-semibold">{agentName}</h2>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {prompts.length > 0 && (
        <div className="mt-6 flex w-full max-w-xl flex-wrap justify-center gap-2">
          {prompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
