import type { Timestamp } from "firebase/firestore";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused"
  | "none";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Timestamp;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  agentType: string;
  createdAt: Timestamp;
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  storagePath: string;
  downloadUrl: string;
  createdAt: Timestamp | null;
}

export type IntegrationStatus = "connected" | "disconnected";

export interface Integration {
  id: string;
  provider: string;
  status: IntegrationStatus;
  connectedAt: Timestamp | null;
  scopes: string[];
}

export type AgentStatus = "active" | "inactive";

export interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  description: string;
  connectedTools: string[];
  createdAt: Timestamp;
  /** Updated by the chat route on every turn (increments by 2). */
  messageCount?: number;
  /** Timestamp of the most recent message in any session for this agent. */
  lastMessageAt?: Timestamp | null;
  /** If set, overrides the built-in systemPrompt from the AgentConfig registry. */
  customSystemPrompt?: string | null;
  /** Per-user profile data captured during the onboarding wizard.
   *  Shape is defined by the AgentConfig.profileSchema for this type. */
  profile?: Record<string, string | boolean | string[] | null> | null;
}
