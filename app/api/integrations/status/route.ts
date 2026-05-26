import { NextResponse } from "next/server";
import {
  PROVIDER_CARDS,
  type ProviderPhase,
} from "@/lib/integrations/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client the lifecycle phase of each integration card. Used by
 * /dashboard/integrations to surface honest copy — distinguishing "OAuth
 * code ready but credentials not set" from "engineering work needed".
 *
 * The client cannot peek at server-only env vars directly, so this small
 * endpoint is the bridge. It returns no secrets — only phase + enabled.
 *
 * Response shape:
 *   {
 *     status: { [cardId]: boolean },        // legacy; true ⇔ "available"
 *     phases: { [cardId]: ProviderPhase }   // 'available' | 'credentials-pending' | 'roadmap'
 *   }
 */
export async function GET(): Promise<NextResponse> {
  const status = PROVIDER_CARDS.reduce<Record<string, boolean>>((acc, p) => {
    acc[p.id] = p.enabled;
    return acc;
  }, {});
  const phases = PROVIDER_CARDS.reduce<Record<string, ProviderPhase>>(
    (acc, p) => {
      acc[p.id] = p.phase;
      return acc;
    },
    {}
  );
  return NextResponse.json({ status, phases });
}
