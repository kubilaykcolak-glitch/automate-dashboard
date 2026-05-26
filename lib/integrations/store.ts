import "server-only";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { decrypt, encrypt } from "./crypto";

/**
 * Two-doc model per provider:
 *   /users/{uid}/integrations/{internalId}        — client-readable metadata
 *   /users/{uid}/integration_tokens/{internalId}  — server-only encrypted tokens
 *
 * The tokens path is denied by Firestore rules, so a compromised client cannot
 * exfiltrate access tokens even if metadata is reachable.
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
}

export interface IntegrationMetadata {
  status: "connected" | "disconnected";
  scopes: string[];
  connectedAt: Timestamp | null;
  accountLabel?: string;
}

function metaRef(uid: string, internalId: string) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection("integrations")
    .doc(internalId);
}

function tokenRef(uid: string, internalId: string) {
  return adminDb
    .collection("users")
    .doc(uid)
    .collection("integration_tokens")
    .doc(internalId);
}

export async function saveIntegration(params: {
  uid: string;
  internalId: string;
  scopes: string[];
  accountLabel?: string;
  tokens: StoredTokens;
}): Promise<void> {
  const { uid, internalId, scopes, accountLabel, tokens } = params;

  const tokenPayload: Record<string, unknown> = {
    accessTokenCiphertext: encrypt(tokens.accessToken),
  };
  if (tokens.refreshToken) {
    tokenPayload.refreshTokenCiphertext = encrypt(tokens.refreshToken);
  }
  if (typeof tokens.expiresAt === "number") {
    tokenPayload.expiresAt = tokens.expiresAt;
  }
  tokenPayload.updatedAt = FieldValue.serverTimestamp();

  // Sequential to keep things obvious — both are tiny writes.
  await tokenRef(uid, internalId).set(tokenPayload, { merge: true });
  await metaRef(uid, internalId).set(
    {
      provider: internalId,
      status: "connected",
      scopes,
      accountLabel: accountLabel ?? null,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function loadTokens(
  uid: string,
  internalId: string
): Promise<StoredTokens | null> {
  const snap = await tokenRef(uid, internalId).get();
  if (!snap.exists) return null;
  const data = snap.data() as {
    accessTokenCiphertext?: string;
    refreshTokenCiphertext?: string;
    expiresAt?: number;
  };
  if (!data.accessTokenCiphertext) return null;
  return {
    accessToken: decrypt(data.accessTokenCiphertext),
    refreshToken: data.refreshTokenCiphertext
      ? decrypt(data.refreshTokenCiphertext)
      : undefined,
    expiresAt: data.expiresAt,
  };
}

export async function clearIntegration(
  uid: string,
  internalId: string
): Promise<void> {
  await tokenRef(uid, internalId).delete().catch(() => undefined);
  await metaRef(uid, internalId).set(
    {
      provider: internalId,
      status: "disconnected",
      connectedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
