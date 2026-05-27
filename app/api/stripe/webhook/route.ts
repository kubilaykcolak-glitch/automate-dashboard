import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
// App Router note: route handlers never parse the body automatically.
// We read the raw body via request.text() for Stripe signature verification.
export const dynamic = "force-dynamic";

async function resolveFirebaseUid(
  subscription: Stripe.Subscription | string
): Promise<string | null> {
  const sub =
    typeof subscription === "string"
      ? await stripe.subscriptions.retrieve(subscription)
      : subscription;

  const uidFromMeta = sub.metadata?.firebaseUid;
  if (uidFromMeta) return uidFromMeta;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const snap = await adminDb
    .collection("users")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature.";
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // Idempotency: Stripe retries webhooks on 5xx for up to 3 days. Today's
  // handlers use set({merge:true}) which is idempotent for the user doc,
  // but anything new (counter increments, audit logs) could double-process.
  // Record-then-handle keeps it safe: if we've seen this event.id we
  // acknowledge immediately without re-running the body.
  try {
    const eventRef = adminDb.collection("stripeEvents").doc(event.id);
    const alreadySeen = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(eventRef);
      if (snap.exists) return true;
      tx.set(eventRef, {
        type: event.type,
        receivedAt: FieldValue.serverTimestamp(),
      });
      return false;
    });
    if (alreadySeen) {
      return NextResponse.json({ received: true, deduped: true });
    }
  } catch (err) {
    // Idempotency dedupe is best-effort. If Firestore is unavailable we
    // proceed — losing dedupe is preferable to dropping a legitimate event.
    console.error("[stripe-webhook] dedupe check failed", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid =
          session.client_reference_id ??
          (session.metadata?.firebaseUid as string | undefined) ??
          null;
        if (!uid) {
          console.error(
            "[stripe-webhook] checkout.session.completed missing firebase uid",
            { sessionId: session.id }
          );
          break;
        }
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;

        let subscriptionStatus: Stripe.Subscription.Status | "none" = "none";
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = sub.status;
        }

        await adminDb.collection("users").doc(uid).set(
          {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const uid = await resolveFirebaseUid(sub);
        if (!uid) {
          console.error(
            "[stripe-webhook] could not resolve firebase uid",
            { eventType: event.type, subscriptionId: sub.id }
          );
          break;
        }
        await adminDb.collection("users").doc(uid).set(
          {
            stripeSubscriptionId: sub.id,
            subscriptionStatus: sub.status,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler failed.";
    console.error("Stripe webhook handler error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
