import "server-only";

/**
 * Shared Anthropic call constants. Both chat routes import from here so the
 * model / token / effort settings live in one place.
 *
 * (Historically this module also exported a runAgent() helper that wrapped
 * messages.create with retry + result-as-value error handling. It was never
 * called by the streaming chat routes and was removed during the system
 * audit; see git history if you need to resurrect that shape.)
 */

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
