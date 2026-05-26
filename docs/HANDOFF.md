# Handoff — pick up from here

> **You are Claude in a new chat session, working on this codebase. Read this file first, then `docs/SYSTEM_MAP.md`, then the user's request.**

---

## What this project is

`automate-dashboard` — a SaaS dashboard for small UK businesses (start with sole traders). Users activate AI agents (accountancy / operations / general assistant), onboard via a wizard that captures their business context (VAT registered, business type, etc.), and chat with the agent. The agent has the user's profile in its system prompt on every turn — so it's not generic, it's personalised from message one.

Stack: Next.js 14 (App Router), Firebase Auth + Firestore + Storage, Stripe billing, Anthropic Claude (`claude-sonnet-4-6`), shadcn/ui. Live on Vercel, source on GitHub.

The user is **Kubilay** (`kubilaykcolak@gmail.com`). He's the only developer. Solo project, evening sessions. UK-based.

---

## Where things live

- **Project root:** `C:\Users\kubil\Desktop\AI AGENT SAAS\automate-dashboard`
- **GitHub:** `https://github.com/kubilaykcolak-glitch/automate-dashboard` (HTTPS push; Git Credential Manager handles auth)
- **Vercel:** auto-deploys every push to `main`
- **Firebase admin service-account JSON** (DO NOT commit): `C:\Users\kubil\Desktop\AI AGENT SAAS\automation-dashboard-5cd7c-firebase-adminsdk-fbsvc-f656474563.json`
- **Firebase project:** `automation-dashboard-5cd7c` (region: `europe-west2`)

---

## Read `docs/SYSTEM_MAP.md` next

It's the operating-manual for the whole codebase: every URL route, API endpoint, env var, Firestore path, `lib/` module, agent/integration/Stripe flow, 10 gotchas, and a "where do I add X?" lookup table. **Use it instead of re-exploring with Glob/Grep.** Saves a lot of context.

Maintenance contract: when you ship a non-trivial change, update SYSTEM_MAP.md in the same commit. If you forget, the user may prompt with "and update SYSTEM_MAP".

---

## Current deployment state

### Env vars set on Vercel (and `.env.local`)

All Firebase (client + admin), all Stripe (secret + price + publishable + webhook), `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY` (64-hex AES-256-GCM key for OAuth tokens), `ADMIN_EMAILS=kubilaykcolak@gmail.com`, `BYPASS_PAYMENT=true`.

Storage bypass `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` is on locally — not sure if on Vercel. **Firebase Storage itself isn't enabled** on the project (would require Blaze plan), so uploads on a real Vercel deploy without bypass would fail.

### Bypasses currently active

- `BYPASS_PAYMENT=true` on Vercel — anyone who signs up gets dashboard access without paying. **Kill before charging real customers.**
- `ADMIN_EMAILS` includes Kubilay's email — skips subscription check + gets paid-tier rate limit (1000 messages/month)
- `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` locally — file uploads write metadata only, no actual bytes stored

### Integrations: framework built, none wired

The OAuth framework (encrypted token storage, state CSRF cookie, callback handler, provider registry) is complete and dormant. Slack + Google have code paths ready; need OAuth apps registered (~10 min each). See `docs/INTEGRATIONS_BACKLOG.md` for the register-and-go checklist. All 8 cards on `/dashboard/integrations` show "Coming soon" until env vars (`SLACK_CLIENT_ID`, `GOOGLE_CLIENT_ID`, etc.) are populated.

---

## What works end-to-end right now

1. **Signup → dashboard**. With `BYPASS_PAYMENT=true` Vercel users can sign up at `/signup` and land on `/dashboard` (no pricing wall).
2. **Activate an agent**. `/dashboard/agents` → click Activate on Accountancy / Operations / General → card flips to "Active".
3. **Onboarding wizard**. First time opening an active agent, the wizard runs. Accountancy has the deepest schema (3 steps: business basics + tax setup + data sources, with conditional VAT fields).
4. **Chat with streaming**. Real-time streamed responses from Claude via Anthropic API. Sidebar tracks conversation history. Markdown + code highlighting rendered. Typing indicator + retry on error.
5. **Profile injection**. The agent has the user's profile (e.g. "VAT registered: Yes, Flat-rate, GB123…") as a second cached system block on every turn.
6. **Rate limiting**. 100 messages/month free, 1000 paid (or admin). Activity feed on dashboard home shows real events.
7. **Stripe checkout** (test mode). Would work end-to-end once `STRIPE_WEBHOOK_SECRET` is set for production.
8. **Settings**. Profile editor (name/email/avatar via data URLs in bypass mode), security tab (change password, delete account with admin-side recursive cleanup), notifications preferences.

## What's stubbed / not built yet

- **File context with real bytes**. Bypass mode means uploaded "files" are metadata only; agents see placeholder text. To enable: pay for Firebase Blaze plan, run the "Get Started" click in Firebase Console Storage, set `NEXT_PUBLIC_DEV_BYPASS_STORAGE=false`, run `node scripts/deploy-storage.mjs <sa.json>`.
- **OAuth integrations**. Framework ready, providers backlogged. User explicitly deferred until they have real test URLs.
- **Agent tools**. Connecting Slack/Gmail stores a token but no agent calls the token — there's no tool-use loop yet. That's a future feature.
- **Google sign-in button**. UI exists on login page; OAuth client not registered with Google. Email/password is the only sign-in path that works.
- **Token refresh**. Stored expiresAt + refresh_token, no scheduled refresher.

---

## Recent decisions worth knowing (most recent first)

1. **`DEFAULT_EFFORT = "high"`** in `lib/anthropic/agents.ts`. Switch to `"medium"` later for ~half cost on most prompts. User explicitly wanted this as a one-line config switch.
2. **Model: `claude-sonnet-4-6`**. Migrated from retired `claude-sonnet-4-20250514`. Per the claude-api skill, current Sonnet ID.
3. **System map exists**. `docs/SYSTEM_MAP.md` — use it before re-exploring code.
4. **Boolean-required wizard fields use `[Yes][No]` segmented control**, not shadcn Switch. The Switch is from Base UI in this project and was unclear UX for required yes/no questions (no "not answered" state).
5. **The route group was renamed**. `app/(dashboard)/` → `app/dashboard/`. Route groups strip URL segments, which made `/dashboard/agents` 404. Do not re-introduce parens.
6. **Firebase client SDK exports are eager-initialized, not Proxy-wrapped**. The Proxy hack broke `collection(db, …)` instanceof checks. Admin SDK still uses Proxy because admin calls go through methods, not top-level functions.
7. **shadcn primitives in this project don't accept `asChild`** in TypeScript (custom build). Use direct rendering or styled `<a>` for what would be `<Button asChild>`.
8. **Two-doc model for integrations**: client-readable metadata at `/users/{uid}/integrations/{provider}`, encrypted tokens at `/users/{uid}/integration_tokens/{provider}` (Firestore rule denies all client access). Defense in depth.

---

## Security notes / cleanup TODOs

- **Anthropic API key was pasted in chat earlier in this conversation.** User should rotate it at console.anthropic.com when convenient. Not blocking anything right now.
- **`BYPASS_PAYMENT=true` is the single line between "test mode" and "anyone gets free access".** Kill it before going live.
- **`/api/debug/health` was removed** earlier — don't re-add unauthenticated diagnostic endpoints.
- **`.env.local` is gitignored** (`.env*.local`), Firebase admin JSON lives outside the repo. No secrets in git history that we know of.

---

## How to get the local dev server running

```powershell
cd "C:\Users\kubil\Desktop\AI AGENT SAAS\automate-dashboard"
npm run dev
```

Then open http://localhost:3000. Sign in with the Kubilay's email (admin allowlist). If env vars change, restart — Next.js doesn't hot-reload env.

If something locks the `.next` directory (happens on Windows during builds):

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
npm run dev
```

---

## Build verification

`npm run build` should pass with zero TypeScript and zero ESLint errors. If it doesn't, that's a regression to fix before continuing. The current build emits ~23 routes including all `/dashboard/*` pages, all `/api/agent/*`, all `/api/integrations/[internalId]/*`, all `/api/stripe/*`, and all `/api/auth/*`.

---

## Suggested first move for the new chat

1. Read `docs/SYSTEM_MAP.md`
2. Ask the user what they want to work on
3. If you're unsure where something lives, grep SYSTEM_MAP.md's "Common task → starting point index"
4. When you ship changes, update SYSTEM_MAP.md in the same commit

The user is a strong communicator and will tell you what they want directly. They appreciate concise, decision-forward responses with concrete code over abstract plans. They've explicitly said they don't want manual setup steps unless absolutely required.

Good luck. The codebase is in solid shape.
