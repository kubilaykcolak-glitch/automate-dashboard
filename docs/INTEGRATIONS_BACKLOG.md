# Integrations backlog

The OAuth framework is wired and the infrastructure is in place. To enable any
provider on a deploy, all that's needed is to register an OAuth app with the
provider, paste the credentials into env vars, and redeploy.

## Currently enabled
None. All 8 cards show "Coming soon" because no credentials are configured.

## Code is ready for:

### Slack (~10 min)
- Register at https://api.slack.com/apps → Create New App → From scratch
- OAuth & Permissions → add scopes: `channels:read`, `channels:history`, `chat:write`, `users:read`
- OAuth & Permissions → Redirect URLs → add `https://<domain>/api/integrations/slack/callback` for each environment
- Basic Information → copy Client ID + Client Secret
- Env vars: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

### Google Workspace (~15 min, covers Gmail / Drive / Sheets)
- console.cloud.google.com → enable Gmail API, Drive API, Sheets API
- APIs & Services → OAuth consent screen → External + add yourself as a test user
- APIs & Services → Credentials → OAuth client ID → Web application
- Redirect URI: `https://<domain>/api/integrations/google/callback` per environment
- Env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

## Code is NOT ready for (5 providers showing "Coming soon" indefinitely):
- QuickBooks (needs Intuit developer account approval)
- Stripe Connect (different from billing — needs Connect platform setup)
- Figma
- Xero (needs Xero developer account)

To wire any of these later: add a new entry in `lib/integrations/providers.ts`
matching the shape of the Slack/Google entries. The generic
`/api/integrations/[internalId]/{connect,callback,disconnect}` routes will
handle it automatically.

## Required for all of the above

- `ENCRYPTION_KEY` env var — 64 hex chars. Already generated locally, must be
  added to Vercel (same value) for tokens to round-trip between environments.

## What "the user needs to do"

A logged-in end user clicks Connect on a provider card → browser redirects to
that provider's consent screen → the user signs in with **their own** account →
grants permissions → the dashboard stores **their** token, scoped to their
user ID. Every user goes through this independently — your single OAuth app
registration enables all of them.
