import "server-only";
import { randomBytes } from "node:crypto";

export const STATE_COOKIE_NAME = "oauth_state";
export const STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

export interface OAuthStatePayload {
  state: string;
  uid: string;
  internalId: string;
  cardId: string; // which UI card initiated, for returning the user to the right place
  returnTo: string;
  createdAt: number;
}

export function generateState(): string {
  return randomBytes(32).toString("hex");
}

export function buildAuthUrl(params: {
  authUrl: string;
  clientId: string;
  scopes: string[];
  state: string;
  redirectUri: string;
  extra?: Record<string, string>;
}): string {
  const url = new URL(params.authUrl);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  for (const [k, v] of Object.entries(params.extra ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  authed_user?: { id?: string };
  team?: { id?: string; name?: string };
  // Other provider-specific fields tolerated.
  [k: string]: unknown;
}

export async function exchangeCodeForTokens(params: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
  const res = await fetch(params.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let json: TokenResponse;
  try {
    json = JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(`Token endpoint returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || !json.access_token) {
    const msg =
      (json as { error_description?: string; error?: string }).error_description ??
      (json as { error?: string }).error ??
      `Token exchange failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function revokeToken(params: {
  revokeUrl: string;
  accessToken: string;
}): Promise<void> {
  // Best-effort: many providers accept either the access or refresh token.
  try {
    await fetch(params.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: params.accessToken }),
    });
  } catch {
    // ignore — the Firestore cleanup happens regardless
  }
}

export function callbackUrl(request: Request, internalId: string): string {
  // request.url is absolute. We rebuild it so the redirect_uri matches what
  // we registered with the provider precisely.
  const url = new URL(request.url);
  return `${url.origin}/api/integrations/${internalId}/callback`;
}
