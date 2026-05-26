import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/firebase/session";
import { anthropic } from "@/lib/anthropic/client";
import { getAgentConfig } from "@/lib/anthropic/agent-configs";
import {
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
} from "@/lib/anthropic/agents";
import type { AgentProfileSchema, ProfileField } from "@/lib/anthropic/types";
import {
  attachContextToMessages,
  buildContextString,
  type ContextFileMetadata,
} from "@/lib/anthropic/context";
import { getMonthlyUsage, incrementMonthlyUsage } from "@/lib/firebase/usage";
import { addActivityToBatch, logActivity } from "@/lib/firebase/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContextFile {
  name?: string;
  type?: string;
  size?: number;
  storagePath?: string;
}

interface ChatRequestBody {
  agentId?: string;
  message?: string;
  sessionId?: string;
  /** Lightweight metadata-only context (no extraction). */
  contextFiles?: ContextFile[];
  /** Firestore doc IDs under /users/{uid}/files. Bytes are extracted server-side. */
  contextFileIds?: string[];
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
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
  return [
    "# About this user",
    "Use these facts as ground truth in every response. Don't ask for information that's already here.",
    "",
    ...lines,
  ].join("\n");
}

function stringifyProfileValue(field: ProfileField, raw: unknown): string {
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (Array.isArray(raw)) {
    if (field.options) {
      return raw
        .map(
          (v) =>
            field.options?.find((o) => o.value === v)?.label ?? String(v)
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

function buildUserContent(message: string, files: ContextFile[] | undefined): string {
  if (!files || files.length === 0) return message;
  const block = files
    .map((f) => {
      const parts = [`- ${f.name ?? "file"}`];
      const meta: string[] = [];
      if (f.type) meta.push(f.type);
      if (typeof f.size === "number") meta.push(`${f.size} bytes`);
      if (meta.length > 0) parts.push(`(${meta.join(", ")})`);
      return parts.join(" ");
    })
    .join("\n");
  return `The user has attached the following file(s) for context:\n${block}\n\n---\n\n${message}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  // Pre-flight: ensure the Anthropic key is configured before any work.
  // Mid-stream "key missing" errors are confusing for the user.
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "The Anthropic API key isn't configured on this server. Add ANTHROPIC_API_KEY to .env.local (or your hosting env vars) and restart.",
        code: "missing_api_key",
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
    contextFiles,
    contextFileIds,
  } = body;
  if (!agentId || !message) {
    return NextResponse.json(
      { error: "Both `agentId` and `message` are required." },
      { status: 400 }
    );
  }

  const userRef = adminDb.collection("users").doc(session.uid);

  // 0. Rate limit check — fail fast before the expensive Anthropic call.
  const usage = await getMonthlyUsage(session.uid);
  if (usage.count >= usage.limit) {
    return NextResponse.json(
      {
        error:
          usage.plan === "paid"
            ? `You've used all ${usage.limit} messages on your plan this month. Limit resets next month.`
            : `You've used all ${usage.limit} free messages this month. Upgrade to Pro for ${1000} messages/month.`,
        code: "rate_limited",
        usage,
      },
      { status: 429 }
    );
  }

  // 1. Load the agent document and resolve the system prompt via its type.
  const agentRef = userRef.collection("agents").doc(agentId);
  const agentSnap = await agentRef.get();
  if (!agentSnap.exists) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  const agentData = agentSnap.data() as
    | {
        type?: string;
        customSystemPrompt?: string | null;
        name?: string;
        profile?: Record<string, unknown> | null;
      }
    | undefined;
  const agentName = agentData?.name ?? agentId;
  const agentType = agentData?.type;
  if (!agentType) {
    return NextResponse.json(
      { error: "Agent document is missing a `type` field." },
      { status: 500 }
    );
  }
  const config = getAgentConfig(agentType);
  if (!config) {
    return NextResponse.json(
      { error: `No agent config registered for type "${agentType}".` },
      { status: 500 }
    );
  }
  // Per-user override takes precedence over the built-in system prompt.
  const effectiveSystemPrompt =
    typeof agentData?.customSystemPrompt === "string" &&
    agentData.customSystemPrompt.trim().length > 0
      ? agentData.customSystemPrompt
      : config.systemPrompt;

  // Format the per-user profile as a structured block the model can reference.
  const profileBlock = formatProfileBlock(
    agentData?.profile ?? null,
    config.profileSchema ?? null
  );

  // 2. Resolve or create the session.
  const sessionsCol = userRef.collection("agentSessions");
  const sessionRef = rawSessionId
    ? sessionsCol.doc(rawSessionId)
    : sessionsCol.doc();
  const sessionId = sessionRef.id;

  if (rawSessionId) {
    const snap = await sessionRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
  } else {
    await sessionRef.set({
      agentId,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Log the new session immediately (best-effort).
    void logActivity(session.uid, {
      type: "session_started",
      message: `Started a new conversation with ${agentName}`,
      metadata: { agentId, sessionId },
    });
  }

  // 3. Load conversation history (oldest first) for the model.
  const messagesCol = sessionRef.collection("messages");
  const historySnap = await messagesCol.orderBy("createdAt", "asc").get();
  const history: AnthropicMessage[] = historySnap.docs.map((d) => {
    const data = d.data() as { role?: "user" | "assistant"; content?: string };
    return {
      role: data.role === "assistant" ? "assistant" : "user",
      content: data.content ?? "",
    };
  });

  const userContent = buildUserContent(message, contextFiles);

  // Resolve contextFileIds → metadata → extract → context string.
  let contextString = "";
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
    contextString = await buildContextString(metadata);
    if (metadata.length > 0) {
      void logActivity(session.uid, {
        type: "files_attached",
        message: `Attached ${metadata.length} file${metadata.length === 1 ? "" : "s"} to ${agentName}`,
        metadata: { agentId, sessionId, fileIds: contextFileIds },
      });
    }
  }

  const baseMessages: AnthropicMessage[] = [
    ...history,
    { role: "user", content: userContent },
  ];
  const fullMessages = attachContextToMessages(baseMessages, contextString);

  // 4. Stream the response in the Vercel AI SDK Data Stream format.
  const encoder = new TextEncoder();
  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let stopReason: string | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (prefix: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`${prefix}:${JSON.stringify(payload)}\n`)
        );
      };

      try {
        const anthropicStream = await anthropic.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: DEFAULT_MAX_TOKENS,
          output_config: { effort: DEFAULT_EFFORT },
          system: profileBlock
            ? [
                {
                  type: "text",
                  text: effectiveSystemPrompt,
                  cache_control: { type: "ephemeral" },
                },
                {
                  type: "text",
                  text: profileBlock,
                  cache_control: { type: "ephemeral" },
                },
              ]
            : [
                {
                  type: "text",
                  text: effectiveSystemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
          messages: fullMessages,
          stream: true,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            if (text) {
              assistantText += text;
              enqueue("0", text);
            }
          } else if (event.type === "message_start") {
            const usage = event.message.usage;
            if (usage) {
              inputTokens = usage.input_tokens ?? 0;
              cacheReadInputTokens = usage.cache_read_input_tokens ?? 0;
              cacheCreationInputTokens =
                usage.cache_creation_input_tokens ?? 0;
            }
          } else if (event.type === "message_delta") {
            stopReason = event.delta.stop_reason ?? stopReason;
            if (event.usage?.output_tokens) {
              outputTokens = event.usage.output_tokens;
            }
          }
        }

        const finishPayload = {
          finishReason: stopReason ?? "stop",
          usage: {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
        };
        enqueue("e", finishPayload);
        enqueue("d", finishPayload);

        // 5. Persist both messages and bump counters in a single batch.
        const batch = adminDb.batch();
        const now = FieldValue.serverTimestamp();

        const userMsgRef = messagesCol.doc();
        batch.set(userMsgRef, {
          role: "user",
          content: userContent,
          createdAt: now,
        });

        const assistantMsgRef = messagesCol.doc();
        batch.set(assistantMsgRef, {
          role: "assistant",
          content: assistantText,
          createdAt: now,
          stopReason: stopReason ?? "stop",
          usage: {
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
        });

        batch.update(sessionRef, {
          updatedAt: now,
          lastMessageAt: now,
          lastMessagePreview: assistantText.slice(0, 140),
        });

        batch.update(agentRef, {
          messageCount: FieldValue.increment(2),
          lastSessionId: sessionId,
          lastMessageAt: now,
        });

        // Activity log entry for the message round-trip.
        addActivityToBatch(batch, session.uid, {
          type: "message_sent",
          message: `Sent a message to ${agentName}`,
          metadata: { agentId, sessionId },
        });

        await batch.commit();

        // Increment the monthly usage counter once the model call succeeded.
        // Errors here are non-fatal: the chat already streamed back to the user.
        void incrementMonthlyUsage(session.uid, 1);
        controller.close();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Stream failed.";
        enqueue("3", errorMessage);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-data-stream": "v1",
      "x-session-id": sessionId,
    },
  });
}
