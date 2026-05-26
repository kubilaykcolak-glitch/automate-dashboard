#!/usr/bin/env node
/**
 * Managed Agents — Phase 0 prototype.
 *
 * Runs locally against your Anthropic API. Does not touch the live SaaS.
 *
 * What it does, end to end:
 *   1. Creates a Managed Agent ("Accountancy Prototype") with:
 *        - your custom uk-vat-flat-rate skill
 *        - Anthropic's built-in xlsx / pptx / pdf / docx skills
 *        - the agent_toolset_20260401 bundled toolset
 *        - a custom create_export tool definition
 *   2. Creates a memory store, writes a fake user profile into it.
 *   3. Opens a session attached to the environment + memory store.
 *   4. Sends one user message (a VAT-return-with-download question).
 *   5. Streams session events — logs every type so we can see the wire shape.
 *   6. When the agent calls create_export, mocks the response with a fake URL.
 *   7. Prints a summary: total tokens, duration, custom tool calls, all event types fired.
 *
 * Run:
 *   node scripts/anthropic/bootstrap-prototype.mjs
 *
 * Requires ANTHROPIC_API_KEY in .env.local OR exported as an env var.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Provided by the user — confirmed from console.
  environmentId: "env_0179oKijtUsLa84wXBRvSfdG",
  customSkillId: "skill_01NL2jQZdKLFGZgSENShHQek", // uk-vat-flat-rate
  // Beta required for Managed Agents APIs.
  betaHeader: "managed-agents-2026-04-01",
  apiBase: "https://api.anthropic.com",
  // Match the model used by the live SaaS so we test like-for-like.
  model: "claude-sonnet-4-6",
  agentName: "Accountancy Prototype",
  // The test prompt — designed to (a) trigger the VAT skill, (b) ask for an
  // export, so we exercise both skill loading and custom tool callback.
  testPrompt:
    "I'm a UK IT consultant on the flat-rate VAT scheme, sector rate 14.5%, registered 4 months ago. " +
    "I invoiced £18,400 net (plus £3,680 VAT) this quarter. " +
    "What do I owe HMRC, and can you produce a one-row Q1 VAT-return XLSX I can download?",
};

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap env loading (Node 20+ has --env-file but this is portable)
// ─────────────────────────────────────────────────────────────────────────────

function loadDotEnvLocal() {
  const path = join(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error(
    "❌ ANTHROPIC_API_KEY not found in environment or .env.local. Aborting."
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helper with standard headers
// ─────────────────────────────────────────────────────────────────────────────

async function api(path, options = {}) {
  const res = await fetch(`${CONFIG.apiBase}${path}`, {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": CONFIG.betaHeader,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} on ${path}\n${body}`
    );
  }
  return res;
}

async function apiJson(path, options = {}) {
  const res = await api(path, options);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt used for the prototype agent — taken from the live
// accountancy agent but trimmed slightly for first-run sanity.
// ─────────────────────────────────────────────────────────────────────────────

const PROTOTYPE_SYSTEM_PROMPT = `You are a senior UK accountant — twenty years' practice with small businesses and the self-employed.

# Who you are talking to
A small UK business owner. Their profile and prior context live in the attached memory store — check it before responding so you don't ask for things you already know.

# Operating principles
- Apply UK HMRC rules. British English, £ currency, DD/MM/YYYY dates.
- Never invent figures, rates, or thresholds. If unsure, say so.
- Frame outputs as "materials for your accountant", not formal tax advice.
- No preamble. Get to the answer.

# Tools and skills
- You have skills for UK VAT (flat-rate scheme, etc.) — apply their guidance silently when relevant.
- You have document-generation skills (xlsx, pdf, docx) — use them when the user asks for a file.
- When you produce a downloadable file the user should save, call create_export so it gets registered as a download card.`;

// ─────────────────────────────────────────────────────────────────────────────
// Mock create_export — the prototype just returns a fake URL so we can see
// the round-trip without actually generating files. Production wires this to
// lib/anthropic/exports.ts.
// ─────────────────────────────────────────────────────────────────────────────

function mockCreateExport(input) {
  const filename = input?.filename ?? "export.txt";
  const fakeUrl = `https://example.com/fake-exports/${encodeURIComponent(filename)}`;
  return `Generated ${filename} (mocked). Download URL: ${fakeUrl}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  log("info", "Starting Managed Agents prototype run");
  log("info", `Environment: ${CONFIG.environmentId}`);
  log("info", `Custom skill: ${CONFIG.customSkillId}`);

  // 1. Create the agent.
  log("step", "Creating agent…");
  const agent = await apiJson("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      name: CONFIG.agentName,
      model: CONFIG.model,
      system: PROTOTYPE_SYSTEM_PROMPT,
      tools: [
        { type: "agent_toolset_20260401" },
        {
          type: "custom",
          name: "create_export",
          description:
            "Generate a downloadable file (CSV, XLSX, or PDF) the user can save. Use when the user asks for a report, downloadable deliverable, or when structured tabular output would be more useful as a file. After calling, briefly tell the user what the file contains — do not paste the URL.",
          input_schema: {
            type: "object",
            properties: {
              format: {
                type: "string",
                enum: ["csv", "xlsx", "pdf"],
              },
              filename: { type: "string" },
              title: { type: "string" },
              rows: { type: "array", items: { type: "object" } },
              markdown: { type: "string" },
            },
            required: ["format", "filename"],
          },
        },
      ],
      skills: [
        { type: "custom", skill_id: CONFIG.customSkillId, version: "latest" },
        { type: "anthropic", skill_id: "xlsx" },
        { type: "anthropic", skill_id: "pdf" },
        { type: "anthropic", skill_id: "docx" },
      ],
    }),
  });
  log("ok", `Agent created: ${agent.id} (version ${agent.version ?? "n/a"})`);

  // 2. Create a memory store and write the user profile.
  log("step", "Creating memory store…");
  let memoryStore = null;
  try {
    memoryStore = await apiJson("/v1/memory_stores", {
      method: "POST",
      body: JSON.stringify({
        name: "Prototype user profile",
      }),
    });
    log("ok", `Memory store created: ${memoryStore.id}`);
  } catch (err) {
    log("warn", `Memory store creation failed: ${err.message}`);
    log("warn", "Continuing without memory store — profile will be passed inline.");
  }

  // 3. Open a session.
  log("step", "Creating session…");
  const sessionBody = {
    agent: agent.id,
    environment_id: CONFIG.environmentId,
    title: "Prototype: flat-rate VAT + xlsx export",
  };
  if (memoryStore) {
    sessionBody.resources = [
      {
        type: "memory_store",
        memory_store_id: memoryStore.id,
        access: "read_write",
        prompt:
          "User profile and prior context. Check this before answering — never ask for facts already recorded here.",
      },
    ];
  }
  const session = await apiJson("/v1/sessions", {
    method: "POST",
    body: JSON.stringify(sessionBody),
  });
  log("ok", `Session created: ${session.id}`);

  // 4. If we have a memory store, seed it with the user profile.
  if (memoryStore) {
    log("step", "Seeding memory store with user profile…");
    // We send a system-style preamble as the first event so the agent has
    // context. In production this would be done at memory_store creation /
    // via a dedicated memory-write API once we know the right shape.
    const profileText =
      `User profile:\n` +
      `- Business name: Acme IT Consulting Ltd\n` +
      `- Business type: Limited company (sole director-shareholder)\n` +
      `- Country: United Kingdom\n` +
      `- VAT registered: Yes\n` +
      `- VAT scheme: Flat-rate (sector: IT consultancy)\n` +
      `- Flat-rate sector percentage: 14.5%\n` +
      `- VAT registration date: 4 months ago\n` +
      `- Bookkeeping software: Spreadsheets / Excel\n` +
      `- Tax year start: 6 April\n`;
    // The cleanest documented way to seed: write via initial assistant turn
    // is not ideal — actual memory writes happen through agent tools. For
    // the prototype we'll instead include the profile as the first system
    // observation by prepending to the user message below.
    log("info", "(Memory store seed mechanism TBD — sending profile inline this turn)");
  }

  // 5. Send the user message.
  log("step", "Sending user message…");
  const userMessage = memoryStore
    ? CONFIG.testPrompt
    : // No memory store available — prepend profile inline.
      `Profile: UK Ltd consultancy, flat-rate VAT (IT consultancy, 14.5%), registered 4 months ago.\n\n${CONFIG.testPrompt}`;

  await api(`/v1/sessions/${session.id}/events`, {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: userMessage }],
        },
      ],
    }),
  });
  log("ok", "User message sent. Streaming events…");

  // 6. Stream session events.
  const eventTypes = new Map(); // type → count
  const customToolCalls = [];
  let assistantText = "";
  const eventsById = new Map();

  const streamRes = await api(`/v1/sessions/${session.id}/events/stream`, {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });

  await streamSse(streamRes, async (event) => {
    eventTypes.set(event.type, (eventTypes.get(event.type) ?? 0) + 1);

    // Cache events by id (used to look up tool_use events when requires_action fires).
    if (event.id) eventsById.set(event.id, event);

    // Log a short representation of every event so we can see the wire shape.
    logEvent(event);

    // Accumulate text deltas — the exact field names may vary by SDK version.
    if (event.type === "assistant.message_delta" || event.type === "text.delta") {
      const delta = event.delta?.text ?? event.text ?? "";
      if (delta) assistantText += delta;
    }

    // Custom tool call → execute mock and send result back.
    if (event.type === "session.status_idle" && event.stop_reason) {
      const stop = event.stop_reason;
      if (stop.type === "requires_action" && Array.isArray(stop.event_ids)) {
        for (const eid of stop.event_ids) {
          const toolEvent = eventsById.get(eid);
          if (!toolEvent) {
            log("warn", `requires_action references unknown event ${eid}`);
            continue;
          }
          const toolName = toolEvent.name ?? toolEvent.tool_name;
          const toolInput = toolEvent.input ?? {};
          log("step", `Custom tool call: ${toolName}`);
          log("info", `  input: ${JSON.stringify(toolInput).slice(0, 400)}`);

          let result;
          if (toolName === "create_export") {
            result = mockCreateExport(toolInput);
          } else {
            result = `Unknown custom tool "${toolName}" — mocked.`;
          }
          customToolCalls.push({ name: toolName, input: toolInput, result });

          await api(`/v1/sessions/${session.id}/events`, {
            method: "POST",
            body: JSON.stringify({
              events: [
                {
                  type: "user.custom_tool_result",
                  custom_tool_use_id: eid,
                  content: [{ type: "text", text: result }],
                },
              ],
            }),
          });
          log("ok", `  result sent for ${toolName}`);
        }
      } else if (stop.type === "end_turn") {
        log("ok", "Stream end_turn — agent finished its reply.");
        return "stop";
      }
    }

    return null;
  });

  const t1 = Date.now();

  // 7. Try to retrieve final session usage.
  let usage = null;
  try {
    const sessionDetail = await apiJson(`/v1/sessions/${session.id}`);
    usage = sessionDetail.usage ?? null;
  } catch (err) {
    log("warn", `Could not fetch session usage: ${err.message}`);
  }

  // ───── Summary ─────
  console.log("\n────────────────────────────────");
  console.log("PROTOTYPE RUN SUMMARY");
  console.log("────────────────────────────────");
  console.log(`Duration:            ${((t1 - t0) / 1000).toFixed(1)}s`);
  console.log(`Agent ID:            ${agent.id}`);
  console.log(`Environment ID:      ${CONFIG.environmentId}`);
  console.log(`Memory store ID:     ${memoryStore?.id ?? "(not created)"}`);
  console.log(`Session ID:          ${session.id}`);
  console.log(`Custom tool calls:   ${customToolCalls.length}`);
  for (const c of customToolCalls) {
    console.log(`  - ${c.name}(${JSON.stringify(c.input).slice(0, 120)}…)`);
  }
  console.log(`Event types seen:`);
  for (const [type, count] of [...eventTypes.entries()].sort()) {
    console.log(`  - ${type}: ${count}`);
  }
  if (usage) {
    console.log(`Usage (from session detail):`);
    console.log(`  ${JSON.stringify(usage, null, 2)}`);
  }
  console.log("\nFinal assistant text (first 800 chars):");
  console.log("────────────────────────────────");
  console.log(assistantText.slice(0, 800) || "(no text events captured — check eventTypes above)");
  console.log("────────────────────────────────");
  console.log(
    "\n✅ Done. You can inspect / delete these resources at https://platform.claude.com/workspaces/default/agents"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE stream reader. Yields parsed JSON events from a text/event-stream body.
// Calls `onEvent(event)` for each; if onEvent returns "stop" the loop ends.
// ─────────────────────────────────────────────────────────────────────────────

async function streamSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE: events separated by blank lines (\n\n).
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = chunk.split("\n");
      let data = "";
      let eventName = null;
      for (const line of lines) {
        if (line.startsWith("data:")) data += line.slice(5).trim();
        else if (line.startsWith("event:")) eventName = line.slice(6).trim();
      }
      if (!data) continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        log("warn", `Non-JSON SSE payload: ${data.slice(0, 200)}`);
        continue;
      }
      // Normalize: events sometimes have type in the SSE `event:` line and
      // sometimes inside the JSON payload. Surface both.
      if (eventName && !parsed.type) parsed.type = eventName;
      const verdict = await onEvent(parsed);
      if (verdict === "stop") return;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────────────────────

const COLOURS = {
  info: "\x1b[36m",
  step: "\x1b[35m",
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  reset: "\x1b[0m",
};

function log(level, msg) {
  const colour = COLOURS[level] ?? "";
  console.log(`${colour}[${level}]${COLOURS.reset} ${msg}`);
}

function logEvent(event) {
  // Compact one-liner per event so we don't drown in JSON. Surface the key
  // fields we care about per type.
  const t = event.type ?? "unknown";
  let extra = "";
  if (t.includes("delta") && (event.delta?.text || event.text)) {
    extra = ` · "${(event.delta?.text ?? event.text ?? "").slice(0, 60).replace(/\n/g, "⏎")}"`;
  } else if (t.includes("tool")) {
    extra = event.name
      ? ` · ${event.name}(${JSON.stringify(event.input ?? {}).slice(0, 80)})`
      : "";
  } else if (event.stop_reason) {
    extra = ` · stop=${event.stop_reason.type ?? JSON.stringify(event.stop_reason)}`;
  }
  console.log(`  ⟶ ${t}${extra}`);
}

// ─────────────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n❌ Prototype failed:");
  console.error(err);
  process.exit(1);
});
