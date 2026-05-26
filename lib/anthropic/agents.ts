import "server-only";
import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import { anthropic } from "./client";
import type {
  AgentErrorCode,
  AgentMessage,
  RunAgentContext,
  RunAgentResult,
} from "./types";

export const DEFAULT_MODEL = "claude-sonnet-4-6";

/**
 * Hard upper bounds on user-controlled inputs. Server-enforced — the chat
 * client caps `message` at 10,000 chars (MAX_INPUT_CHARS in the chat page)
 * but curl bypasses it. customSystemPrompt isn't restricted client-side at
 * all (it's authored through the agent-settings sheet), so the server is
 * the only line of defence against a malicious or accidental 1 MB prompt
 * that would be re-paid on every turn.
 */
export const MAX_USER_MESSAGE_CHARS = 10_000;
export const MAX_CUSTOM_SYSTEM_PROMPT_CHARS = 8_000;
/**
 * Output ceiling per turn. Big enough to fit large CSV / XLSX tool calls
 * (each row consumes output tokens as the model emits the tool_use JSON)
 * and long-form report PDFs. 2,000 was too tight — the model started
 * compressing cell text to stay within budget. 8,000 is comfortable for
 * 200-300 row exports and multi-page narrative reports; only billed for
 * tokens actually output.
 */
export const DEFAULT_MAX_TOKENS = 8000;

/**
 * Controls how much Claude reasons before responding.
 * - "low"    cheapest + fastest, terser replies, fewer tool calls — good for simple chat
 * - "medium" balanced sweet spot; ~half the cost of "high" on most prompts
 * - "high"   Sonnet 4.6 default; deepest reasoning, more thorough responses
 *
 * Switch to "medium" once message volume picks up — same quality on most
 * conversations, noticeably lower bill. Just change this string.
 */
export const DEFAULT_EFFORT: "low" | "medium" | "high" = "high";

/**
 * Base runner used by every agent. Takes the agent's system prompt, the
 * conversation so far, and optional per-call context. Returns a typed result —
 * never throws — so callers can branch on `result.ok` instead of try/catch.
 *
 * Includes prompt caching on the system prompt: when the same system prompt is
 * reused across calls inside the 5-minute cache TTL, subsequent calls pay only
 * for the cached read tokens (≈10% of input cost).
 */
export async function runAgent(
  systemPrompt: string,
  messages: AgentMessage[],
  context?: RunAgentContext
): Promise<RunAgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      code: "missing_api_key",
      error: "ANTHROPIC_API_KEY is not set in the environment.",
    };
  }

  const finalSystemPrompt = context?.additionalInstructions
    ? `${systemPrompt}\n\n${context.additionalInstructions}`
    : systemPrompt;

  try {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [
        {
          type: "text",
          text: finalSystemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return {
        ok: false,
        code: "empty_response",
        error: "The model returned an empty response.",
      };
    }

    return {
      ok: true,
      text,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens:
          response.usage.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (e) {
    return mapAnthropicError(e);
  }
}

function mapAnthropicError(e: unknown): RunAgentResult {
  if (e instanceof APIError) {
    const code = anthropicCode(e);
    return {
      ok: false,
      code,
      error: e.message || `Anthropic API error (${e.status ?? "unknown"})`,
    };
  }
  if (e instanceof Error) {
    return { ok: false, code: "unknown", error: e.message };
  }
  return { ok: false, code: "unknown", error: "Unknown error from Anthropic." };
}

function anthropicCode(e: APIError): AgentErrorCode {
  if (e instanceof AuthenticationError) return "authentication";
  if (e instanceof PermissionDeniedError) return "permission";
  if (e instanceof RateLimitError) return "rate_limited";
  if (e instanceof BadRequestError) return "bad_request";
  if (e instanceof InternalServerError) return "overloaded";
  if (e instanceof APIConnectionTimeoutError) return "timeout";
  return "unknown";
}
