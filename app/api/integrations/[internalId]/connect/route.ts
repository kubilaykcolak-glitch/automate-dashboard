import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { getProviderByInternalId } from "@/lib/integrations/providers";
import {
  STATE_COOKIE_MAX_AGE_SECONDS,
  STATE_COOKIE_NAME,
  buildAuthUrl,
  callbackUrl,
  generateState,
  type OAuthStatePayload,
} from "@/lib/integrations/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { internalId: string } }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const provider = getProviderByInternalId(params.internalId);
  if (!provider || !provider.oauth) {
    return NextResponse.json(
      { error: `Provider "${params.internalId}" is not configured.` },
      { status: 404 }
    );
  }

  const cardId = request.nextUrl.searchParams.get("card") ?? provider.id;
  const returnTo =
    request.nextUrl.searchParams.get("returnTo") ?? "/dashboard/integrations";

  const state = generateState();
  const payload: OAuthStatePayload = {
    state,
    uid: session.uid,
    internalId: provider.internalId,
    cardId,
    returnTo,
    createdAt: Date.now(),
  };

  const redirectUri = callbackUrl(request, provider.internalId);
  const authUrl = buildAuthUrl({
    authUrl: provider.oauth.authUrl,
    clientId: provider.oauth.clientId,
    scopes: provider.oauth.scopes,
    state,
    redirectUri,
    extra: provider.oauth.extraAuthParams,
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set({
    name: STATE_COOKIE_NAME,
    value: Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
