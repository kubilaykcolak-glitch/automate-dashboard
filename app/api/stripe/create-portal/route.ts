import { NextResponse, type NextRequest } from "next/server";
import { stripe } from "@/lib/stripe";
import { getSessionUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userSnap = await adminDb.collection("users").doc(user.uid).get();
  const customerId = userSnap.exists
    ? (userSnap.data()?.stripeCustomerId as string | null | undefined)
    : null;

  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer on file. Start a subscription first." },
      { status: 400 }
    );
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/dashboard`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create portal session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
