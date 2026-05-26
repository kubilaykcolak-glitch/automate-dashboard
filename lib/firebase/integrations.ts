import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";
import type { Integration, IntegrationStatus } from "@/types/database";

function integrationsCollection(uid: string) {
  return collection(db, "users", uid, "integrations");
}

function snapshotToIntegration(
  id: string,
  data: Record<string, unknown>
): Integration {
  return {
    id,
    provider: (data.provider as string) ?? id,
    status: (data.status as IntegrationStatus) ?? "disconnected",
    connectedAt:
      (data.connectedAt as Integration["connectedAt"] | undefined) ?? null,
    scopes: Array.isArray(data.scopes) ? (data.scopes as string[]) : [],
  };
}

export async function getIntegrations(uid: string): Promise<Integration[]> {
  const q = query(integrationsCollection(uid), orderBy("provider"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => snapshotToIntegration(d.id, d.data()));
}

export function subscribeIntegrations(
  uid: string,
  onChange: (integrations: Integration[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    integrationsCollection(uid),
    (snap) => {
      onChange(snap.docs.map((d) => snapshotToIntegration(d.id, d.data())));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function connectIntegration(
  uid: string,
  provider: string
): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "integrations", provider),
    {
      provider,
      status: "connected",
      connectedAt: serverTimestamp(),
      scopes: [],
    },
    { merge: true }
  );
}

export async function disconnectIntegration(
  uid: string,
  provider: string
): Promise<void> {
  await setDoc(
    doc(db, "users", uid, "integrations", provider),
    {
      provider,
      status: "disconnected",
      connectedAt: null,
    },
    { merge: true }
  );
}
