import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./client";
import { getAgentConfig, listAgentConfigs } from "@/lib/anthropic/agent-configs";
import type { Agent, AgentStatus } from "@/types/database";

function agentsCollection(uid: string) {
  return collection(db, "users", uid, "agents");
}

function snapshotToAgent(id: string, data: Record<string, unknown>): Agent {
  return {
    id,
    name: (data.name as string) ?? "",
    type: (data.type as string) ?? "",
    status: (data.status as AgentStatus) ?? "inactive",
    description: (data.description as string) ?? "",
    connectedTools: Array.isArray(data.connectedTools)
      ? (data.connectedTools as string[])
      : [],
    createdAt: data.createdAt as Agent["createdAt"],
    messageCount:
      typeof data.messageCount === "number"
        ? (data.messageCount as number)
        : 0,
    lastMessageAt: (data.lastMessageAt as Agent["lastMessageAt"]) ?? null,
    customSystemPrompt:
      typeof data.customSystemPrompt === "string"
        ? (data.customSystemPrompt as string)
        : null,
    profile:
      data.profile && typeof data.profile === "object"
        ? (data.profile as Agent["profile"])
        : null,
  };
}

export async function getAgents(uid: string): Promise<Agent[]> {
  const q = query(agentsCollection(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => snapshotToAgent(d.id, d.data()));
}

export function subscribeAgents(
  uid: string,
  onChange: (agents: Agent[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(agentsCollection(uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => snapshotToAgent(d.id, d.data())));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function updateAgentStatus(
  uid: string,
  agentId: string,
  status: AgentStatus
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "agents", agentId), { status });
}

/**
 * Activate a built-in agent for this user. Looks up the AgentConfig by `type`,
 * then upserts an Agent document at `/users/{uid}/agents/{type}` seeded from
 * the config with status: "active".
 *
 * If the doc already exists, only `status` is bumped to "active" — the user's
 * customisations (description, connectedTools, etc.) are preserved.
 */
export async function activateAgentFromConfig(
  uid: string,
  type: string
): Promise<Agent> {
  const config = getAgentConfig(type);
  if (!config) {
    throw new Error(`No agent config registered for type "${type}".`);
  }

  const ref = doc(db, "users", uid, "agents", type);
  const existing = await getDoc(ref);

  if (existing.exists()) {
    await updateDoc(ref, { status: "active" });
    return snapshotToAgent(existing.id, {
      ...existing.data(),
      status: "active",
    });
  }

  const payload = {
    name: config.name,
    type: config.type,
    status: "active" as AgentStatus,
    description: config.description,
    connectedTools: config.tools,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  const created = await getDoc(ref);
  return snapshotToAgent(created.id, created.data() ?? payload);
}

/**
 * Save (or update) the per-user profile data captured by the onboarding wizard.
 * Stored inline on the agent doc so a single read returns everything the chat
 * route needs.
 */
export async function updateAgentProfile(
  uid: string,
  agentId: string,
  profile: Record<string, string | boolean | string[] | null>
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "agents", agentId), {
    profile,
    profileUpdatedAt: serverTimestamp(),
  });
}

/**
 * Update user-editable fields on the agent doc — name and the optional system
 * prompt override. Passing `customSystemPrompt: null` reverts to the built-in.
 */
/** Mirror of MAX_CUSTOM_SYSTEM_PROMPT_CHARS — kept in client lib to avoid
 * pulling the server-only agents module into the bundle. Server-side limit
 * is the real enforcement (see /api/agent/chat). */
export const MAX_CUSTOM_SYSTEM_PROMPT_CHARS_CLIENT = 8_000;

export async function updateAgentSettings(
  uid: string,
  agentId: string,
  updates: { name?: string; customSystemPrompt?: string | null }
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (typeof updates.name === "string") {
    const trimmedName = updates.name.trim().slice(0, 80);
    if (trimmedName.length === 0) {
      throw new Error("Agent name cannot be empty.");
    }
    payload.name = trimmedName;
  }
  if (updates.customSystemPrompt !== undefined) {
    if (
      typeof updates.customSystemPrompt === "string" &&
      updates.customSystemPrompt.length > MAX_CUSTOM_SYSTEM_PROMPT_CHARS_CLIENT
    ) {
      throw new Error(
        `Custom system prompt is too long (${updates.customSystemPrompt.length} chars). Maximum is ${MAX_CUSTOM_SYSTEM_PROMPT_CHARS_CLIENT}.`
      );
    }
    payload.customSystemPrompt = updates.customSystemPrompt;
  }
  if (Object.keys(payload).length === 0) return;
  await updateDoc(doc(db, "users", uid, "agents", agentId), payload);
}

/**
 * Seed every built-in agent into the user's `/agents` subcollection as
 * "inactive". Idempotent — won't overwrite existing docs.
 */
export async function seedDefaultAgents(uid: string): Promise<void> {
  await Promise.all(
    listAgentConfigs().map(async (config) => {
      const ref = doc(db, "users", uid, "agents", config.type);
      const existing = await getDoc(ref);
      if (existing.exists()) return;
      await setDoc(ref, {
        name: config.name,
        type: config.type,
        status: "inactive" as AgentStatus,
        description: config.description,
        connectedTools: config.tools,
        createdAt: serverTimestamp(),
      });
    })
  );
}
