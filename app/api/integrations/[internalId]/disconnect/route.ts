import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/firebase/session";
import { getProviderByInternalId } from "@/lib/integrations/providers";
import { clearIntegration, loadTokens } from "@/lib/integrations/store";
import { revokeToken } from "@/lib/integrations/oauth";
import { logActivity } from "@/lib/firebase/activity";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: { internalId: string } }
): Promise<NextResponse> {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getProviderByInternalId(params.internalId);
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider "${params.internalId}".` },
      { status: 404 }
    );
  }

  // Best-effort revoke at the provider — never block on it.
  if (provider.oauth?.revokeUrl) {
    const tokens = await loadTokens(session.uid, provider.internalId);
    if (tokens?.accessToken) {
      await revokeToken({
        revokeUrl: provider.oauth.revokeUrl,
        accessToken: tokens.accessToken,
      });
    }
  }

  await clearIntegration(session.uid, provider.internalId);

  void logActivity(session.uid, {
    type: "integration_connected",
    message: `Disconnected ${provider.name}`,
    metadata: { provider: provider.internalId },
  });

  return NextResponse.json({ ok: true });
}
