# Managed Agents (rich mode) — architecture and operations

> **Status:** beta. Used by `/api/agent/chat-rich` for the "Rich mode" chat toggle. Default chat (`/api/agent/chat`) continues to use `messages.create` and is unaffected.

---

## Two runtimes, side by side

| Aspect | Quick mode (`/api/agent/chat`) | Rich mode (`/api/agent/chat-rich`) |
|---|---|---|
| Anthropic API | `messages.create` (stream) | Managed Agents (`/v1/sessions/{id}/events/stream`) |
| Streaming | Token-by-token (`text_delta`) | Block-level (`agent.message`) |
| Tool execution | Server-side loop in our route (`read_skill`, `create_export`) | Hosted environment (`bash`, `read`, `write`, `find`, `grep`, web search, …) + our custom tools as callbacks |
| Skills | Filesystem markdown injected as manifest | Uploaded to Anthropic workspace, mounted in env at `/workspace/skills/<name>/` and read by the agent itself |
| Memory | Stateless; profile re-passed per request | Memory store mounted at `/mnt/memory/` (write API not yet integrated; profile still passed inline) |
| Custom tool round-trip | Inside one streaming `messages.create` loop | SSE `session.status_idle` with `stop_reason: "requires_action"` → we POST `user.custom_tool_result` |
| Cost per turn (typical) | $0.01 – $0.05 | $0.05 – $0.30 (file-generating turns higher) |
| Latency | Sub-second to first token, 5-15s total | 30-180s typical (multi-step exploration + tool execution) |

## When users get rich mode

Off by default. The chat UI shows a **"Rich" toggle** next to the paperclip icon in the message composer. Clicking it switches subsequent messages to `/api/agent/chat-rich`. The toggle is per-message — users can flip it on for the question they want a file from, and back off for normal chat.

The assistant message stores `mode: "quick" | "rich"` so the UI can render a small badge and so the chat history replays with the right shape.

## What's wired up today

- **Accountancy agent only.** Managed Agent ID stored in `ANTHROPIC_AGENT_ID_ACCOUNTANCY` env var, environment ID in `ANTHROPIC_ENVIRONMENT_ID`. Operations and General agents fall back to a 503 with `code: "agent_not_provisioned"` until bootstrap is run for them too.
- **One custom skill uploaded** (`uk-vat-flat-rate`). The other 10 accountancy skills in `lib/anthropic/skills/accountancy/` are local-only; bring them into rich mode by uploading via the Anthropic console Skills tab and adding the skill IDs to `bootstrap-accountancy-agent.mjs`'s `customSkills` array, then re-running.
- **Four Anthropic built-in skills attached**: `xlsx`, `pdf`, `docx`, `pptx`. These include executable Python helpers the agent runs (e.g. `python3 /workspace/skills/xlsx/scripts/recalc.py`).
- **`create_export` custom tool** declared at agent creation. Agent calls it after saving a file to `/mnt/session/outputs/<filename>`; our route handles the callback via `lib/anthropic/exports.ts`.
- **Token usage tracked** via `client.beta.sessions.retrieve(id).usage` after end_turn, recorded the same as quick mode in `/users/{uid}/usage/{YYYY-MM}`.

## What's deferred

1. **Session output retrieval.** The agent generates its real `.xlsx` in the hosted environment at `/mnt/session/outputs/<filename>`. We don't yet have an API call to fetch those bytes back. Until then, `create_export` builds a placeholder PDF/file using the `summary`/`markdown` field on the tool input and serves *that* — useful as proof of concept, not as the real deliverable. Wire the session-output fetch next.
2. **Memory store writes.** Memory store created and attached per session, but we never write to it; profile still inlined into the user message. Find the memory-write API (or do a "seed" session that writes via bash) and migrate per-user profile in.
3. **Operations + General Managed Agents.** Bootstrap script supports only accountancy. Adding the other two is the same script duplicated with their own system prompts. Wait until accountancy is proven.
4. **Bulk skill upload automation.** Each remaining accountancy skill currently needs UI upload. When we cross ~5 unsynced skills, build a `sync-skills.mjs` script using the Skills API.
5. **True token-level streaming.** Managed Agents emits whole `agent.message` blocks, not character deltas. UX shows messages in paragraph-sized chunks instead of typewriter style. Acceptable for now; we could fake-stream client-side if it bothers users.

## Bootstrap procedure

1. Upload accountancy skills to the Anthropic Console Skills tab (one click per skill; existing markdown files at `lib/anthropic/skills/accountancy/*.md` work — wrap each into a folder with `SKILL.md` per the example at `skills-for-anthropic/uk-vat-flat-rate/`).
2. Note each skill ID. Add to `CONFIG.customSkills` in `scripts/anthropic/bootstrap-accountancy-agent.mjs`.
3. Run:
   ```powershell
   node scripts/anthropic/bootstrap-accountancy-agent.mjs
   ```
4. Copy the printed `ANTHROPIC_AGENT_ID_ACCOUNTANCY` and `ANTHROPIC_ENVIRONMENT_ID` into `.env.local` AND Vercel env.
5. Restart dev / redeploy.

Re-run the bootstrap whenever you change the agent's system prompt or add a skill that needs to be in the registered list. The script creates a fresh agent each time — old ones can be left orphaned or deleted in the console.

## Stream wire format mapping

Managed Agents events → Vercel data-stream format we already send to the chat client:

| Managed Agents event | Wire format | Purpose |
|---|---|---|
| `agent.message` (with text) | `0:"text"` (whole block as a delta) | Assistant text |
| `agent.thinking` | `2:[{type:"agent_thinking", text}]` | Timeline entry |
| `agent.tool_use` | `2:[{type:"agent_tool_use", name, input}]` | Timeline entry |
| `agent.tool_result` | `2:[{type:"agent_tool_done"}]` | Timeline entry |
| `agent.custom_tool_use` (create_export) | (handled silently; emits `2:[{type:"export", export}]` after our execution) | Download card |
| `session.status_idle` + `stop_reason: end_turn` | `e:{...}` + `d:{...}` finish | End of message |

Skill loads are detected by intercepting `read` tool calls with paths matching `/workspace/skills/<name>/SKILL.md` and accumulating into `skillsUsed[]` on the message doc, same field as quick mode.

## Failure modes and recovery

| Symptom | Cause | Recovery |
|---|---|---|
| `503 agent_not_provisioned` | `ANTHROPIC_AGENT_ID_<TYPE>` env var unset | Run bootstrap, paste env var, redeploy |
| `503 missing_env` | `ANTHROPIC_ENVIRONMENT_ID` unset | Same |
| Stream hangs >2 min, no events | Agent stuck exploring filesystem / loop | User cancels client-side. Add server-side idle timeout next. |
| `create_export` placeholder file rather than real bytes | Session output retrieval not wired (see Deferred #1) | Build the fetch step |
| Token usage shows zero | `session.retrieve` returned no `usage` block (rare) | Logged via `console.error`; chat already shipped |

## Cost discipline

Rich mode is materially more expensive than quick mode. Three things to keep in mind:

1. **The toggle is the user's cost guard.** They opt in per-message. Don't auto-route to rich without consent.
2. **Per-turn cap on Managed Agents tool iterations** is set by Anthropic — we don't control it directly. The bundled toolset will burn tokens exploring; tuning the system prompt to "answer directly when you have enough" is the main lever (already done in `ACCOUNTANCY_SYSTEM_PROMPT` baked into the bootstrap).
3. **Per-user monthly token budget already tracks both modes** — `recordTokenUsage` accumulates regardless of route. The `<UsageCard>` on the billing page reflects rich-mode costs naturally.

## Quick references

- Bootstrap script: `scripts/anthropic/bootstrap-accountancy-agent.mjs`
- Prototype script (read-only experiments): `scripts/anthropic/bootstrap-prototype.mjs`
- Production route: `app/api/agent/chat-rich/route.ts`
- Anthropic console: https://platform.claude.com/workspaces/default/agents
- Beta header in use: `managed-agents-2026-04-01`
