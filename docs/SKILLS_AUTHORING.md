# Authoring agent skills

> **Audience:** developers extending the agents (right now: just Kubilay). This doc explains the file convention, what makes a good skill, and how the runtime uses them.

---

## What a skill is

A skill is a markdown file containing focused expert knowledge that an agent can use when answering related questions. It is **not** a tool, it does not call APIs, and it does not see the user directly. It is reference material the model treats as ground truth on a specific topic.

Think of each skill as a memo from a senior practitioner: "here is everything an agent needs to know about flat-rate VAT, written tightly, with the rules, the numbers, the gotchas."

## Where skills live

```
lib/anthropic/skills/
  accountancy/
    uk-vat-flat-rate.md
    use-of-home-allowance.md
    self-assessment-deadlines.md
  operations/
    (none yet)
  general/
    (none yet)
```

The folder name matches the agent `type` slug (`accountancy`, `operations`, `general`). Each skill file is a single, focused topic.

## File format

```markdown
---
name: kebab-case-skill-id
description: One or two sentences. Starts with "Apply when ..." or "Use when ..." and names the question types the skill answers. The model reads this to decide whether the skill is relevant.
tags: comma, separated, optional
---

# Topic title

Markdown body. Tables, lists, numbered steps, examples. Aim for 400–2,000 words.
```

**Required frontmatter fields:**
- `name` — kebab-case, unique within the agent. Becomes the skill's identifier.
- `description` — the cue the model uses to decide if the skill is worth loading. Treat this like ad copy: dense, specific, focused on the *question* the skill answers.

**Optional:**
- `tags` — comma-separated. Not used at runtime yet. Useful for grouping in a future docs view.

Anything outside the `---` fences is the body.

## What makes a good skill

| Do | Don't |
|---|---|
| Cover **one focused topic** end to end | Mega-skills that span multiple subjects |
| Lead with rules, then examples | Lead with prose introduction |
| Include current-year figures with a "verify before quoting" note | Quote outdated rates as if they were permanent |
| Show worked examples with real numbers | Hand-wave "you would calculate the VAT" |
| Flag edge cases and "ask the user X" prompts | Pretend every case is the easy case |
| Cite the authoritative source (HMRC notice, IRS pub, etc.) | Cite blog posts |
| Stay under ~2,000 words | Write a textbook |

A good skill is the document you'd hand a smart-but-junior colleague before they took the question on themselves.

## How the runtime uses skills

On every chat request, the chat route at `app/api/agent/chat/route.ts` injects a **manifest** of the agent's skills into the system prompt as a third cached block:

```
# Available skills
Detailed guides you can draw on when relevant. Treat them as expert reference notes...

- uk-vat-flat-rate: Apply when the user is on the flat-rate VAT scheme...
- use-of-home-allowance: Apply when a UK sole trader or director asks...
```

Only the name + description go into context up front. The full body of any skill stays on disk until the agent explicitly loads it.

### The `read_skill` tool

The chat route registers a single tool — `read_skill({ name })` — alongside the request when the manifest is non-empty. The chat route runs a tool-use loop:

1. Stream the model's response. If `stop_reason === "end_turn"` (most turns), done.
2. If `stop_reason === "tool_use"`: parse the model's `tool_use` blocks, look up each requested skill via `getSkillBody(agentType, name)`, return the body as a `tool_result` block. Append the assistant turn + the synthetic user turn (tool_results) to the working history.
3. Call the model again with the augmented history. Loop until it produces a normal answer.

Server-side caps:
- `MAX_SKILL_LOADS_PER_TURN = 3` — after the third load, further `read_skill` calls return an `is_error` result telling the agent to answer with what it has.
- `MAX_TOOL_ITERATIONS = 6` — belt-and-braces stop on the outer loop, should never be hit if the per-skill cap works.

Each skill loaded this turn is recorded on the assistant message doc as `skillsUsed: string[]` for telemetry and a future "Consulted: X" UI pill.

### Module API

`lib/anthropic/skills.ts` exports:
- `getSkillsForAgent(agentType)` — all skills for an agent
- `buildSkillManifest(agentType)` — the manifest string injected into the system prompt
- `getSkillBody(agentType, name)` — the on-demand loader called by the `read_skill` tool

## Publishing workflow

1. Write the `.md` file in the right agent folder.
2. `git add` and commit with a sensible message.
3. `git push`. Vercel auto-deploys.
4. The next chat request reloads the registry on cold start. Within ~30 seconds of deploy, every user of that agent sees the new skill in the manifest.

**No database writes. No UI. No user input.** Skills are code, version-controlled like code.

## Local dev

Skills are read from disk at runtime via `fs.readFileSync` rooted at `process.cwd()/lib/anthropic/skills/`. In `npm run dev` this works straight away — edit a `.md`, save, the next request reloads it (in production the registry caches once per Node process, so a cold start is needed to pick up changes).

### Vercel-specific note

The `next.config.mjs` carries an `outputFileTracingIncludes` entry for `/api/agent/chat` pointing at `./lib/anthropic/skills/**/*.md`. Without it the markdown files would not be bundled into the serverless function. If you ever rename the folder or split it, update the trace include.

## Frontmatter description — how to write good cues

This is the highest-leverage line in the whole skill, because it's what the agent sees. Compare:

- ❌ `Information about VAT.`
- ⚠️ `Covers UK VAT flat-rate scheme.`
- ✅ `Apply when the user is on the flat-rate VAT scheme or is asking whether to join it. Covers sector percentages, the 1% first-year discount, the limited-cost trader test, and how to compute VAT due under the scheme.`

The good version tells the model **when to fire** and **what it gets** if it does. Make it specific. Avoid generic phrases like "tax-related stuff".

## When *not* to write a skill

- Knowledge the model already has reliably and the user volume is low.
- One-off facts (a single rate, a single date) — put those in the system prompt instead.
- Anything that depends on per-user state — that belongs in the user's profile.

Skills earn their keep when there is dense, structured, durable expertise that the model would otherwise get subtly wrong without prompting.

## Future ideas worth holding

- **User-uploaded skills.** A paid feature where users drop their internal policies into the agent. Same file format, stored per-uid in Firestore. Need careful tenant isolation.
- **Skill tagging by tier.** Free users see one library; paid users see a richer one.
- **Per-message skill telemetry.** Log which skills the agent loaded on each message (Phase 2+). Tells you which skills earn their keep and which are dead weight.
