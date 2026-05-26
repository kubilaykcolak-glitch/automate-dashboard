import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { getProviderByInternalId } from "@/lib/integrations/providers";
import {
  STATE_COOKIE_NAME,
  callbackUrl,
  exchangeCodeForTokens,
  type OAuthStatePayload,
} from "@/lib/integrations/oauth";
import { saveIntegration } from "@/lib/integrations/store";
import { logActivity } from "@/lib/firebase/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(request: NextRequest, message: string) {
  const target = new URL("/dashboard/integrations", request.url);
  target.searchParams.set("error", message);
  return NextResponse.redirect(target);
}

function successRedirect(request: NextRequest, returnTo: string, providerName: string) {
  const target = new URL(returnTo, request.url);
  target.searchParams.set("connected", providerName);
  return NextResponse.redirect(target);
}

async function fetchGoogleEmail(accessToken: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { internalId: string } }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return errorRedirect(request, "Not signed in.");
  }

  const provider = getProviderByInternalId(params.internalId);
  if (!provider || !provider.oauth) {
    return errorRedirect(request, `Provider "${params.internalId}" not configured.`);
  }

  // Check for provider-side error (user denied, etc.)
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return errorRedirect(
      request,
      `${provider.name} declined the connection: ${providerError}`
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const stateFromQuery = request.nextUrl.searchParams.get("state");
  const stateCookieRaw = request.cookies.get(STATE_COOKIE_NAME)?.value;
  if (!code || !stateFromQuery || !stateCookieRaw) {
    return errorRedirect(request, "Missing authorisation code or state.");
  }

  let statePayload: OAuthStatePayload;
  try {
    statePayload = JSON.parse(
      Buffer.from(stateCookieRaw, "base64").toString("utf8")
    ) as OAuthStatePayload;
  } catch {
    return errorRedirect(request, "Invalid OAuth state cookie.");
  }
  if (statePayload.state !== stateFromQuery) {
    return errorRedirect(request, "OAuth state mismatch — possible CSRF.");
  }
  if (statePayload.uid !== session.uid) {
    return errorRedirect(request, "OAuth state belongs to a different session.");
  }
  if (Date.now() - statePayload.createdAt > 10 * 60 * 1000) {
    return errorRedirect(request, "OAuth flow expired. Please try again.");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      tokenUrl: provider.oauth.tokenUrl,
      clientId: provider.oauth.clientId,
      clientSecret: provider.oauth.clientSecret,
      code,
      redirectUri: callbackUrl(request, provider.internalId),
    });
  } catch (e) {
    return errorRedirect(
      request,
      e instanceof Error ? e.message : "Token exchange failed."
    );
  }

  // Provider-specific label so the UI can show "Connected as foo@bar.com".
  let accountLabel: string | undefined;
  if (provider.internalId === "google") {
    accountLabel = await fetchGoogleEmail(tokens.access_token);
  } else if (provider.internalId === "slack") {
    const team = tokens.team as { name?: string } | undefined;
    accountLabel = team?.name;
  }

  const expiresAt =
    typeof tokens.expires_in === "number"
      ? Date.now() + tokens.expires_in * 1000
      : undefined;

  try {
    await saveIntegration({
      uid: session.uid,
      internalId: provider.internalId,
      scopes: tokens.scope
        ? tokens.scope.split(/[\s,]+/).filter(Boolean)
        : provider.oauth.scopes,
      accountLabel,
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      },
    });
  } catch (e) {
    return errorRedirect(
      request,
      e instanceof Error ? e.message : "Could not save integration."
    );
  }

  void logActivity(session.uid, {
    type: "integration_connected",
    message: `Connected ${provider.name}${accountLabel ? ` (${accountLabel})` : ""}`,
    metadata: { provider: provider.internalId },
  });

  const response = successRedirect(request, statePayload.returnTo, provider.name);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  });
  return response;
}
