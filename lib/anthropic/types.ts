export type AgentRole = "user" | "assistant";

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  timestamp: Date;
}

export type AgentSessionStatus = "active" | "completed" | "error";

export interface AgentSession {
  id: string;
  uid: string;
  agentId: string;
  messages: AgentMessage[];
  status: AgentSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ProfileFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "boolean"
  | "date";

export interface ProfileFieldOption {
  value: string;
  label: string;
}

export interface ProfileField {
  key: string;
  label: string;
  type: ProfileFieldType;
  options?: ProfileFieldOption[];
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  defaultValue?: string | boolean | string[];
  /** Show this field only when another field equals a specific value. */
  showIf?: { field: string; equals: string | boolean };
}

export interface ProfileStep {
  title: string;
  description?: string;
  fields: ProfileField[];
}

export interface AgentProfileSchema {
  steps: ProfileStep[];
}

export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  systemPrompt: string;
  tools: string[];
  description: string;
  capabilities: string[];
  /** Suggested starter prompts shown on the empty-state of the chat UI. */
  starterPrompts?: string[];
  /** Onboarding schema. If present, the agent shows a wizard on first open. */
  profileSchema?: AgentProfileSchema;
}

export type AgentProfile = Record<string, string | boolean | string[] | null>;

/**
 * Lightweight per-call context that the base runner threads through to
 * Anthropic and to whatever logging/metrics layer wraps it. All optional.
 */
export interface RunAgentContext {
  uid?: string;
  agentId?: string;
  sessionId?: string;
  /** Extra instructions appended to the system prompt at call time. */
  additionalInstructions?: string;
  /** Free-form metadata for tracing/logging. Not sent to Anthropic. */
  metadata?: Record<string, unknown>;
}

export type RunAgentResult =
  | { ok: true; text: string; usage: AgentUsage; stopReason: string | null }
  | { ok: false; error: string; code: AgentErrorCode };

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export type AgentErrorCode =
  | "missing_api_key"
  | "rate_limited"
  | "authentication"
  | "permission"
  | "bad_request"
  | "overloaded"
  | "timeout"
  | "empty_response"
  | "unknown";
