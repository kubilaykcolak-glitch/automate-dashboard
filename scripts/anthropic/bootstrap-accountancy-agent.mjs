#!/usr/bin/env node
/**
 * One-time bootstrap for the production accountancy Managed Agent.
 *
 *   node scripts/anthropic/bootstrap-accountancy-agent.mjs
 *
 * Creates a long-lived Managed Agent in your Anthropic workspace with:
 *   - The live accountancy system prompt (from lib/anthropic/agent-configs.ts)
 *   - Anthropic's xlsx, pptx, pdf, docx built-in skills
 *   - Your uploaded uk-vat-flat-rate custom skill
 *   - The bundled agent_toolset_20260401 (bash, read, write, find, grep, etc.)
 *   - A custom create_export tool definition so our SaaS owns file delivery
 *
 * After it prints the agent_id, add the following to .env.local AND Vercel:
 *
 *   ANTHROPIC_AGENT_ID_ACCOUNTANCY=agent_01...
 *   ANTHROPIC_ENVIRONMENT_ID=env_0179oKijtUsLa84wXBRvSfdG
 *
 * Re-run only when you need a fresh agent (e.g. system prompt changed in a
 * way that needs a clean cache). Otherwise treat the agent_id as durable.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// Config — values you can adjust per re-run
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  environmentId: "env_0179oKijtUsLa84wXBRvSfdG",
  customSkills: [
    { skill_id: "skill_01NL2jQZdKLFGZgSENShHQek", note: "uk-vat-flat-rate" },
    // Add more skill IDs here as you upload them to the Anthropic Console.
  ],
  betaHeader: "managed-agents-2026-04-01",
  apiBase: "https://api.anthropic.com",
  model: "claude-sonnet-4-6",
  agentName: "Accountancy Agent (production)",
};

// ─────────────────────────────────────────────────────────────────────────────
// .env.local loader (so the script runs without --env-file flag)
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
  console.error("❌ ANTHROPIC_API_KEY not set in .env.local or env.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — copied from lib/anthropic/agent-configs.ts ACCOUNTANCY_SYSTEM_PROMPT.
// Kept inline so re-running this script always reflects the latest live prompt.
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNTANCY_SYSTEM_PROMPT = `You are a senior UK accountant — twenty years' practice with small businesses and the self-employed. You write like a calm, practical advisor: confident on the rules you know, honest about what needs verification, and allergic to waffle.

# Who you are talking to
A small UK business owner. Their business profile is provided inline in the user message — treat it as ground truth. Never re-ask for anything that is already in the profile (VAT status, scheme, trading entity, year-end, software, UTR, etc.). Tailor every answer to that profile silently.

# What you do exceptionally well
- Categorising transactions accurately for UK tax (Office, Travel, Subsistence, Software, Marketing, Professional Fees, Equipment, Cost of Sales, Drawings, etc.) and splitting personal vs business where mixed.
- Applying HMRC's "wholly and exclusively" test to deductibility. Calling out partial deductions (use-of-home, mixed-use vehicles, entertainment, training) with the right split and the reason.
- Reading bank statements, invoices, receipts, CSV exports, P&Ls, and producing a clear summary: income vs expenses by category, net profit, VAT position (with the right scheme applied), items needing review.
- Flagging anomalies: duplicates, suspicious round numbers, unknown vendors, out-of-period dates, missing receipts on large items, balance discrepancies.

# How you handle every user message
1. **Reformulate.** Silently rewrite a vague question into the strongest version using the profile and any attached data.
2. **Use what you already have.** Profile and conversation are ground truth. Don't ask for what you've been given.
3. **Pick the right format.** Numbers go in markdown tables. Steps go in numbered lists. A single answer goes in one or two sentences. Default to brief; expand only when the answer genuinely needs it.
4. **Calibrate confidence.** State what you're sure of. For unknowns, name what would resolve it in ONE specific question.

# Skills available
You have access to skills mounted at /workspace/skills/. Use the read tool to load any whose name matches the user's question. Anthropic's xlsx/pdf/docx skills include executable scripts at /workspace/skills/{name}/scripts/ for generating documents — use them when the user asks for a file.

# Generating downloadable files for the user
When you produce a file the user should download:
1. Generate it using the appropriate built-in skill (xlsx for spreadsheets, pdf for PDFs, docx for Word).
2. Save it to /mnt/session/outputs/<filename>.
3. **Call the create_export custom tool** with the filename, format, and a short title so the file shows up as a download card in the chat. Do not paste the filepath into your reply.

# Verbatim source data in exports
When the user supplies source data, copy original text and figures into export rows EXACTLY as they appear. Do not paraphrase descriptions, vendor names, references, dates, or amounts. Put your analysis in additional columns rather than rewriting the source.

# Hard rules
- Never invent figures, rates, allowances, or filing dates. If unsure, say so.
- British English spelling. £ for currency, written with thousands separators (£12,450.00). DD/MM/YYYY dates. UK terminology.
- No preamble. No closing pad. Get to the answer.
- Match the user's register. If they write casually, answer casually.

# Disclaimer
Frame outputs as "materials for your accountant", not formal tax advice. Recommend a chartered accountant for anything that hits a filing.`;

// ─────────────────────────────────────────────────────────────────────────────
// API helper
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
    throw new Error(`HTTP ${res.status} ${res.statusText} on ${path}\n${body}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Creating production accountancy Managed Agent…\n");

  const body = {
    name: CONFIG.agentName,
    model: CONFIG.model,
    system: ACCOUNTANCY_SYSTEM_PROMPT,
    tools: [
      { type: "agent_toolset_20260401" },
      {
        type: "custom",
        name: "create_export",
        description:
          "Register a file the user can download from the chat. Call this AFTER you have generated and saved the file to /mnt/session/outputs/<filename>. The file appears inline as a download card. Use for CSV/XLSX/PDF deliverables the user explicitly asks for or that contain structured tabular data more useful as a file than inline text. Do not paste paths into your reply.",
        input_schema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["csv", "xlsx", "pdf"],
              description: "csv/xlsx for tabular, pdf for narrative.",
            },
            filename: {
              type: "string",
              description:
                "Filename WITH extension as saved under /mnt/session/outputs/, e.g. 'q1-vat-return.xlsx'.",
            },
            title: {
              type: "string",
              description:
                "Human-readable title shown on the download card, e.g. 'Q1 2025/26 VAT Return'.",
            },
            summary: {
              type: "string",
              description:
                "One-sentence description of the file contents shown on the card.",
            },
          },
          required: ["format", "filename"],
        },
      },
    ],
    skills: [
      ...CONFIG.customSkills.map((s) => ({
        type: "custom",
        skill_id: s.skill_id,
        version: "latest",
      })),
      { type: "anthropic", skill_id: "xlsx" },
      { type: "anthropic", skill_id: "pdf" },
      { type: "anthropic", skill_id: "docx" },
      { type: "anthropic", skill_id: "pptx" },
    ],
  };

  const agent = await api("/v1/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });

  console.log("✅ Agent created.\n");
  console.log("Agent ID:       ", agent.id);
  console.log("Version:        ", agent.version ?? "n/a");
  console.log("Model:          ", CONFIG.model);
  console.log("Environment:    ", CONFIG.environmentId);
  console.log("Custom skills:  ", CONFIG.customSkills.length);
  console.log("Anthropic skills:", 4, "(xlsx, pdf, docx, pptx)");
  console.log();
  console.log("──────────────────────────────────────────────────────────────");
  console.log("ADD THESE TO .env.local AND Vercel env vars:");
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`ANTHROPIC_AGENT_ID_ACCOUNTANCY=${agent.id}`);
  console.log(`ANTHROPIC_ENVIRONMENT_ID=${CONFIG.environmentId}`);
  console.log("──────────────────────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("\n❌ Bootstrap failed:");
  console.error(err);
  process.exit(1);
});
