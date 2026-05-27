import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { getAgentConfig } from "@/lib/anthropic/agent-configs";
import { MAX_USER_MESSAGE_CHARS } from "@/lib/anthropic/agents";
import type { AgentProfileSchema, ProfileField } from "@/lib/anthropic/types";
import {
  MAX_CONTEXT_CHARS_PER_FILE,
  buildContext,
  type ContextFileMetadata,
  type ExtractedContextFile,
} from "@/lib/anthropic/context";
import {
  checkAndRecordRateLimit,
  getMonthlyTokenSummary,
  recordTokenUsage,
} from "@/lib/firebase/usage";
import { addActivityToBatch, logActivity } from "@/lib/firebase/activity";
import {
  buildExport,
  type ExportFormat,
  type GeneratedExport,
} from "@/lib/anthropic/exports";
import {
  GoogleIntegrationError,
  googleDriveSearch,
  googleSheetsListTabs,
  googleSheetsRead,
  userHasGoogleConnected,
} from "@/lib/integrations/google";

/** Per-turn ceiling on Google API calls — matches the Quick-mode cap. */
const MAX_GOOGLE_CALLS_PER_TURN = 6;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rich-mode chat route — uses Anthropic Managed Agents instead of messages.create.
 *
 * Why a separate route: Managed Agents has different streaming semantics
 * (block-level events instead of token deltas), runs the agent inside an
 * Anthropic-hosted environment with bundled tools (bash, file ops, web search),
 * and costs ~5-10× more per turn than the standard /api/agent/chat. So we
 * keep both routes alive; the client chooses per message via a UI toggle.
 *
 * Wire format to the client: same Vercel data-stream protocol as the standard
 * route (0: text, 2: data, e/d: finish). We map Managed Agents events into
 * this format so the chat UI doesn't need a parallel stream parser.
 *   - agent.message blocks → 0:"text" deltas (whole block at a time)
 *   - agent.thinking, agent.tool_use → 2:[{type, ...}] data events for the
 *     collapsible "Agent runs" timeline in the UI
 *   - agent.custom_tool_use (create_export) → executed server-side via the
 *     existing exports lib; emits 2:[{type:"export", export}] like the
 *     standard route so download cards render the same way
 */

const ANTHROPIC_BETA = "managed-agents-2026-04-01";
const ANTHROPIC_API_BASE = "https://api.anthropic.com";

const AGENT_ID_BY_TYPE: Record<string, string | undefined> = {
  accountancy: process.env.ANTHROPIC_AGENT_ID_ACCOUNTANCY,
  // operations + general agents will be added once we expand beyond accountancy.
};

interface ChatRequestBody {
  agentId?: string;
  message?: string;
  sessionId?: string;
  contextFileIds?: string[];
}

function formatProfileBlock(
  profile: Record<string, unknown> | null,
  schema: AgentProfileSchema | null
): string | null {
  if (!profile || !schema) return null;
  const lines: string[] = [];
  for (const step of schema.steps) {
    for (const field of step.fields) {
      const raw = profile[field.key];
      if (raw === undefined || raw === null || raw === "") continue;
      if (Array.isArray(raw) && raw.length === 0) continue;
      lines.push(`- ${field.label}: ${stringifyProfileValue(field, raw)}`);
    }
  }
  if (lines.length === 0) return null;
  return `# Profile (treat as ground truth — never ask for facts already here):\n${lines.join("\n")}`;
}

function stringifyProfileValue(field: ProfileField, raw: unknown): string {
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (Array.isArray(raw)) {
    if (field.options) {
      return raw
        .map(
          (v) => field.options?.find((o) => o.value === v)?.label ?? String(v)
        )
        .join(", ");
    }
    return raw.map((v) => String(v)).join(", ");
  }
  if (field.options) {
    const match = field.options.find((o) => o.value === raw);
    if (match) return match.label;
  }
  return String(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface AnthropicCallOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  acceptStream?: boolean;
}

async function anthropic(
  path: string,
  opts: AnthropicCallOptions = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
    "anthropic-version": "2023-06-01",
    "anthropic-beta": ANTHROPIC_BETA,
  };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.acceptStream) headers["accept"] = "text/event-stream";

  const res = await fetch(`${ANTHROPIC_API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    // Honour AbortSignal so a closed client connection aborts the upstream
    // call (especially the long-running stream). Previously declared in
    // AnthropicCallOptions but accidentally not threaded into fetch.
    signal: opts.signal,
  });
  return res;
}

async function anthropicJson<T = unknown>(
  path: string,
  opts: AnthropicCallOptions = {}
): Promise<T> {
  const res = await anthropic(path, opts);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent/chat-rich
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured.", code: "missing_api_key" },
      { status: 503 }
    );
  }
  if (!process.env.ANTHROPIC_ENVIRONMENT_ID) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_ENVIRONMENT_ID not configured. Run scripts/anthropic/bootstrap-accountancy-agent.mjs and add the printed env vars.",
        code: "missing_env",
      },
      { status: 503 }
    );
  }

  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const {
    agentId,
    message,
    sessionId: rawSessionId,
    contextFileIds,
  } = body;
  if (!agentId || !message) {
    return NextResponse.json(
      { error: "Both `agentId` and `message` are required." },
      { status: 400 }
    );
  }
  if (typeof message !== "string") {
    return NextResponse.json(
      { error: "`message` must be a string." },
      { status: 400 }
    );
  }
  if (message.length > MAX_USER_MESSAGE_CHARS) {
    return NextResponse.json(
      {
        error: `Message is too long (${message.length} chars). Maximum is ${MAX_USER_MESSAGE_CHARS}.`,
        code: "message_too_long",
      },
      { status: 413 }
    );
  }

  // Per-minute rate limit (shared 60s window across both chat routes).
  // Rich is much pricier so the same cap matters more here.
  const rate = await checkAndRecordRateLimit(session.uid, "chat");
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Slow down — you've sent ${rate.count} messages in the last minute. Try again in ${rate.retryAfterSeconds}s.`,
        code: "too_many_requests",
        retryAfterSeconds: rate.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    );
  }

  // Subscription-only billing — same two gates as Quick mode.
  const tokenSummary = await getMonthlyTokenSummary(session.uid);
  if (tokenSummary.plan !== "paid") {
    return NextResponse.json(
      {
        error:
          "Rich mode is available on Pro. Subscribe to get 5,000,000 tokens/month and full agent access.",
        code: "subscription_required",
      },
      { status: 402 }
    );
  }
  if (tokenSummary.totalTokens >= tokenSummary.budget) {
    return NextResponse.json(
      {
        error: `You've used your full monthly token budget (${tokenSummary.budget.toLocaleString()} tokens). It resets at the start of the next month. To keep chatting now, top up your tokens or contact us about a higher plan.`,
        code: "token_budget_exceeded",
        tokens: {
          used: tokenSummary.totalTokens,
          budget: tokenSummary.budget,
          plan: tokenSummary.plan,
        },
      },
      { status: 429 }
    );
  }

  // Load the user's agent doc + matching config + profile.
  const userRef = adminDb.collection("users").doc(session.uid);
  const agentRef = userRef.collection("agents").doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  const agentData = agentSnap.data() as
    | {
        type?: string;
        name?: string;
        profile?: Record<string, unknown> | null;
      }
    | undefined;
  const agentName = agentData?.name ?? agentId;
  const agentType = agentData?.type;
  if (!agentType) {
    return NextResponse.json(
      { error: "Agent document missing `type` field." },
      { status: 500 }
    );
  }

  // Map agentType → Managed Agent ID. Only accountancy is wired right now.
  const managedAgentId = AGENT_ID_BY_TYPE[agentType];
  if (!managedAgentId) {
    return NextResponse.json(
      {
        error: `Rich mode isn't available for this agent yet. ANTHROPIC_AGENT_ID_${agentType.toUpperCase()} is not set.`,
        code: "agent_not_provisioned",
      },
      { status: 503 }
    );
  }

  const config = getAgentConfig(agentType);
  const profileBlock = config
    ? formatProfileBlock(agentData?.profile ?? null, config.profileSchema ?? null)
    : null;

  // Detect connected integrations so the custom-tool dispatcher can refuse
  // unconnected providers immediately. The Managed Agent itself declares
  // the tools regardless — this is the runtime gate.
  const googleConnected = await userHasGoogleConnected(session.uid);

  // Resolve / create the Firestore session doc (same pattern as the standard route).
  const sessionsCol = userRef.collection("agentSessions");
  const sessionRef = rawSessionId ? sessionsCol.doc(rawSessionId) : sessionsCol.doc();
  const firestoreSessionId = sessionRef.id;
  if (rawSessionId) {
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
  } else {
    await sessionRef.set({
      agentId,
      status: "active",
      mode: "rich",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    void logActivity(session.uid, {
      type: "session_started",
      message: `Started a new rich-mode conversation with ${agentName}`,
      metadata: { agentId, sessionId: firestoreSessionId, mode: "rich" },
    });
  }

  // Build context from attached files.
  let contextString = "";
  let truncatedFiles: ExtractedContextFile[] = [];
  if (Array.isArray(contextFileIds) && contextFileIds.length > 0) {
    const filesCol = userRef.collection("files");
    const fileSnaps = await Promise.all(
      contextFileIds.map((id) => filesCol.doc(id).get())
    );
    const metadata: ContextFileMetadata[] = fileSnaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const d = snap.data() as {
          name?: string;
          type?: string;
          size?: number;
          storagePath?: string;
        };
        return {
          id: snap.id,
          name: d.name ?? snap.id,
          type: d.type ?? "",
          size: typeof d.size === "number" ? d.size : 0,
          storagePath: d.storagePath ?? "",
        };
      });
    const built = await buildContext(metadata);
    contextString = built.contextString;
    truncatedFiles = built.truncated;
    if (metadata.length > 0) {
      void logActivity(session.uid, {
        type: "files_attached",
        message: `Attached ${metadata.length} file${metadata.length === 1 ? "" : "s"} to ${agentName}`,
        metadata: { agentId, sessionId: firestoreSessionId, fileIds: contextFileIds },
      });
    }
  }

  // Compose the user message. Profile + file context are injected inline since
  // we don't yet have a memory-store write API; the agent reads them directly.
  const userMessageParts: string[] = [];
  if (profileBlock) userMessageParts.push(profileBlock);
  if (contextString) userMessageParts.push(contextString);
  userMessageParts.push(message);
  const userMessageText = userMessageParts.join("\n\n---\n\n");

  // ────────────── Open the Anthropic session and stream events ──────────────
  const encoder = new TextEncoder();
  let assistantText = "";
  const exportsGenerated: GeneratedExport[] = [];
  const skillsUsed: string[] = [];
  const toolCallsTimeline: Array<{
    type: "thinking" | "tool_use" | "tool_done" | "custom_tool_use";
    name?: string;
    input?: unknown;
    text?: string;
  }> = [];
  let anthropicSessionId: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (prefix: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`${prefix}:${JSON.stringify(payload)}\n`)
        );
      };

      // Surface any attached files that didn't fit in the per-file char cap.
      if (truncatedFiles.length > 0) {
        enqueue("2", [
          {
            type: "file_truncated",
            files: truncatedFiles.map((f) => ({
              name: f.name,
              originalChars: f.originalChars,
              keptChars: MAX_CONTEXT_CHARS_PER_FILE,
            })),
          },
        ]);
      }

      // request.signal aborts when the client closes the connection.
      // Threaded into every upstream Anthropic call so a closed tab stops
      // the run — saves output-token cost on the (possibly 60-180s) stream.
      const abortSignal = request.signal;

      // Token counters hoisted to function scope so the `finally` block can
      // record whatever we accumulated, even on errored / aborted streams.
      // Chat-rich pulls totals from a post-stream `sessions/{id}` retrieve
      // call rather than from message_start events; we try that call from
      // both the success path AND the finally block.
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheReadInputTokens = 0;
      let cacheCreationInputTokens = 0;
      let createdAnthropicSessionId: string | null = null;
      let googleCallsThisTurn = 0;

      try {
        // 1. Create the Anthropic session.
        const aSession = (await anthropicJson("/v1/sessions", {
          method: "POST",
          body: {
            agent: managedAgentId,
            environment_id: process.env.ANTHROPIC_ENVIRONMENT_ID,
            title: `${agentName} — ${new Date().toISOString().slice(0, 16)}`,
          },
          signal: abortSignal,
        })) as { id: string };
        anthropicSessionId = aSession.id;
        createdAnthropicSessionId = aSession.id;

        // 2. Open the event stream FIRST so we don't miss early events.
        const streamRes = await anthropic(`/v1/sessions/${aSession.id}/events/stream`, {
          method: "GET",
          acceptStream: true,
          signal: abortSignal,
        });
        if (!streamRes.ok) {
          throw new Error(
            `Stream open failed: HTTP ${streamRes.status} ${await streamRes.text().catch(() => "")}`
          );
        }

        // 3. Post the user message to the session.
        const userPostRes = await anthropic(`/v1/sessions/${aSession.id}/events`, {
          method: "POST",
          signal: abortSignal,
          body: {
            events: [
              {
                type: "user.message",
                content: [{ type: "text", text: userMessageText }],
              },
            ],
          },
        });
        if (!userPostRes.ok) {
          throw new Error(
            `User message post failed: HTTP ${userPostRes.status} ${await userPostRes.text().catch(() => "")}`
          );
        }

        // 4. Consume the SSE stream until end_turn.
        const eventsById = new Map<string, Record<string, unknown>>();
        await consumeSse(streamRes, async (event) => {
          const eType = (event.type as string) ?? "";

          if (event.id && typeof event.id === "string") {
            eventsById.set(event.id, event);
          }

          // Skill loads are detected by reading SKILL.md files.
          if (eType === "agent.tool_use") {
            const name = (event.name as string) ?? "";
            const input = (event.input as Record<string, unknown>) ?? {};
            const fp = input.file_path as string | undefined;
            if (name === "read" && fp?.startsWith("/workspace/skills/")) {
              const match = /\/workspace\/skills\/([^/]+)\/SKILL\.md/.exec(fp);
              if (match && !skillsUsed.includes(match[1])) {
                skillsUsed.push(match[1]);
              }
            }
            const tlEntry = {
              type: "tool_use" as const,
              name,
              input,
            };
            toolCallsTimeline.push(tlEntry);
            enqueue("2", [{ type: "agent_tool_use", name, input: redactLargeFields(input) }]);
          } else if (eType === "agent.tool_result") {
            enqueue("2", [{ type: "agent_tool_done" }]);
          } else if (eType === "agent.thinking") {
            const text = (event.text as string) ?? "";
            if (text) {
              toolCallsTimeline.push({ type: "thinking", text });
              enqueue("2", [
                { type: "agent_thinking", text: text.slice(0, 500) },
              ]);
            }
          } else if (eType === "agent.message") {
            // Block-level text. Emit as a text delta so the UI accumulates it.
            const text = extractAgentMessageText(event);
            if (text) {
              assistantText += assistantText ? "\n\n" + text : text;
              enqueue("0", text);
            }
          } else if (eType === "agent.custom_tool_use") {
            const name = (event.name as string) ?? "";
            const input = (event.input as Record<string, unknown>) ?? {};
            toolCallsTimeline.push({ type: "custom_tool_use", name, input });
            // Don't enqueue here — the actual export card emits on success
            // inside the requires_action handler below.
            void name;
          } else if (eType === "session.status_idle" || eType === "session.thread_status_idle") {
            const stop = event.stop_reason as
              | { type?: string; event_ids?: string[] }
              | undefined;
            if (!stop) return null;

            if (stop.type === "requires_action" && Array.isArray(stop.event_ids)) {
              for (const eid of stop.event_ids) {
                const toolEvent = eventsById.get(eid);
                if (!toolEvent) continue;
                const toolName = (toolEvent.name as string) ?? "";
                const toolInput = (toolEvent.input as Record<string, unknown>) ?? {};

                if (toolName === "create_export") {
                  const result = await handleCreateExport(toolInput);
                  if (result.ok && result.export) {
                    exportsGenerated.push(result.export);
                    enqueue("2", [
                      {
                        type: "export",
                        export: {
                          filename: result.export.filename,
                          format: result.export.format,
                          size: result.export.size,
                          downloadUrl: result.export.downloadUrl,
                          title: result.export.title ?? null,
                        },
                      },
                    ]);
                  }
                  await anthropic(`/v1/sessions/${aSession.id}/events`, {
                    method: "POST",
                    signal: abortSignal,
                    body: {
                      events: [
                        {
                          type: "user.custom_tool_result",
                          custom_tool_use_id: eid,
                          content: [{ type: "text", text: result.message }],
                        },
                      ],
                    },
                  });
                } else if (
                  toolName === "google_drive_search" ||
                  toolName === "google_sheets_list_tabs" ||
                  toolName === "google_sheets_read"
                ) {
                  const resultText = await handleGoogleTool({
                    uid: session.uid,
                    toolName,
                    input: toolInput,
                    googleConnected,
                    callsSoFar: googleCallsThisTurn,
                  });
                  if (resultText.callConsumed) googleCallsThisTurn += 1;
                  await anthropic(`/v1/sessions/${aSession.id}/events`, {
                    method: "POST",
                    signal: abortSignal,
                    body: {
                      events: [
                        {
                          type: "user.custom_tool_result",
                          custom_tool_use_id: eid,
                          content: [{ type: "text", text: resultText.text }],
                        },
                      ],
                    },
                  });
                } else {
                  // Unknown custom tool — report back and continue.
                  await anthropic(`/v1/sessions/${aSession.id}/events`, {
                    method: "POST",
                    signal: abortSignal,
                    body: {
                      events: [
                        {
                          type: "user.custom_tool_result",
                          custom_tool_use_id: eid,
                          content: [
                            { type: "text", text: `Unknown tool "${toolName}".` },
                          ],
                        },
                      ],
                    },
                  });
                }
              }
            } else if (stop.type === "end_turn") {
              return "stop";
            }
          }
          return null;
        });

        // 5. Retrieve usage from the session detail.
        try {
          const sessionDetail = (await anthropicJson(
            `/v1/sessions/${aSession.id}`
          )) as {
            usage?: {
              input_tokens?: number;
              output_tokens?: number;
              cache_read_input_tokens?: number;
              cache_creation?: {
                ephemeral_5m_input_tokens?: number;
                ephemeral_1h_input_tokens?: number;
              };
            };
          };
          const u = sessionDetail.usage ?? {};
          inputTokens = u.input_tokens ?? 0;
          outputTokens = u.output_tokens ?? 0;
          cacheReadInputTokens = u.cache_read_input_tokens ?? 0;
          cacheCreationInputTokens =
            (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
            (u.cache_creation?.ephemeral_1h_input_tokens ?? 0);
        } catch (err) {
          console.error("[chat-rich] failed to fetch session usage", err);
        }

        const finishPayload = {
          finishReason: "stop",
          usage: {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
        };
        enqueue("e", finishPayload);
        enqueue("d", finishPayload);

        // 6. Persist messages + counters in a Firestore batch.
        const batch = adminDb.batch();
        const now = FieldValue.serverTimestamp();
        const messagesCol = sessionRef.collection("messages");

        const userMsgRef = messagesCol.doc();
        batch.set(userMsgRef, {
          role: "user",
          content: message, // store the user's message NOT the inlined profile/context
          createdAt: now,
          mode: "rich",
        });

        const assistantMsgRef = messagesCol.doc();
        batch.set(assistantMsgRef, {
          role: "assistant",
          content: assistantText,
          createdAt: now,
          stopReason: "end_turn",
          model: "managed-agent",
          mode: "rich",
          managedAgentSessionId: anthropicSessionId,
          usage: {
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
          skillsUsed,
          exports: exportsGenerated.map((e) => ({
            filename: e.filename,
            format: e.format,
            size: e.size,
            downloadUrl: e.downloadUrl,
            title: e.title ?? null,
          })),
          // Compact timeline for the UI to render the agent's reasoning.
          timeline: toolCallsTimeline.slice(0, 50).map((t) => ({
            type: t.type,
            name: t.name ?? null,
            text: t.text ? t.text.slice(0, 500) : null,
          })),
        });

        batch.update(sessionRef, {
          updatedAt: now,
          lastMessageAt: now,
          lastMessagePreview: assistantText.slice(0, 140),
          mode: "rich",
        });

        batch.update(agentRef, {
          messageCount: FieldValue.increment(2),
          lastMessageAt: now,
        });

        addActivityToBatch(batch, session.uid, {
          type: "message_sent",
          message: `Sent a rich-mode message to ${agentName}`,
          metadata: { agentId, sessionId: firestoreSessionId, mode: "rich" },
        });

        await batch.commit();
      } catch (err) {
        // Treat client-disconnect aborts as expected — the user closed the
        // tab. No need to noise the logs; just close cleanly.
        const isAbort =
          (err instanceof Error && err.name === "AbortError") ||
          request.signal.aborted;
        if (isAbort) {
          console.warn("[chat-rich] client disconnected; stream aborted");
        } else {
          console.error("[chat-rich] stream error", err);
          const message = err instanceof Error ? err.message : "Rich stream failed.";
          enqueue("3", message);
        }
      } finally {
        // Token recording runs unconditionally — even on errored or aborted
        // streams. Anthropic has billed us for any tokens that already
        // streamed before the failure, so the user must see them in their
        // usage. Closes audit finding #16.
        //
        // If the success path's usage retrieval didn't run (we errored
        // before line ~570), try it here as a last-ditch effort. Best
        // effort — failures are logged but don't propagate.
        if (
          inputTokens === 0 &&
          outputTokens === 0 &&
          cacheReadInputTokens === 0 &&
          cacheCreationInputTokens === 0 &&
          createdAnthropicSessionId
        ) {
          try {
            const detail = (await anthropicJson(
              `/v1/sessions/${createdAnthropicSessionId}`
            )) as {
              usage?: {
                input_tokens?: number;
                output_tokens?: number;
                cache_read_input_tokens?: number;
                cache_creation?: {
                  ephemeral_5m_input_tokens?: number;
                  ephemeral_1h_input_tokens?: number;
                };
              };
            };
            const u = detail.usage ?? {};
            inputTokens = u.input_tokens ?? 0;
            outputTokens = u.output_tokens ?? 0;
            cacheReadInputTokens = u.cache_read_input_tokens ?? 0;
            cacheCreationInputTokens =
              (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
              (u.cache_creation?.ephemeral_1h_input_tokens ?? 0);
          } catch (err) {
            console.error(
              "[chat-rich] post-failure usage retrieval failed",
              err
            );
          }
        }
        if (
          inputTokens > 0 ||
          outputTokens > 0 ||
          cacheReadInputTokens > 0 ||
          cacheCreationInputTokens > 0
        ) {
          void recordTokenUsage(
            session.uid,
            {
              inputTokens,
              outputTokens,
              cacheReadInputTokens,
              cacheCreationInputTokens,
            },
            "claude-sonnet-4-6"
          ).catch((err) => {
            console.error("[chat-rich] recordTokenUsage failed", err);
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-data-stream": "v1",
      "x-session-id": firestoreSessionId,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// create_export handler — bridges the agent's tool call to our exports lib.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single dispatcher for the three Google integration tools. Returns the
 * text to send back as the custom_tool_result, plus a flag indicating
 * whether this counts against the per-turn cap (it doesn't when we refuse
 * the call up front).
 */
async function handleGoogleTool(params: {
  uid: string;
  toolName: string;
  input: Record<string, unknown>;
  googleConnected: boolean;
  callsSoFar: number;
}): Promise<{ text: string; callConsumed: boolean }> {
  const { uid, toolName, input, googleConnected, callsSoFar } = params;
  if (!googleConnected) {
    return {
      text: "Google isn't connected for this user. Tell them to connect Google via /dashboard/integrations and try again.",
      callConsumed: false,
    };
  }
  if (callsSoFar >= MAX_GOOGLE_CALLS_PER_TURN) {
    return {
      text: `Google API call cap reached for this turn (${MAX_GOOGLE_CALLS_PER_TURN}). Answer with what you already have.`,
      callConsumed: false,
    };
  }
  try {
    if (toolName === "google_drive_search") {
      const query = typeof input.query === "string" ? input.query : "";
      if (!query) {
        throw new GoogleIntegrationError(
          "api_error",
          "google_drive_search requires a `query` string."
        );
      }
      const mimeAlias =
        typeof input.mime_type === "string" ? input.mime_type : "sheet";
      const mimeType =
        mimeAlias === "all"
          ? null
          : mimeAlias === "doc"
            ? "application/vnd.google-apps.document"
            : mimeAlias === "pdf"
              ? "application/pdf"
              : "application/vnd.google-apps.spreadsheet";
      const { files } = await googleDriveSearch(uid, { query, mimeType });
      return {
        text: JSON.stringify(
          files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            modifiedTime: f.modifiedTime,
          })),
          null,
          2
        ),
        callConsumed: true,
      };
    }
    if (toolName === "google_sheets_list_tabs") {
      const sid =
        typeof input.spreadsheet_id === "string" ? input.spreadsheet_id : "";
      if (!sid) {
        throw new GoogleIntegrationError(
          "api_error",
          "google_sheets_list_tabs requires a `spreadsheet_id`."
        );
      }
      const { title, tabs } = await googleSheetsListTabs(uid, sid);
      return {
        text: JSON.stringify({ title, tabs }, null, 2),
        callConsumed: true,
      };
    }
    // google_sheets_read
    const sid =
      typeof input.spreadsheet_id === "string" ? input.spreadsheet_id : "";
    if (!sid) {
      throw new GoogleIntegrationError(
        "api_error",
        "google_sheets_read requires a `spreadsheet_id`."
      );
    }
    const range = typeof input.range === "string" ? input.range : undefined;
    const read = await googleSheetsRead(uid, { spreadsheetId: sid, range });
    const csv = read.values
      .map((row) =>
        row.map((v) => (v === null || v === undefined ? "" : String(v))).join(",")
      )
      .join("\n");
    const suffix =
      read.truncatedRows > 0
        ? `\n\n[truncated — ${read.truncatedRows} more rows after the 1,000-row cap. Call again with a tighter range.]`
        : "";
    return {
      text: `Range: ${read.range}\nRows: ${read.values.length}\n\n${csv}${suffix}`,
      callConsumed: true,
    };
  } catch (err) {
    const msg =
      err instanceof GoogleIntegrationError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Google tool failed";
    console.error("[chat-rich] Google tool failed", { tool: toolName, error: msg });
    return { text: msg, callConsumed: true };
  }
}

async function handleCreateExport(
  input: Record<string, unknown>
): Promise<{ ok: true; export: GeneratedExport; message: string } | { ok: false; message: string }> {
  const format = typeof input.format === "string" ? (input.format.toLowerCase() as ExportFormat) : null;
  const filename = typeof input.filename === "string" ? input.filename : "";
  const title = typeof input.title === "string" ? input.title : undefined;
  const summary = typeof input.summary === "string" ? input.summary : undefined;

  if (!format || !["csv", "xlsx", "pdf"].includes(format) || !filename) {
    return {
      ok: false,
      message:
        "create_export requires format ('csv'|'xlsx'|'pdf') and filename. The file you saved to /mnt/session/outputs/ won't be visible to the user until this is fixed.",
    };
  }

  // For rich mode, the agent generates the actual file in its environment
  // sandbox. We don't yet have a session-output retrieval API wired up — so
  // we generate a placeholder PDF or use the markdown summary as the file
  // body. When the session-output API is added, swap this for a fetch of
  // /mnt/session/outputs/<filename> from the Anthropic session.
  // For now: if the agent passed `summary` or `markdown`, render to a PDF
  // placeholder so the user gets something tangible.
  try {
    const markdown =
      (typeof input.markdown === "string" ? input.markdown : null) ??
      (summary
        ? `# ${title ?? filename}\n\n${summary}\n\n*Generated by rich-mode agent. The actual file is at /mnt/session/outputs/${filename} in the agent's environment — session-output retrieval not yet wired.*`
        : `# ${title ?? filename}\n\n*Placeholder — session output retrieval not yet wired.*`);

    // If the agent asked for csv/xlsx but only gave us prose, fall back to PDF.
    const fallbackFormat: ExportFormat = format === "pdf" ? "pdf" : format;
    const exp = await buildExport({
      format: fallbackFormat,
      filename,
      title,
      markdown,
      // No rows available from rich mode (agent generated the xlsx itself).
      rows: undefined,
    });
    return {
      ok: true,
      export: exp,
      message: `Registered ${filename} as a download card. The user can see and download it from the chat.`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Export registration failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE consumer.
// ─────────────────────────────────────────────────────────────────────────────

async function consumeSse(
  response: Response,
  onEvent: (event: Record<string, unknown>) => Promise<"stop" | null>
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = chunk.split("\n");
      let data = "";
      let eventName: string | null = null;
      for (const line of lines) {
        if (line.startsWith("data:")) data += line.slice(5).trim();
        else if (line.startsWith("event:")) eventName = line.slice(6).trim();
      }
      if (!data) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      if (eventName && !parsed.type) parsed.type = eventName;
      const verdict = await onEvent(parsed);
      if (verdict === "stop") return;
    }
  }
}

function extractAgentMessageText(event: Record<string, unknown>): string {
  // Try a few shapes — events are still beta and the canonical schema is fluid.
  const direct = event.text;
  if (typeof direct === "string") return direct;
  const content = event.content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === "object" && "text" in c) {
          return typeof (c as { text?: unknown }).text === "string"
            ? (c as { text: string }).text
            : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

function redactLargeFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.length > 200) {
      out[k] = v.slice(0, 200) + `…(${v.length - 200} more)`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
