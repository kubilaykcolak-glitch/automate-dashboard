import { NextResponse } from "next/server";
import { PROVIDER_CARDS } from "@/lib/integrations/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client which providers have OAuth credentials configured on the
 * server. Used by /dashboard/integrations to decide whether the Connect button
 * should be active or show "Coming soon".
 *
 * The client cannot peek at server-only env vars directly, so this small
 * endpoint is the bridge. It returns no secrets — only enabled flags.
 */
export async function GET(): Promise<NextResponse> {
  const status = PROVIDER_CARDS.reduce<Record<string, boolean>>((acc, p) => {
    acc[p.id] = p.enabled;
    return acc;
  }, {});
  return NextResponse.json({ status });
}
