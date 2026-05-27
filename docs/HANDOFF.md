# Handoff — pick up from here

> **You are Claude in a new chat session, working on this codebase. Read this file first, then `docs/SYSTEM_MAP.md`, then the user's request.**

---

## What this project is

`automate-dashboard` — a SaaS dashboard for small UK businesses (start with sole traders + small Ltds). Users activate AI agents (accountancy / operations / general assistant), onboard via a wizard that captures their business profile, and chat with the agent. Two chat runtimes share the same UI:

- **Quick mode** (default) — Anthropic `messages.create` with streaming. Cheap (~$0.01-0.05/turn), token-level streaming, has a skill library + custom tools.
- **Rich mode** (toggle in composer) — Anthropic Managed Agents with hosted environment, bash, Python, web search, the works. Pricier (~$0.10-0.50/turn), slower (30-180s), shows an agent-runs timeline in the chat.

Stack: Next.js 14 (App Router) · Firebase Auth + Firestore + Storage · Stripe · Anthropic (`claude-sonnet-4-6`) · shadcn/ui · pdfkit · xlsx · mammoth. Live on Vercel, source on GitHub.

User is **Kubilay** (`kubilaykcolak@gmail.com`). Solo developer, evening sessions, UK-based. Strong communicator — give him decision-forward responses with concrete code over abstract plans.

---

## Where things live

- **Project root:** `C:\Users\kubil\Desktop\AI AGENT SAAS\automate-dashboard`
- **GitHub:** `https://github.com/kubilaykcolak-glitch/automate-dashboard` (HTTPS push)
- **Vercel:** auto-deploys every push to `main`
- **Firebase admin service-account JSON** (DO NOT commit): `C:\Users\kubil\Desktop\AI AGENT SAAS\automation-dashboard-5cd7c-firebase-adminsdk-fbsvc-f656474563.json`
- **Firebase project:** `automation-dashboard-5cd7c` (region: `europe-west2`)
- **Anthropic workspace:** `Default` — accountancy agent `agent_01Y6yWRdvzhJFjPPkro8jDUw`, environment `env_0179oKijtUsLa84wXBRvSfdG`

---

## Read `docs/SYSTEM_MAP.md` next

It's the operating manual for the whole codebase — every route, env var, Firestore path, `lib/` module, the agent + skill + integration + billing flows, gotchas, and a "where do I add X?" lookup table. **Use it instead of re-exploring with Glob/Grep.**

Companion docs (each owns a slice; system map points at them):
- `docs/MANAGED_AGENTS.md` — Rich mode architecture, bootstrap, stream-format mapping
- `docs/TOKEN_BILLING.md` — Single-axis billing, pricing table, quarterly verification checklist
- `docs/FEATURE_USAGE.md` — End-user-facing behaviour for every feature
- `docs/FILE_RECOMMENDATIONS.md` — What files users should upload per agent
- `docs/SKILLS_AUTHORING.md` — How to write new skills
- `docs/INTEGRATIONS_BACKLOG.md` — OAuth registration checklist

Maintenance contract: ship a non-trivial change → update the relevant doc in the same commit.

---

## Current deployment state

### Env vars set on Vercel (and `.env.local`)

All Firebase (client + admin), all Stripe (secret + price + publishable + webhook), `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY` (64-hex AES-256-GCM for OAuth tokens), `ADMIN_EMAILS=kubilaykcolak@gmail.com`, `BYPASS_PAYMENT=true`, `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` (local).

**Managed Agents env vars** (live, set both locally and on Vercel):
- `ANTHROPIC_AGENT_ID_ACCOUNTANCY=agent_01Y6yWRdvzhJFjPPkro8jDUw`
- `ANTHROPIC_ENVIRONMENT_ID=env_0179oKijtUsLa84wXBRvSfdG`

**NOT yet set** — would unlock features when added:
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — flips Gmail/Sheets/Drive cards to Connect AND lets the agent's google_* tools actually work
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` — flips Slack card to Connect (no agent tool yet)

### Bypasses currently active

- `BYPASS_PAYMENT=true` on Vercel — anyone who signs up gets paid-tier access. **Kill before charging real customers.** This is the only "Critical" remaining audit item.
- `ADMIN_EMAILS` includes Kubilay's email — skips subscription check
- `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` locally — file uploads write metadata only

---

## What works end-to-end right now

1. **Signup → dashboard** (with `BYPASS_PAYMENT=true` everyone gets in).
2. **Activate an agent** at `/dashboard/agents`.
3. **Onboarding wizard** runs first time you open an active agent; profile injected as a cached system block on every turn.
4. **Quick mode chat** — token-streamed responses, sidebar shows sessions, markdown rendering, delete-session in sidebar, file attachments with truncation warning, retry on error.
5. **Skill library** (Quick mode) — 12 accountancy skills under `lib/anthropic/skills/accountancy/`. Manifest injected as 3rd cached system block; the agent calls `read_skill(name)` to load any body it wants. All 12 also uploaded to Anthropic's hosted Skills service for Rich-mode parity (see `skills-for-anthropic/skills.lock.json`).
6. **Rich mode chat** (toggle next to paperclip) — Managed Agents runtime, agent-runs timeline above each reply, real Python/bash, web search, the four Anthropic doc skills (xlsx/pdf/docx/pptx) + the 12 accountancy customs. Available for the accountancy agent only.
7. **`create_export` tool** — agent produces CSV/XLSX/PDF download cards inline in the chat. In Rich mode this currently returns a placeholder file built from the agent's `summary` text — see deferred items below.
8. **`web_search`** (Quick mode) — Anthropic's native server tool, capped at 3 searches/turn, biased to UK sources via the system prompt. Cost tracked separately ($10/1000 calls).
9. **Google integration tools** (Quick + Rich) — `google_drive_search`, `google_sheets_list_tabs`, `google_sheets_read`. Available when (a) `GOOGLE_CLIENT_*` env vars are set AND (b) the user has connected Google via `/dashboard/integrations`. Token refresh handled transparently in `lib/integrations/google.ts`.
10. **Token + USD cost tracking** — single-axis billing. Each plan grants a monthly token budget (500K free / 5M Pro); hitting it returns HTTP 429 with `code: "token_budget_exceeded"`. Per-minute rate limit (10 req/min) survives as an abuse guard. `<UsageCard>` on `/dashboard/billing` is the canonical surface.
11. **Stripe checkout** (test mode) — `/pricing` → Checkout → webhook flips `subscriptionStatus`. Webhook is now idempotent via the `/stripeEvents` collection.
12. **Files page** — drag-drop upload, Replace button (preserves filename + ID), AlertDialog-based delete.
13. **Settings** — profile editor, security (change password / delete account), notifications (toggles persist but no email-sending yet — clearly labeled "Coming soon").

---

## Audit status

A 31-finding audit was run this session. **28 of 31 closed.** Remaining:

| # | Item | Why deferred |
|---|---|---|
| #1 | Remove `BYPASS_PAYMENT=true` on Vercel | User action only — code is ready |
| #12 | Rich-mode `create_export` returns placeholder bytes, not the real file the agent saved to `/mnt/session/outputs/` | Needs Anthropic session-output retrieval API research |
| #29 | No structured logging (Sentry / Logflare / Better Stack) | Vendor choice |
| #33 | Operations + General agents have no Rich-mode bootstrap | Multi-step manual bootstrap; do when adding more agents anyway |

Everything else (security headers, rate limits, single-axis billing, dead code, length validation, abort handling, etc.) is shipped.

---

## What's stubbed / not built yet

- **File context with real bytes.** `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` means uploads are metadata-only locally. To enable real bytes: pay for Firebase Blaze plan, one-click in Firebase Console → Storage, set the env to false, run `node scripts/deploy-storage.mjs <sa.json>`.
- **OAuth integrations as a whole** — Google framework + tools are built, but Google OAuth client isn't registered yet, so cards still say "Coming soon (admin setup pending)". Same for Slack. The Roadmap-badged cards (QuickBooks, Stripe Connect, Xero, Figma) have no OAuth code at all.
- **Real Google sheets read from Rich mode** works *after* the new bootstrap is run (see Recent decisions below).
- **Email notifications** — toggles in Settings save preferences but no SendGrid/Resend wiring exists. Card explicitly labelled "Coming soon".
- **Token top-up for paid users** — the "Buy more tokens" CTA on the Usage card is currently a `mailto:support@automate-dashboard.example` placeholder. Replace with a real support email OR build Stripe metered overage.

---

## Recent decisions worth knowing (most recent first)

1. **Single-axis billing — tokens only.** Removed the legacy message-count gate and the rich-turn-count gate. Tokens are now the only billing primitive: 500K free / 5M Pro per month, hitting the budget returns 429. Per-minute rate limit (10/min) survives as an abuse guard separate from billing. See `docs/TOKEN_BILLING.md` and the recent `8f0828a` commit.
2. **Google integration tools live.** `lib/integrations/google.ts` handles the refresh dance; chat routes register three tools (`google_drive_search`, `google_sheets_list_tabs`, `google_sheets_read`) when the user has connected Google. **Quick mode picks them up automatically; Rich mode needs a fresh bootstrap** (see #6 below) before the Managed Agent definition knows about the tools. Audit #11.
3. **Token-recording moved into `finally` blocks** on both chat routes. Aborted or errored streams still bill the tokens Anthropic charged us for. Audit #16.
4. **Security hardening pass.** CSP + standard headers in `next.config.mjs` (X-Frame-Options=DENY, HSTS, Permissions-Policy, frame-ancestors=none, etc.). Length caps on `message` (10K) and `customSystemPrompt` (8K). 10 req/min rate limit. Webhook idempotency via `/stripeEvents` collection. Audit #18, #19, #20, #24.
5. **Dead code removed**: the never-called `runAgent()` helper, `RunAgentContext`/`RunAgentResult`/`AgentUsage`/`AgentErrorCode` types, the `/workspaces` Firestore rule, the unused `contextFiles` field and `buildUserContent()` helper, the unread `lastSessionId` on agent docs, the dead Automations Run dashboard tile. Audit #13, #20, #21, #22, #2.
6. **Bootstrap script update — re-run required.** `scripts/anthropic/bootstrap-accountancy-agent.mjs` now declares three Google tools (`google_drive_search`, `google_sheets_list_tabs`, `google_sheets_read`) alongside `create_export`. The existing Rich-mode agent (`agent_01Y6yWRdvzhJFjPPkro8jDUw`) was created BEFORE these were added, so Rich mode currently can't use them. To enable: `node scripts/anthropic/bootstrap-accountancy-agent.mjs` → grab the new agent ID → swap `ANTHROPIC_AGENT_ID_ACCOUNTANCY` in `.env.local` + Vercel → redeploy.
7. **All 12 accountancy skills synced** to Anthropic Skills API (`skills-for-anthropic/skills.lock.json` tracks IDs + content hashes). Iteration loop: edit `.md`, run `node scripts/anthropic/sync-skills.mjs`, done (idempotent — only changed skills upload). The bootstrap script's `customSkills` array already references all 12.
8. **Integration cards differentiate "credentials-pending" vs "roadmap"** so the user can tell the difference between "admin needs to set env vars" (Google, Slack — amber Coming soon badge) and "engineering work needed" (QuickBooks etc. — neutral Roadmap badge with hammer icon). Audit #10.
9. **Sessions list fixed**: Firestore composite index now declared in `firestore.indexes.json` (`(agentId asc, updatedAt desc)`). When the index is missing, the API returns 503 with `createIndexUrl` and the chat client opens the create page automatically. Delete-session button hover-revealed in the sidebar. Audit #13/now-tracked.
10. **`DEFAULT_EFFORT="high"`** in `lib/anthropic/agents.ts`. Switch to `"medium"` to halve cost on most prompts when traffic ramps.

---

## How to run dev / common commands

```powershell
cd "C:\Users\kubil\Desktop\AI AGENT SAAS\automate-dashboard"
npm run dev                                       # local dev server
npm run build                                     # production build check

# Skill iteration (after editing a .md file)
node scripts/anthropic/sync-skills.mjs            # idempotent — only uploads changed skills
node scripts/anthropic/sync-skills.mjs --dry-run  # preview without API calls

# Bootstrap Managed Agent (only when system prompt or tool surface changes)
node scripts/anthropic/bootstrap-accountancy-agent.mjs
# → copy printed ANTHROPIC_AGENT_ID_ACCOUNTANCY into .env.local + Vercel

# Firestore rules deploy
node scripts/deploy-firestore-rules.mjs "C:\Users\kubil\Desktop\AI AGENT SAAS\automation-dashboard-5cd7c-firebase-adminsdk-fbsvc-f656474563.json"

# Process locks (Windows specifically)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
```

---

## Build verification

`npm run build` should pass with zero TypeScript and zero ESLint errors. ~25 routes including `/dashboard/*`, all `/api/agent/*` (chat, chat-rich, sessions), `/api/integrations/*`, `/api/stripe/*`, `/api/auth/*`.

---

## Suggested first move for the new chat

1. Read `docs/SYSTEM_MAP.md`
2. Ask the user what they want to work on — they steer hard, no need to guess
3. If "where is X" comes up, grep `docs/SYSTEM_MAP.md`'s task-index table first
4. When you ship changes, update the relevant companion doc in the same commit

Good luck. The codebase is in solid shape — audit is essentially done, billing is single-axis and clear, the agent has real tools to read user data, and the docs are honest about what's working vs. what's roadmap.
