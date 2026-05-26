# System map (AI reference)

> **For Claude, not humans.** Optimised for fast orientation when the user asks for changes. Keep it terse — file paths, env vars, data shapes, connection arrows. Update whenever you ship a non-trivial change.

---

## Stack

- **Next.js 14.2.35** (App Router, Node runtime where state is read/written)
- **Firebase**: Auth (email/password) + Firestore + Storage (currently bypassed)
- **Stripe**: Checkout + Customer Portal + webhook → flips `subscriptionStatus` in Firestore
- **Anthropic** `@anthropic-ai/sdk` v0.98 — model `claude-sonnet-4-6`, effort `high` (via `DEFAULT_EFFORT`)
- **shadcn/ui** + Tailwind 3 + lucide-react
- **react-markdown** + `rehype-highlight` for chat rendering
- **react-dropzone** for file uploads
- **pdf-parse v2** (`new PDFParse({data}).getText()`), `xlsx`, `mammoth` for file context extraction

## Repo

- GitHub: `git@github.com:kubilaykcolak-glitch/automate-dashboard.git` (via HTTPS for local push)
- Vercel: auto-deploys on push to `main`

---

## URL routes

| Route | File | Auth | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` | none | Redirects to `/dashboard` or `/login` based on session |
| `/login` | `app/(auth)/login/page.tsx` | redirects-if-signed-in (no, just lets you re-login) | Email/password + Google button (Google not configured) |
| `/signup` | `app/(auth)/signup/page.tsx` | none | Creates Firebase user + `/users/{uid}` doc with `subscriptionStatus: "none"` |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` | none | Sends Firebase reset email |
| `/pricing` | `app/pricing/page.tsx` | none | Subscribe button → POST `/api/stripe/create-checkout` |
| `/dashboard` | `app/dashboard/page.tsx` | session + (subscriptionStatus="active" OR admin OR bypass) | Home: stats, quick actions, activity feed |
| `/dashboard/agents` | `app/dashboard/agents/page.tsx` | ditto | Active + Available agent cards; activate/edit-settings |
| `/dashboard/agents/[agentId]` | `app/dashboard/agents/[agentId]/page.tsx` | ditto | Chat UI; wizard when no profile yet |
| `/dashboard/integrations` | `app/dashboard/integrations/page.tsx` | ditto | OAuth provider cards; status-aware |
| `/dashboard/files` | `app/dashboard/files/page.tsx` | ditto | Drag-drop upload + file table |
| `/dashboard/billing` | `app/dashboard/billing/page.tsx` | ditto | Plan status + Manage Billing button |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | ditto | Tabs: Profile / Security / Notifications |

**Dashboard route group:** lives at literal `app/dashboard/`, NOT `app/(dashboard)/`. Renamed because route groups strip the URL segment — old version made `/dashboard/agents` 404. **Do not re-introduce `(dashboard)`.**

## API routes (all under `app/api/`)

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/session` | POST | none | Body: `{idToken}` → mints `__session` cookie (7d, httpOnly) |
| `/api/auth/logout` | POST | none | Clears cookie, redirects 303 → `/login` |
| `/api/auth/delete-account` | POST | session | Admin SDK `recursiveDelete` of `/users/{uid}` + `deleteUser` |
| `/api/stripe/create-checkout` | POST | session | Returns `{url}` of Stripe Checkout for `STRIPE_PRICE_ID` |
| `/api/stripe/create-portal` | POST | session | Returns Customer Portal URL (needs `stripeCustomerId`) |
| `/api/stripe/webhook` | POST | Stripe signature | Handles `checkout.session.completed` / `subscription.updated|deleted` → writes Firestore |
| `/api/agent/chat` | POST | session + rate limit | Streams Anthropic response in Vercel AI SDK data-stream format |
| `/api/agent/sessions` | GET | session | `?agentId=...` → list of sessions ordered by updatedAt desc |
| `/api/agent/sessions/[sessionId]` | GET, DELETE | session | Get messages / recursive delete |
| `/api/integrations/[internalId]/connect` | GET | session | Generates state cookie, redirects to provider auth URL |
| `/api/integrations/[internalId]/callback` | GET | session | Validates state, exchanges code for tokens, encrypts and stores |
| `/api/integrations/[internalId]/disconnect` | POST | session | Calls provider revoke, clears stored tokens |
| `/api/integrations/status` | GET | none | Returns `{status: {gmail: true, slack: false, …}}` — drives client UI |

---

## Env vars

### Required (production)

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY     (with literal \n escapes)
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET          (whsec_ from dashboard for prod, CLI for dev)
ANTHROPIC_API_KEY
ENCRYPTION_KEY                 (64 hex chars; AES-256-GCM for OAuth tokens)
```

### Optional OAuth (per integration; absence → card shows "Coming soon")

```
SLACK_CLIENT_ID / SLACK_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
```

### Access control / dev escape hatches

```
ADMIN_EMAILS=foo@bar.com,baz@x.com   bypass subscription + paid-tier limits; works in prod
BYPASS_PAYMENT=true                  bypass subscription wall for everyone; works in prod (kill before charging)
DEV_BYPASS_SUBSCRIPTION=true         dev-only (NODE_ENV check); same effect as BYPASS_PAYMENT
NEXT_PUBLIC_DEV_BYPASS_STORAGE=true  skips Firebase Storage; uploads write metadata only
```

The Firebase Admin service-account JSON lives **outside** the repo at `C:\Users\kubil\Desktop\AI AGENT SAAS\automation-dashboard-5cd7c-firebase-adminsdk-fbsvc-f656474563.json`. Used by setup scripts in `scripts/`.

---

## Firestore data model

All paths rooted at `/users/{uid}/`. See `firestore.rules` for the deployed rules; an integration_tokens carve-out denies all client access.

| Path | Shape | Written by |
|---|---|---|
| `/users/{uid}` | `UserProfile` (`uid, email, fullName, avatarUrl, stripeCustomerId, stripeSubscriptionId, subscriptionStatus, createdAt`) + `automationsRunCount?`, `messageCount?`, `lastMessageAt?` | Signup page (client), Stripe webhook (admin), settings page |
| `/users/{uid}/usage/{YYYY-MM}` | `{count, updatedAt, month}` | `incrementMonthlyUsage()` (admin) called by chat route on success |
| `/users/{uid}/agents/{type}` | `Agent` (`id="type", name, type, status, description, connectedTools, createdAt, messageCount, lastMessageAt, customSystemPrompt, profile`) | `activateAgentFromConfig`, `updateAgentStatus`, `updateAgentSettings`, `updateAgentProfile` (all client) + chat route increments counters |
| `/users/{uid}/agentSessions/{sessionId}` | `{agentId, status, createdAt, updatedAt, lastMessageAt, lastSessionId, lastMessagePreview}` | Chat route (admin) |
| `/users/{uid}/agentSessions/{sid}/messages/{msgId}` | `{role, content, createdAt, stopReason?, usage?}` | Chat route batched commit |
| `/users/{uid}/integrations/{providerInternalId}` | `Integration` (`id, provider, status, connectedAt, scopes, accountLabel?`) — **client-readable, no tokens** | `connectIntegration`/`disconnectIntegration` (client) + OAuth callback (admin) |
| `/users/{uid}/integration_tokens/{providerInternalId}` | `{accessTokenCiphertext, refreshTokenCiphertext, expiresAt, updatedAt}` — **denied to client** | `saveIntegration` (admin) |
| `/users/{uid}/files/{filenameEncoded}` | `StoredFile` (`id, name, size, type, storagePath, downloadUrl, createdAt`) | `uploadFile` (client) |
| `/users/{uid}/activity/{auto}` | `{type, message, metadata?, createdAt}` | `logActivity` + `addActivityToBatch` (admin) |
| `/users/{uid}/preferences/notifications` | `{emailUpdates, agentAlerts, billingReminders, updatedAt}` | Settings page (client) |

**Composite indexes needed** (auto-prompted on first query):
- `agentSessions`: `(agentId, updatedAt desc)`

## Storage paths

- `users/{uid}/files/{filename}` — user uploads (currently bypassed; metadata-only writes)
- `users/{uid}/avatar` — profile picture (also bypassed)

---

## `lib/` modules

### `lib/firebase/`

| File | Exports | Notes |
|---|---|---|
| `client.ts` | `auth`, `db`, `storage`, `getFirebaseApp()` | **Eager init**, not Proxy — Proxy breaks `collection(db, …)` instanceof checks. Module-load if envs unset just logs error. |
| `admin.ts` | `adminAuth`, `adminDb`, `getFirebaseAdminApp()` | Lazy Proxy; reads `FIREBASE_ADMIN_*`; unescapes `\n` in private key; sets `storageBucket` |
| `session.ts` | `SESSION_COOKIE_NAME`, `SESSION_MAX_AGE_SECONDS`, `getSessionUser()`, `requireSessionUser()` | Verifies via `adminAuth.verifySessionCookie(cookie, true)` |
| `auth.ts` | `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `signOut`, `sendResetEmail`, `onAuthStateChange` | Every sign-in path also POSTs ID token to `/api/auth/session` |
| `agents.ts` | `getAgents`, `subscribeAgents`, `updateAgentStatus`, `activateAgentFromConfig`, `seedDefaultAgents`, `updateAgentSettings`, `updateAgentProfile` | Doc ID = agent type slug (`accountancy`/`operations`/`general`) |
| `agent-sessions.ts` | `getSessions`, `getMessages`, `deleteSession` (client SDK; paginated batch-delete for messages) | |
| `integrations.ts` | `subscribeIntegrations`, `connectIntegration`, `disconnectIntegration` | Client-readable metadata only |
| `storage.ts` | `uploadFile`, `subscribeFiles`, `deleteFile`, `getDownloadUrl`, `uploadAvatar`, `BYPASS_STORAGE`, `STORAGE_LIMIT_BYTES` | Bypass mode: returns data URLs for avatars, skips Storage for files |
| `usage.ts` | `currentMonthKey()`, `getMonthlyUsage()`, `incrementMonthlyUsage()`, `FREE_PLAN_MONTHLY_LIMIT=100`, `PAID_PLAN_MONTHLY_LIMIT=1000` | Server-only. `resolvePlan()` also checks `ADMIN_EMAILS` → paid |
| `activity.ts` | `logActivity()`, `addActivityToBatch()` | Best-effort; never throws |

### `lib/anthropic/`

| File | Exports | Notes |
|---|---|---|
| `client.ts` | `anthropic`, `getAnthropic()` | Lazy Proxy; throws if `ANTHROPIC_API_KEY` unset |
| `agents.ts` | `runAgent()`, `DEFAULT_MODEL="claude-sonnet-4-6"`, `DEFAULT_MAX_TOKENS=2000`, `DEFAULT_EFFORT="high"` | Non-streaming helper; chat route calls `anthropic.messages.create({stream:true})` directly |
| `types.ts` | `AgentMessage`, `AgentSession`, `AgentConfig` (+ `profileSchema?`), `ProfileField`, `ProfileStep`, `AgentProfileSchema`, `AgentProfile`, `RunAgentContext`, `RunAgentResult`, `AgentUsage`, `AgentErrorCode` | Isomorphic (no server-only) so wizard can import |
| `agent-configs.ts` | `AGENT_CONFIGS`, `getAgentConfig(type)`, `listAgentConfigs()` + per-agent system prompts | 3 built-ins: accountancy/operations/general. Each has `profileSchema` with wizard fields |
| `context.ts` | `extractTextFromFile()`, `buildContextString()`, `attachContextToMessages()`, `MAX_CONTEXT_CHARS_PER_FILE=50000` | Uses admin storage; dispatches by MIME/ext to pdf-parse v2 / xlsx / mammoth / utf8 |

### `lib/integrations/`

| File | Exports | Notes |
|---|---|---|
| `crypto.ts` | `encrypt()`, `decrypt()` | AES-256-GCM; key from `ENCRYPTION_KEY` (64 hex chars) |
| `oauth.ts` | `generateState()`, `buildAuthUrl()`, `exchangeCodeForTokens()`, `revokeToken()`, `callbackUrl()`, `STATE_COOKIE_NAME="oauth_state"` | State cookie expires 10min |
| `providers.ts` | `PROVIDER_CARDS`, `getProviderByInternalId()`, `getProviderByCardId()`, `getEnabledInternalIds()` | UI catalog with `internalId` mapping. Gmail/Sheets/Drive all map to `internalId: "google"` (one OAuth grant, multiple scopes) |
| `store.ts` | `saveIntegration()`, `loadTokens()`, `clearIntegration()` | Writes metadata + token to separate Firestore paths |

### `lib/`

| File | Exports |
|---|---|
| `stripe.ts` | `stripe`, `getStripe()` — lazy Proxy, throws if `STRIPE_SECRET_KEY` unset |
| `utils.ts` | `cn()` (shadcn classname merger) |

---

## Auth flow

1. `/signup` or `/login` → Firebase client SDK signin → `signInWith…` in `lib/firebase/auth.ts`
2. After signin → `getIdToken(true)` → POST `/api/auth/session` with `{idToken}`
3. `/api/auth/session` → `adminAuth.createSessionCookie(idToken, {expiresIn: 7d})` → sets `__session` httpOnly cookie
4. Middleware (`middleware.ts`, matcher `/dashboard/:path*`): checks cookie presence only (Edge runtime can't run admin SDK)
5. Server components (`/dashboard/layout.tsx` etc.): use `getSessionUser()` for real `verifySessionCookie()`
6. `/api/auth/logout` (303 → `/login`) clears cookie

### Subscription gate (in `app/dashboard/layout.tsx`)

```
bypass = devBypass || prodBypass || isAdmin
if (!bypass && subscriptionStatus !== "active") redirect("/pricing")
```

- `isAdmin` = session.email in `ADMIN_EMAILS.split(",")` (case-insensitive)
- `plan` passed to DashboardShell: `"Admin" | "Pro" | "Inactive"`

---

## Agent system

### High level

```
AgentConfig (in code)  ──seed──▶  /users/{uid}/agents/{type}  ──open──▶  Chat UI
   ^ system prompt                  ^ user-editable name +              ^ wizard if no profile
   ^ profileSchema                    customSystemPrompt + profile      ^ chat → /api/agent/chat
   ^ starterPrompts                                                     ^ sidebar lists sessions
```

### Activate flow

`/dashboard/agents` → click Activate → `activateAgentFromConfig(uid, type)` → Firestore doc created with `status:"active"` → card moves to "Your active agents" → button label flips to "Set up" if no profile yet, else "Open".

### First chat (with onboarding)

1. Open `/dashboard/agents/accountancy`
2. Page loads agent doc + matches `AgentConfig.profileSchema`
3. If `agent.profile === null`, render `<AgentOnboardingWizard>` instead of chat
4. Wizard steps through `profileSchema.steps[*]` fields with conditional `showIf` logic
5. On save → `updateAgentProfile(uid, agentId, profile)` writes to `/users/{uid}/agents/{type}.profile`
6. Live subscription updates `agentMeta`, wizard unmounts, chat mounts

### Chat → response cycle

1. User types in textarea → POST `/api/agent/chat` with `{agentId, message, sessionId?, contextFileIds?}`
2. Route checks: API key present (503), session (401), rate limit (429: 100 free / 1000 paid+admin)
3. Loads agent doc → resolves `effectiveSystemPrompt` (customSystemPrompt OR config.systemPrompt)
4. Builds `formatProfileBlock()` from `agent.profile` + `config.profileSchema`
5. Resolves session: existing or new (`sessionId` returned in `x-session-id` header)
6. Loads `messages` subcollection ordered by createdAt asc
7. If `contextFileIds` provided: fetches `/users/{uid}/files/{id}` docs, calls `buildContextString()` to extract text via `extractTextFromFile()`, then `attachContextToMessages()` prepends `[user: context]` + `[assistant: ack]` pair
8. Calls `anthropic.messages.create({stream: true})` with:
   - `model: DEFAULT_MODEL` (sonnet-4-6)
   - `max_tokens: DEFAULT_MAX_TOKENS` (2000)
   - `output_config: { effort: DEFAULT_EFFORT }` (high)
   - `system: [{text: effectiveSystemPrompt, cache_control: ephemeral}, {text: profileBlock, cache_control: ephemeral}?]`
   - `messages: [...history, contextInjection?, userMessage]`
9. Streams events: encodes `content_block_delta.text_delta` → `0:"text"\n`, finishes with `e:{...}\n` + `d:{...}\n`
10. After stream completes (still inside controller.start callback): batched Firestore write of user msg + assistant msg + session metadata + `agent.messageCount += 2` + activity log
11. `incrementMonthlyUsage()` fires non-blocking

### Available context the agent has

- System prompt (`customSystemPrompt` overrides `config.systemPrompt`)
- Profile block ("# About this user" + key:value list) — second cached system block
- Conversation history (this session)
- Context files (extracted text, prepended as user+assistant pair)

---

## Integration system

### Two-doc storage model

- `/users/{uid}/integrations/{internalId}` — client-readable: status, scopes, connectedAt, accountLabel
- `/users/{uid}/integration_tokens/{internalId}` — server-only (Firestore rule `allow read, write: if false`): encrypted access_token, refresh_token, expiresAt

### Provider IDs

- **Card IDs** (user-facing): gmail, google-sheets, google-drive, slack, quickbooks, stripe, figma, xero
- **Internal IDs** (storage path): google, slack, quickbooks, stripe-connect, figma, xero
  - Gmail/Sheets/Drive all map to internal `google` — one OAuth grant covers all three scopes

### OAuth flow

1. User clicks Connect on card X → browser navigates to `/api/integrations/{internalId}/connect?card=X`
2. Route: validates provider config has OAuth creds (else 404), generates random state token, stores `{state, uid, internalId, cardId, returnTo, createdAt}` in httpOnly `oauth_state` cookie (10min TTL), redirects to provider authUrl
3. Provider consent screen → user authorizes → redirects to `/api/integrations/{internalId}/callback?code=…&state=…`
4. Callback validates: state matches cookie, uid matches session, not expired
5. POSTs to provider's tokenUrl with code + client_id + client_secret → receives access_token + refresh_token
6. For Google: fetches userinfo to get email as accountLabel; for Slack: uses team.name
7. `saveIntegration()` writes encrypted tokens to integration_tokens + metadata to integrations
8. Logs activity, clears state cookie, redirects to `/dashboard/integrations?connected=ProviderName`

### Status endpoint

`/api/integrations/status` returns `{status: {cardId: boolean}}` based on which providers have client_id+client_secret env vars set. Client uses this to render "Coming soon" badges and disable buttons for unconfigured providers.

### What's wired up

- Framework: complete (encryption + state CSRF + token storage + refresh-ready)
- Providers: code ready for **Slack** + **Google** (Gmail/Sheets/Drive). All others show "Coming soon" until env vars + OAuth app registration.
- See `docs/INTEGRATIONS_BACKLOG.md` for the register-and-go checklist.

### Not yet built

- Token refresh on access (refresh_token + expiresAt are stored; no scheduled refresher yet — agent tools would call this when they actually use a token)
- Any agent tool that actually uses an integration token

---

## Stripe flow

1. `/pricing` → click Subscribe → POST `/api/stripe/create-checkout` → returns Checkout URL
2. Browser → Stripe-hosted checkout → user pays with test card 4242…
3. Stripe redirects to `/dashboard?checkout=success` (and concurrently POSTs `/api/stripe/webhook`)
4. Webhook (raw body, signature verified via `stripe.webhooks.constructEvent`):
   - `checkout.session.completed` → resolves uid (from `client_reference_id` OR `metadata.firebaseUid`) → writes `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus` to `/users/{uid}`
   - `customer.subscription.updated|deleted` → updates `subscriptionStatus`
5. Next page load: dashboard layout reads new status, lets user in
6. **Race window**: after success redirect, before webhook lands, dashboard layout may still see `subscriptionStatus: "none"` and bounce to `/pricing`. Refresh after ~1s.

### Customer Portal

- Stripe → Settings → Customer Portal must be activated once (per test/live mode) before `/api/stripe/create-portal` works
- Billing page button POSTs there → returns portal URL → browser navigates

---

## Rate limiting

- Counter: `/users/{uid}/usage/{YYYY-MM}.count` (atomic `FieldValue.increment`)
- Limits: 100/mo free, 1000/mo paid (or `ADMIN_EMAILS`)
- Check: chat route at start, returns 429 with `{error, code: "rate_limited", usage}`
- Plan resolution in `usage.ts`: subscriptionStatus active|trialing OR email in ADMIN_EMAILS → paid

---

## Activity feed

- All writes from server-side via `logActivity()` (one-off, best-effort) or `addActivityToBatch()` (atomic with other writes)
- Types: `message_sent`, `session_started`, `files_attached`, `agent_activated`, `integration_connected`, `file_uploaded`
- Dashboard home fetches last 5 from `/users/{uid}/activity orderBy createdAt desc limit 5`

---

## Setup / deploy scripts

`scripts/`:

- `fetch-firebase-config.mjs <sa.json>` — Firebase Management API → prints `NEXT_PUBLIC_FIREBASE_*` for `.env.local`
- `setup-firebase.mjs <sa.json>` — enables email/password auth, sets authorized domains, confirms Firestore is up
- `deploy-firestore-rules.mjs <sa.json>` — pushes `firestore.rules` via firebaserules API
- `deploy-storage.mjs <sa.json>` — enables Storage API, links bucket to Firebase, pushes `storage.rules`. **Requires user to first enable API via console (firebasestorage.googleapis.com).**

Each one uses the Firebase service account JSON in the parent directory to mint a Google OAuth token and call the relevant Google API directly. No `firebase-tools` dependency.

---

## Known gotchas

1. **Route group `(dashboard)` was removed.** Real folder `app/dashboard/`. Do not put pages back inside parens — URL segment is stripped and routes 404.
2. **Firebase client SDK Proxy hack was removed.** `db`, `auth`, `storage` are eager-initialized real instances. Proxies broke `collection(db, …)` instanceof checks. The admin SDK proxy is fine because admin calls go through methods (`adminDb.collection("x")`), not top-level functions.
3. **Storage is bypassed.** `NEXT_PUBLIC_DEV_BYPASS_STORAGE=true` is set. File uploads write metadata only. Avatars use data URLs. Re-enable: paid Firebase plan + one-click console action + remove env flag.
4. **Stripe webhook secret needed.** Without `STRIPE_WEBHOOK_SECRET`, subscriptions never flip to active → user stuck on /pricing. Use Stripe CLI for local: `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a `whsec_…`.
5. **`BYPASS_PAYMENT=true`** is set on Vercel. Anyone who signs up gets dashboard access. Kill before charging real customers.
6. **`ADMIN_EMAILS=kubilaykcolak@gmail.com`** also bypasses subscription AND gets 1000 messages/month (paid limit). Same email used as support email in agent empty states.
7. **Anthropic model:** `claude-sonnet-4-6` with `effort: "high"`. Change `DEFAULT_EFFORT` in `lib/anthropic/agents.ts` to `"medium"` to ~halve cost when traffic ramps.
8. **`pdf-parse` is v2**, not v1. API: `new PDFParse({data: buffer}).getText()`. Not `pdf(buffer)`.
9. **shadcn Sheet/Tooltip/Button** in this project don't expose `asChild` in their TS types (custom build). Use direct rendering or styled `<a>` tags instead of `<Button asChild>`.
10. **Switches don't support null state**, so the wizard renders required booleans (VAT registered) as a `[Yes][No]` segmented control, not the shadcn Switch.

---

## Common task → starting point index

| If user asks to… | Start here |
|---|---|
| Add a new agent type | `lib/anthropic/agent-configs.ts` (add to `AGENT_CONFIGS`); profile schema + system prompt + starter prompts |
| Change an agent's system prompt | `lib/anthropic/agent-configs.ts` (or, for per-user overrides, `agent.customSystemPrompt` via settings sheet on `/dashboard/agents`) |
| Add a profile field to onboarding | `lib/anthropic/agent-configs.ts` → that agent's `profileSchema.steps[].fields[]`. Field types in `lib/anthropic/types.ts` (`ProfileFieldType`) |
| Add a new integration provider | `lib/integrations/providers.ts` (add to `PROVIDER_CARDS` with `oauth` config); env vars `<NAME>_CLIENT_ID` + `<NAME>_CLIENT_SECRET`. Generic API routes already handle it. See `docs/INTEGRATIONS_BACKLOG.md` |
| Add a tool the agent can call | Doesn't exist yet — would need a tool-use loop layer on top of `lib/anthropic/agents.ts` `runAgent()`. Anthropic SDK supports it via `tools` param + tool runner |
| Change rate limits | `lib/firebase/usage.ts` (`FREE_PLAN_MONTHLY_LIMIT`, `PAID_PLAN_MONTHLY_LIMIT`) |
| Change subscription gate behavior | `app/dashboard/layout.tsx` — has bypass logic |
| Add a new env-based bypass flag | Mirror the `BYPASS_PAYMENT` pattern in `app/dashboard/layout.tsx` |
| Add a settings field | `app/dashboard/settings/page.tsx` — three tabs. For agent settings sheet: `app/dashboard/agents/page.tsx` |
| Add a chat sidebar item | `app/dashboard/agents/[agentId]/page.tsx` → `SidebarBody` |
| Change which providers show as "Coming soon" | `lib/integrations/providers.ts` `enabled` is derived from env var presence. Client reads `/api/integrations/status`. |
| Tune Anthropic effort/cost | `lib/anthropic/agents.ts` `DEFAULT_EFFORT` constant |
| Wire up real OAuth for an integration | (1) Register OAuth app at provider, (2) add `CLIENT_ID`/`CLIENT_SECRET` to env, (3) register callback URL `https://<domain>/api/integrations/{internalId}/callback`. Code already handles the rest. |
| Add a new Firestore field to user profile | Update `UserProfile` in `types/database.ts`, the signup page in `app/(auth)/signup/page.tsx`, the settings page if user-editable |
| Run something on every chat turn | Add to chat route `app/api/agent/chat/route.ts` — there's already activity log + usage increment + Firestore batch commit |

---

## Maintenance

When making non-trivial changes, update this file in the same commit:
- New route → routes table
- New env var → env vars section
- New `lib/` file → modules section
- New Firestore path → data model table
- New common workflow → task index table
- New gotcha learned the hard way → gotchas section

**Cheap signal that this needs updating: when re-exploring the codebase to answer "where is X?", that's the moment to write it down.**
