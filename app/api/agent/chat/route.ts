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
  MAX_CUSTOM_SYSTEM_PROMPT_CHARS,
  MAX_USER_MESSAGE_CHARS,
} from "@/lib/anthropic/agents";
import type { AgentProfileSchema, ProfileField } from "@/lib/anthropic/types";
import {
  attachContextToMessages,
  buildContextString,
  type ContextFileMetadata,
} from "@/lib/anthropic/context";
import {
  PAID_PLAN_MONTHLY_LIMIT,
  getMonthlyTokenSummary,
  getMonthlyUsage,
  incrementMonthlyUsage,
  recordTokenUsage,
} from "@/lib/firebase/usage";
import { addActivityToBatch, logActivity } from "@/lib/firebase/activity";
import { buildSkillManifest, getSkillBody } from "@/lib/anthropic/skills";
import {
  buildExport,
  type ExportFormat,
  type ExportRow,
  type GeneratedExport,
} from "@/lib/anthropic/exports";

/**
 * Per-turn ceiling on read_skill tool calls. Keeps cost bounded and prevents
 * a confused model from loading half the library before answering. Three is
 * empirically enough for compound questions (e.g. flat-rate VAT + use-of-home).
 */
const MAX_SKILL_LOADS_PER_TURN = 3;

/**
 * Per-turn ceiling on create_export tool calls. Five is comfortably enough
 * for a "Q1-Q4 VAT returns + annual summary" style deliverable.
 */
const MAX_EXPORTS_PER_TURN = 5;

/**
 * Per-turn ceiling on Anthropic's server-side web_search tool. The tool is
 * executed by Anthropic (not by our server) and billed separately on top of
 * tokens — roughly $10 per 1,000 searches at time of writing. Three keeps
 * cost-per-turn bounded while still allowing follow-up searches when the
 * first result is insufficient.
 */
const MAX_WEB_SEARCHES_PER_TURN = 3;

/**
 * Hard iteration cap on the tool-use loop. Should never be hit in practice
 * once per-tool caps are reached the agent answers, but acts as a
 * belt-and-braces stop in case of unexpected tool behaviour.
 */
const MAX_TOOL_ITERATIONS = 8;

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

  const userRef = adminDb.collection("users").doc(session.uid);

  // 0. Quota checks — fail fast before any Anthropic spend.
  // Two independent gates: monthly message count, and monthly token budget.
  // Either one tripping returns 429 with a clear code so the client can
  // distinguish (and a future UI can route appropriately).
  const [usage, tokenSummary] = await Promise.all([
    getMonthlyUsage(session.uid),
    getMonthlyTokenSummary(session.uid),
  ]);
  if (usage.count >= usage.limit) {
    return NextResponse.json(
      {
        error:
          usage.plan === "paid"
            ? `You've used all ${usage.limit} messages on your plan this month. Limit resets next month.`
            : `You've used all ${usage.limit} free messages this month. Upgrade to Pro for ${PAID_PLAN_MONTHLY_LIMIT} messages/month.`,
        code: "rate_limited",
        usage,
      },
      { status: 429 }
    );
  }
  if (tokenSummary.totalTokens >= tokenSummary.budget) {
    return NextResponse.json(
      {
        error:
          usage.plan === "paid"
            ? `You've used your full monthly token budget (${tokenSummary.budget.toLocaleString()} tokens). Resets next month, or contact us for additional capacity.`
            : `You've used your full free-tier token budget (${tokenSummary.budget.toLocaleString()} tokens). Upgrade to Pro for ${(5_000_000).toLocaleString()} tokens/month.`,
        code: "token_budget_exceeded",
        tokens: {
          used: tokenSummary.totalTokens,
          budget: tokenSummary.budget,
        },
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
  // Per-user override takes precedence over the built-in system prompt — but
  // is hard-clamped at MAX_CUSTOM_SYSTEM_PROMPT_CHARS so a malicious or
  // accidentally-pasted megabyte-long prompt can't bloat every turn's bill.
  const rawCustom =
    typeof agentData?.customSystemPrompt === "string" &&
    agentData.customSystemPrompt.trim().length > 0
      ? agentData.customSystemPrompt
      : null;
  const effectiveSystemPrompt =
    rawCustom !== null
      ? rawCustom.length > MAX_CUSTOM_SYSTEM_PROMPT_CHARS
        ? rawCustom.slice(0, MAX_CUSTOM_SYSTEM_PROMPT_CHARS)
        : rawCustom
      : config.systemPrompt;

  // Format the per-user profile as a structured block the model can reference.
  const profileBlock = formatProfileBlock(
    agentData?.profile ?? null,
    config.profileSchema ?? null
  );

  // Manifest of agent-scoped skills (name + description only). Bodies are NOT
  // loaded here — Phase 2 will add a read_skill tool. For now, having the
  // manifest in the system prompt nudges the agent to apply skill knowledge
  // when relevant; the model treats each bullet as a topical reference.
  const skillManifest = buildSkillManifest(agentType);

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
  // When skills are available, the route runs a tool-use loop: the model can
  // call read_skill({name}) to load any skill's body mid-turn, and we feed
  // the body back as a tool_result so the agent can use it in its answer.
  const encoder = new TextEncoder();
  let assistantText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let stopReason: string | null = null;
  const skillsUsed: string[] = [];
  // Exports generated this turn. Pushed into the assistant message doc and
  // streamed to the client as Vercel data-stream `2:` events so the chat UI
  // can render download cards inline.
  const exportsGenerated: GeneratedExport[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (prefix: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(`${prefix}:${JSON.stringify(payload)}\n`)
        );
      };

      // Build system blocks in stable order so prompt caching stays warm
      // across requests: main prompt → user profile → skill manifest. Each
      // block is marked ephemeral so cache hits accrue across the session.
      const systemBlocks: Array<{
        type: "text";
        text: string;
        cache_control: { type: "ephemeral" };
      }> = [
        {
          type: "text",
          text: effectiveSystemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ];
      if (profileBlock) {
        systemBlocks.push({
          type: "text",
          text: profileBlock,
          cache_control: { type: "ephemeral" },
        });
      }
      if (skillManifest) {
        systemBlocks.push({
          type: "text",
          text: skillManifest,
          cache_control: { type: "ephemeral" },
        });
      }

      // Tools registered on every chat call. Three kinds:
      //   1. create_export — our server-executed tool; agent produces files.
      //   2. read_skill    — our server-executed tool; loads skill bodies.
      //   3. web_search    — Anthropic-executed *server tool*. We don't need
      //      a branch in the loop for it; the API runs the search and the
      //      results land directly in the model's context. Billed separately
      //      from tokens (~$10 / 1,000 searches) — cap with max_uses.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools: any[] = [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: MAX_WEB_SEARCHES_PER_TURN,
        },
        {
          name: "create_export",
          description:
            "Generate a downloadable file (CSV, XLSX, or PDF) that the user can save to their computer or open in Excel / Google Sheets. Call this when the user asks for a report, summary, or downloadable deliverable — or when your structured output (transactions, tax calculations, line items, financial summaries) would be more useful as a file than inline text. Prefer CSV for raw transaction lists, XLSX for tax returns / multi-column financial reports, PDF for narrative summaries.\n\nIMPORTANT — verbatim source data: when the user provides source data (bank statements, invoices, transaction lists, receipts), copy the original values into the export rows EXACTLY as they appear in the source. Do not paraphrase, normalise, or 'clean up' transaction descriptions, vendor names, invoice numbers, dates, or amounts unless the user explicitly asks you to. The user often needs to reconcile the export against the source — paraphrased text breaks that. Add ADDITIONAL columns (e.g. 'Suggested category') if you want to layer your analysis; never overwrite the source values.\n\nAfter the tool returns, continue with your normal text response — the file appears inline in the chat as a download card.",
          input_schema: {
            type: "object" as const,
            properties: {
              format: {
                type: "string",
                enum: ["csv", "xlsx", "pdf"],
                description:
                  "csv: raw tabular data. xlsx: spreadsheet (best for tax returns, P&L, multi-column reports). pdf: narrative report / summary.",
              },
              filename: {
                type: "string",
                description:
                  "Filename WITH extension, e.g. 'vat-return-q1-2025.xlsx'. Use kebab-case, no spaces. Be specific so the user knows what each file is.",
              },
              title: {
                type: "string",
                description:
                  "Human-readable title shown in the download card (and on the first page of PDFs). E.g. 'Q1 2025/26 VAT Return'.",
              },
              rows: {
                type: "array",
                description:
                  "Required for csv and xlsx. Array of row objects with consistent string keys (the keys become column headers). Values must be strings, numbers, or booleans. Example: [{\"Date\":\"2025-04-01\",\"Description\":\"Sale to Acme\",\"Amount\":1250.00}].",
                items: { type: "object" as const },
              },
              markdown: {
                type: "string",
                description:
                  "Required for pdf. Full markdown body. Supports headings (# ## ###), paragraphs, bullet lists, **bold**, and simple pipe tables. For complex tables prefer xlsx instead.",
              },
            },
            required: ["format", "filename"],
          },
        },
      ];
      if (skillManifest) {
        tools.push({
          name: "read_skill",
          description:
            "Load the full body of one of the skills listed in the 'Available skills' system block. Call this when a listed skill is directly relevant to the user's current question — the body becomes available in your next response. Pass the kebab-case name exactly as shown in the manifest.",
          input_schema: {
            type: "object" as const,
            properties: {
              name: {
                type: "string",
                description:
                  "The kebab-case skill name from the Available skills manifest, e.g. 'uk-vat-flat-rate'.",
              },
            },
            required: ["name"],
          },
        });
      }

      // Working copy of the conversation history; the tool-use loop appends
      // assistant turns (with tool_use blocks) and synthetic user turns
      // (with tool_result blocks) to this array between iterations.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workingMessages: any[] = [...fullMessages];
      let iterations = 0;
      let skillLoadsThisTurn = 0;
      let exportsThisTurn = 0;

      try {
        // Tool-use loop. Most turns exit on the first pass (no tool call,
        // stop_reason === "end_turn"). When the agent decides a skill is
        // relevant it issues a tool_use; we execute it server-side and feed
        // the body back via tool_result, then call the model again.
        // eslint-disable-next-line no-constant-condition
        while (true) {
          iterations += 1;
          if (iterations > MAX_TOOL_ITERATIONS) {
            // Defensive: should never happen because the per-turn skill cap
            // forces the agent to answer before this point.
            stopReason = "max_iterations";
            break;
          }

          const anthropicStream = await anthropic.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: DEFAULT_MAX_TOKENS,
            output_config: { effort: DEFAULT_EFFORT },
            system: systemBlocks,
            tools,
            messages: workingMessages,
            stream: true,
          });

          // Accumulate content blocks for this iteration by their stream index.
          // A single assistant turn can interleave text and tool_use blocks.
          interface BlockAccumulator {
            type: "text" | "tool_use";
            text?: string;
            id?: string;
            name?: string;
            partialJson?: string;
          }
          const blocks: Record<number, BlockAccumulator> = {};
          let iterStopReason: string | null = null;

          for await (const event of anthropicStream) {
            if (event.type === "message_start") {
              const u = event.message.usage;
              if (u) {
                inputTokens += u.input_tokens ?? 0;
                cacheReadInputTokens += u.cache_read_input_tokens ?? 0;
                cacheCreationInputTokens +=
                  u.cache_creation_input_tokens ?? 0;
              }
            } else if (event.type === "content_block_start") {
              const blk = event.content_block;
              if (blk.type === "text") {
                blocks[event.index] = { type: "text", text: "" };
              } else if (blk.type === "tool_use") {
                blocks[event.index] = {
                  type: "tool_use",
                  id: blk.id,
                  name: blk.name,
                  partialJson: "",
                };
              }
            } else if (event.type === "content_block_delta") {
              const blk = blocks[event.index];
              if (!blk) continue;
              if (
                event.delta.type === "text_delta" &&
                blk.type === "text"
              ) {
                const text = event.delta.text;
                if (text) {
                  blk.text = (blk.text ?? "") + text;
                  assistantText += text;
                  enqueue("0", text);
                }
              } else if (
                event.delta.type === "input_json_delta" &&
                blk.type === "tool_use"
              ) {
                blk.partialJson =
                  (blk.partialJson ?? "") + event.delta.partial_json;
              }
            } else if (event.type === "message_delta") {
              iterStopReason = event.delta.stop_reason ?? iterStopReason;
              if (event.usage?.output_tokens) {
                outputTokens += event.usage.output_tokens;
              }
            }
          }

          stopReason = iterStopReason;

          // End-of-turn: model answered (or errored). Break out of the loop.
          if (iterStopReason !== "tool_use") {
            break;
          }

          // The model wants to call tools. Reconstruct the assistant turn
          // from accumulated blocks in stream-order, execute each tool_use,
          // and synthesize a user turn containing the tool_results.
          const indices = Object.keys(blocks)
            .map((k) => Number(k))
            .sort((a, b) => a - b);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const assistantBlocks: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolResultBlocks: any[] = [];

          for (const i of indices) {
            const blk = blocks[i];
            if (blk.type === "text") {
              if (blk.text && blk.text.length > 0) {
                assistantBlocks.push({ type: "text", text: blk.text });
              }
              continue;
            }
            // tool_use block. Parse the streamed input JSON and execute.
            let parsedInput: { name?: unknown } = {};
            try {
              parsedInput = blk.partialJson
                ? JSON.parse(blk.partialJson)
                : {};
            } catch {
              parsedInput = {};
            }
            assistantBlocks.push({
              type: "tool_use",
              id: blk.id,
              name: blk.name,
              input: parsedInput,
            });

            if (blk.name === "read_skill") {
              if (skillLoadsThisTurn >= MAX_SKILL_LOADS_PER_TURN) {
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: `Skill load cap reached for this turn (${MAX_SKILL_LOADS_PER_TURN}). Answer the user with what you already have.`,
                  is_error: true,
                });
                continue;
              }
              const rawName = (parsedInput as { name?: unknown }).name;
              const skillName = typeof rawName === "string" ? rawName : "";
              if (!skillName) {
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: "Missing required 'name' argument for read_skill.",
                  is_error: true,
                });
                continue;
              }
              const body = getSkillBody(agentType, skillName);
              if (body == null) {
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: `No skill named "${skillName}" is available for this agent. Check the Available skills manifest and pass the exact kebab-case name.`,
                  is_error: true,
                });
                continue;
              }
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: blk.id,
                content: body,
              });
              if (!skillsUsed.includes(skillName)) {
                skillsUsed.push(skillName);
              }
              skillLoadsThisTurn += 1;
              continue;
            }

            if (blk.name === "create_export") {
              if (exportsThisTurn >= MAX_EXPORTS_PER_TURN) {
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: `Export cap reached for this turn (${MAX_EXPORTS_PER_TURN}). Finish answering with the exports you've already generated.`,
                  is_error: true,
                });
                continue;
              }
              const exportInput = parsedInput as {
                format?: unknown;
                filename?: unknown;
                title?: unknown;
                rows?: unknown;
                markdown?: unknown;
              };
              const format =
                typeof exportInput.format === "string"
                  ? (exportInput.format.toLowerCase() as ExportFormat)
                  : null;
              const filename =
                typeof exportInput.filename === "string"
                  ? exportInput.filename
                  : "";
              const title =
                typeof exportInput.title === "string"
                  ? exportInput.title
                  : undefined;
              if (
                !format ||
                !["csv", "xlsx", "pdf"].includes(format) ||
                !filename
              ) {
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content:
                    "create_export requires `format` ('csv'|'xlsx'|'pdf') and `filename`.",
                  is_error: true,
                });
                continue;
              }
              try {
                const rows = Array.isArray(exportInput.rows)
                  ? (exportInput.rows as ExportRow[])
                  : undefined;
                const markdown =
                  typeof exportInput.markdown === "string"
                    ? exportInput.markdown
                    : undefined;
                const generated = await buildExport({
                  format,
                  filename,
                  title,
                  rows,
                  markdown,
                });
                exportsGenerated.push(generated);
                exportsThisTurn += 1;
                // Stream the export to the client as a Vercel data-stream
                // `2:` event so the UI can render a download card inline
                // before the assistant's text completes.
                enqueue("2", [
                  {
                    type: "export",
                    export: {
                      filename: generated.filename,
                      format: generated.format,
                      size: generated.size,
                      downloadUrl: generated.downloadUrl,
                      title: generated.title ?? null,
                    },
                  },
                ]);
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: `Generated ${generated.filename} (${generated.size} bytes). The download card is now visible to the user in the chat. Continue with your text response — do not paste a link.`,
                });
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Export failed.";
                // Log the full error to the server so Vercel logs surface
                // the real stack trace — the model only sees `message`.
                console.error("[chat] create_export failed", {
                  format: exportInput.format,
                  filename: exportInput.filename,
                  error: err,
                });
                toolResultBlocks.push({
                  type: "tool_result",
                  tool_use_id: blk.id,
                  content: `create_export failed: ${message}`,
                  is_error: true,
                });
              }
              continue;
            }

            // Unknown tool.
            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: blk.id,
              content: `Unknown tool "${blk.name}".`,
              is_error: true,
            });
          }

          // Append the assistant turn (mixed text + tool_use) and the
          // synthetic user turn (tool_result blocks) to the working history,
          // then loop to let the model produce its actual answer.
          workingMessages.push({
            role: "assistant",
            content: assistantBlocks,
          });
          workingMessages.push({
            role: "user",
            content: toolResultBlocks,
          });
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
          model: DEFAULT_MODEL,
          usage: {
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
          // Telemetry: which skills the agent decided to load this turn.
          // Empty array when none. Drives both per-message debugging and the
          // future "Consulted: X" pill in the chat UI.
          skillsUsed,
          // Files the agent generated this turn via the create_export tool.
          // Persisted so reloading the session re-renders the download cards.
          exports: exportsGenerated.map((e) => ({
            filename: e.filename,
            format: e.format,
            size: e.size,
            downloadUrl: e.downloadUrl,
            title: e.title ?? null,
          })),
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
        // Record token + USD cost for billing / overage. Same fire-and-forget
        // semantics: a failed write here must never break the streamed reply.
        void recordTokenUsage(
          session.uid,
          {
            inputTokens,
            outputTokens,
            cacheReadInputTokens,
            cacheCreationInputTokens,
          },
          DEFAULT_MODEL
        ).catch((err) => {
          console.error("[chat] recordTokenUsage failed", err);
        });
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
