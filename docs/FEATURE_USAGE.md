# Feature reference (end-user perspective)

> **Audience:** prep material for the public-facing docs page. Reflects how each feature behaves *today*. Update when a feature changes — see the maintenance note at the bottom.

---

## Signing in

- Email + password is the only sign-in path that currently works. The "Sign in with Google" button on `/login` is present but the OAuth client is not configured.
- Reset password: `/reset-password`, sends a Firebase reset email.
- Sessions last 7 days via the `__session` httpOnly cookie. After that, sign in again.

## The dashboard home (`/dashboard`)

The landing page after sign-in. Shows:
- Quick stats (message count, active agents).
- Quick action cards (Open agents, Manage files, etc.).
- Activity feed — the most recent 5 events: messages sent, sessions started, files attached, agent activated, integrations connected, files uploaded.

There is currently no notification system — the activity feed is the only surfaced history.

## Agents (`/dashboard/agents`)

Three built-in agents:
- **Accountancy** — UK-aware. The deepest configured (3-step onboarding, focused system prompt, attached skill library).
- **Operations** — task triage, drafting, summarisation.
- **General** — flexible assistant for anything off-topic.

### Activate

Click **Activate** on a card. The agent moves to "Your active agents" and gets a doc at `/users/{uid}/agents/{type}` with `status: "active"`.

### Configure (per-user override)

Click **Settings** on an active agent → side sheet. You can:
- Rename the agent.
- Provide a `customSystemPrompt` that overrides the built-in one (advanced users only — the built-in prompts are tuned and skill-aware).

### First chat — onboarding wizard

First time you open an active agent, a wizard runs through that agent's profile schema (Accountancy has 3 steps; Operations has 2; General has 1). All answers are stored at `/users/{uid}/agents/{type}.profile` and injected as a structured block in every subsequent chat. **The agent will not ask for anything that's already in the profile.**

### Chat

- Real-time streamed responses.
- Sidebar shows the conversation history for that agent.
- Markdown rendering with code highlighting.
- Retry on transient errors.
- Per-message rate limit: 100 messages/month free, 1000 messages/month paid (or admin).
- Token usage is recorded against the user's monthly budget. See `docs/TOKEN_BILLING.md`.

### Web search

Agents can search the web when they need current information not in their training or skill library. Examples that will trigger a search:
- "What's the current HMRC interest rate on late payments?"
- "Look up Companies House for the registered office of [company]."
- "Has the VAT threshold changed for 2026/27?"

For UK tax and financial questions, the agents are nudged to prefer authoritative sources (gov.uk, HMRC, Companies House, ICAEW/ACCA) and to cite the source in their reply.

Limits:
- Up to 3 searches per turn.
- Search is executed by Anthropic and billed at roughly $10 per 1,000 searches *on top of* token costs.
- Results are biased to the model's general knowledge; for live API data (real-time bank rates, intraday market data) you still need a proper integration.
- Searches don't get past paywalled content.

### Downloadable deliverables (CSV / XLSX / PDF)

Agents can generate downloadable files mid-conversation via the `create_export` tool. Ask for a "report", "spreadsheet", "PDF", "downloadable file", "Excel export", etc. — or just ask for structured data (e.g. "give me Q1-Q4 VAT returns") and the agent will produce them as files automatically.

- **CSV** — for raw transaction lists and one-table data dumps.
- **XLSX** — for tax returns, financial statements, multi-column reports. Opens in Excel and imports cleanly into Google Sheets via File → Import.
- **PDF** — for narrative summaries and formal reports.

Download cards appear inline below the assistant's reply, with a click-to-download link. Each file is capped at 5 MB. Up to five files per turn.

Limits:
- Files generated this way live in the message itself (as data URLs) — re-opening the conversation re-renders the cards.
- Until Firebase Storage is enabled, exports are not stored separately in `/dashboard/files`. They live only in the chat that produced them.

### Attaching files to a message

The chat input has a file picker that opens a modal of your uploaded files. Tick the ones the agent should reference for the current question. The chat route extracts text server-side (PDF / XLSX / CSV / DOCX) and prepends it to the message.

- Per-attachment detach is available before sending.
- Files are not "remembered" between turns — re-attach them when needed in a follow-up. (Roadmap: sticky attachments at the session level.)

## Files (`/dashboard/files`)

Drag-and-drop or click-to-browse. Accepted formats: PDF, XLSX, XLS, CSV, DOCX, DOC. Per-file cap: 20 MB. Per-user cap: 500 MB total.

Per-file actions:
- **Download** — opens the stored file (disabled in dev bypass mode).
- **Replace** — pick a new file; the original filename, ID, and any chat references are preserved. The bytes are swapped in place.
- **Delete** — confirms via dialog. Permanent.

### Dev bypass

In environments with `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true`, files are *metadata only* — no bytes uploaded, no download URLs. The agent sees placeholder text instead of the real content. Disable this on real Vercel deploys once Firebase Storage is enabled (Blaze plan + one console click).

## Integrations (`/dashboard/integrations`)

OAuth provider cards for Gmail, Google Sheets, Google Drive, Slack, QuickBooks, Stripe Connect, Figma, Xero.

**Today all cards show "Coming soon"** because no provider credentials are set in env. Once an OAuth client is registered (`GOOGLE_CLIENT_ID`+`SECRET`, `SLACK_CLIENT_ID`+`SECRET`, etc.), the corresponding card flips to "Connect" automatically.

Connection flow when enabled:
1. Click Connect → redirect to provider consent.
2. Authorise → return to dashboard.
3. Access and refresh tokens are encrypted with AES-256-GCM and stored at `/users/{uid}/integration_tokens/{provider}`. Client-readable metadata is at `/users/{uid}/integrations/{provider}`. Tokens are never client-readable.

**Agent tool-use is not yet wired.** A connected integration today stores a token but no agent calls it. That's the next feature step.

## Billing (`/dashboard/billing`)

- Shows current plan status (Inactive / Pro / Admin).
- "Manage Billing" → Stripe Customer Portal (requires Customer Portal activation in Stripe's settings once per mode).
- Subscribe button on `/pricing` → Stripe Checkout → webhook flips `subscriptionStatus` to "active".

### Bypasses in effect

- `BYPASS_PAYMENT=true` (currently set on Vercel) — anyone who signs up gets paid-tier access. **Remove before charging real customers.**
- `ADMIN_EMAILS=kubilaykcolak@gmail.com` — that account skips the subscription check and gets the paid token budget.

## Settings (`/dashboard/settings`)

Three tabs:
- **Profile** — name, email, avatar (data URL in bypass mode).
- **Security** — change password (Firebase Auth), delete account (admin-side recursive delete of `/users/{uid}` and `auth.deleteUser`).
- **Notifications** — toggles for email updates, agent alerts, billing reminders. Stored in `/users/{uid}/preferences/notifications`. **No emails are actually being sent yet** — the toggles persist intent for a future notifications feature.

---

## Maintenance contract

This doc reflects user-visible behaviour. When you ship a non-trivial change to:
- a route or page
- a chat / file / integration interaction
- a billing or rate-limit behaviour
- a bypass flag

…update the matching section in this file in the same commit. Cheap signal that this needs updating: when explaining to a new user "how do I X?" and the existing wording doesn't quite match.
