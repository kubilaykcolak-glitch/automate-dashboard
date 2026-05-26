/**
 * Registry of supported OAuth providers. Each entry knows enough to drive the
 * generic OAuth flow in /api/integrations/[provider]/{connect,callback,disconnect}.
 *
 * UI display info lives separately in lib/integrations/ui.ts so that the
 * provider list shown on /dashboard/integrations can stay decoupled from the
 * server-side flow (e.g., showing 'Coming soon' for providers we haven't wired).
 */

/**
 * Lifecycle phase of an integration card. Drives the UI badge + CTA:
 *  - 'available'           — OAuth code wired + credentials present in env;
 *                            user can click Connect.
 *  - 'credentials-pending' — OAuth code wired, env vars absent. Admin can
 *                            enable in minutes by setting the right env vars.
 *  - 'roadmap'             — No OAuth code yet. Genuine engineering work
 *                            required before this becomes available.
 *
 * Used to surface honest copy on /dashboard/integrations so the user can
 * tell what's truly coming soon vs what's only blocked on configuration.
 */
export type ProviderPhase = "available" | "credentials-pending" | "roadmap";

export interface ProviderConfig {
  id: string;
  /** Internal canonical ID used in storage paths. Several UI cards can map to
   *  the same internal ID (e.g. Gmail/Sheets/Drive all use the 'google' OAuth flow). */
  internalId: string;
  name: string;
  description: string;
  /** Tailwind class for the avatar background colour. */
  color: string;
  /**
   * True when OAuth credentials are available right now. False otherwise —
   * could be either `credentials-pending` or `roadmap` (use `phase` to tell).
   */
  enabled: boolean;
  /** See ProviderPhase. */
  phase: ProviderPhase;
  /** Server-side: missing if `enabled` is false. */
  oauth?: OAuthEndpoints;
}

export interface OAuthEndpoints {
  authUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  /** Extra params to append to the auth URL (e.g. Google's access_type=offline). */
  extraAuthParams?: Record<string, string>;
  /** Optional URL to fetch user info after token exchange. */
  userInfoUrl?: string;
}

function slackConfig(): OAuthEndpoints | undefined {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    revokeUrl: "https://slack.com/api/auth.revoke",
    scopes: [
      "channels:read",
      "chat:write",
      "users:read",
      "channels:history",
    ],
    clientId,
    clientSecret,
  };
}

function googleConfig(): OAuthEndpoints | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  return {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ],
    clientId,
    clientSecret,
    // access_type=offline + prompt=consent guarantees a refresh_token.
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
  };
}

// Compute phase + enabled in one place so we don't drift between the two.
function wired(factory: () => OAuthEndpoints | undefined): {
  enabled: boolean;
  phase: ProviderPhase;
  oauth?: OAuthEndpoints;
} {
  const oauth = factory();
  if (oauth) return { enabled: true, phase: "available", oauth };
  return { enabled: false, phase: "credentials-pending" };
}

const ROADMAP: { enabled: false; phase: "roadmap" } = {
  enabled: false,
  phase: "roadmap",
};

// UI-facing provider cards. Internal `gmail`, `google-drive`, `google-sheets`
// all map to the same `google` OAuth grant.
export const PROVIDER_CARDS: ProviderConfig[] = [
  {
    id: "gmail",
    internalId: "google",
    name: "Gmail",
    description: "Read and search emails programmatically.",
    color: "bg-red-500",
    ...wired(googleConfig),
  },
  {
    id: "google-sheets",
    internalId: "google",
    name: "Google Sheets",
    description: "Read spreadsheet data.",
    color: "bg-emerald-500",
    ...wired(googleConfig),
  },
  {
    id: "google-drive",
    internalId: "google",
    name: "Google Drive",
    description: "Read files and folders.",
    color: "bg-amber-500",
    ...wired(googleConfig),
  },
  {
    id: "slack",
    internalId: "slack",
    name: "Slack",
    description: "Post messages and read channels.",
    color: "bg-fuchsia-600",
    ...wired(slackConfig),
  },
  {
    id: "quickbooks",
    internalId: "quickbooks",
    name: "QuickBooks",
    description: "Pull accounting and invoice data.",
    color: "bg-green-700",
    ...ROADMAP,
  },
  {
    id: "stripe",
    internalId: "stripe-connect",
    name: "Stripe",
    description: "Sync payments, customers, and subscriptions.",
    color: "bg-indigo-500",
    ...ROADMAP,
  },
  {
    id: "figma",
    internalId: "figma",
    name: "Figma",
    description: "Read design files and components.",
    color: "bg-neutral-800",
    ...ROADMAP,
  },
  {
    id: "xero",
    internalId: "xero",
    name: "Xero",
    description: "Sync bookkeeping and reports.",
    color: "bg-sky-500",
    ...ROADMAP,
  },
];

export function getProviderByInternalId(internalId: string): ProviderConfig | undefined {
  return PROVIDER_CARDS.find((p) => p.internalId === internalId);
}

export function getProviderByCardId(cardId: string): ProviderConfig | undefined {
  return PROVIDER_CARDS.find((p) => p.id === cardId);
}

/** All distinct internalIds with OAuth configured — these are what we use in API routes. */
export function getEnabledInternalIds(): string[] {
  return Array.from(
    new Set(
      PROVIDER_CARDS.filter((p) => p.enabled && p.oauth).map((p) => p.internalId)
    )
  );
}
