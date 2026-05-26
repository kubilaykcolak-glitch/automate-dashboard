import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface Skill {
  /** kebab-case identifier used by the future read_skill tool */
  name: string;
  /** one-line cue the model uses to decide whether to load the body */
  description: string;
  /** optional comma-separated tags from frontmatter (unused for now) */
  tags?: string[];
  /** the markdown body, without frontmatter */
  body: string;
  /** which agent the skill belongs to (folder name) */
  agentType: string;
}

const SKILLS_DIR_REL = "lib/anthropic/skills";

let cache: Map<string, Skill[]> | null = null;

/**
 * Load every skill from disk once per Node process. Re-read only on cold start.
 * Markdown files live at lib/anthropic/skills/<agentType>/<name>.md and use
 * YAML-ish frontmatter delimited by --- fences:
 *
 *   ---
 *   name: uk-vat-flat-rate
 *   description: Use when answering ... flat-rate VAT scheme ...
 *   tags: vat, hmrc
 *   ---
 *
 *   # Skill body in markdown
 *
 * Missing frontmatter or unparseable files are skipped silently; broken
 * skills must never crash the chat route.
 */
function loadAllSkills(): Map<string, Skill[]> {
  const root = join(process.cwd(), SKILLS_DIR_REL);
  const byAgent = new Map<string, Skill[]>();
  if (!existsSync(root)) return byAgent;

  let agentDirs: string[];
  try {
    agentDirs = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return byAgent;
  }

  for (const agentType of agentDirs) {
    const agentDir = join(root, agentType);
    let files: string[];
    try {
      files = readdirSync(agentDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    const skills: Skill[] = [];
    for (const file of files) {
      const fullPath = join(agentDir, file);
      let raw: string;
      try {
        raw = readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }
      const parsed = parseFrontmatter(raw);
      if (!parsed || !parsed.frontmatter.name || !parsed.frontmatter.description) {
        // Log to server console so authors notice broken skills locally.
        console.warn(
          `[skills] Skipping ${agentType}/${file} — missing name or description in frontmatter.`
        );
        continue;
      }
      const tagsRaw = parsed.frontmatter.tags;
      const tags =
        typeof tagsRaw === "string"
          ? tagsRaw
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;
      skills.push({
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        tags,
        body: parsed.body.trim(),
        agentType,
      });
    }
    if (skills.length > 0) {
      // Stable ordering by skill name keeps the manifest cache-friendly.
      skills.sort((a, b) => a.name.localeCompare(b.name));
      byAgent.set(agentType, skills);
    }
  }
  return byAgent;
}

interface FrontmatterParseResult {
  frontmatter: Record<string, string>;
  body: string;
}

function parseFrontmatter(raw: string): FrontmatterParseResult | null {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, string> = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!key) continue;
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function getRegistry(): Map<string, Skill[]> {
  if (!cache) cache = loadAllSkills();
  return cache;
}

/** Skills available for a given agent type, sorted by name. */
export function getSkillsForAgent(agentType: string): Skill[] {
  return getRegistry().get(agentType) ?? [];
}

/**
 * Build the manifest block injected into the system prompt. Lists only
 * name + description so the model can decide which skills (if any) are worth
 * loading via the future read_skill tool. Returns null if the agent has no
 * skills, so the caller can skip the system block entirely.
 */
export function buildSkillManifest(agentType: string): string | null {
  const skills = getSkillsForAgent(agentType);
  if (skills.length === 0) return null;
  const lines = skills.map(
    (s) => `- ${s.name}: ${s.description}`
  );
  return [
    "# Available skills",
    "Detailed guides you can draw on when relevant. Treat them as expert reference notes — when the user's question touches a topic covered below, apply the guidance from the matching skill silently. Don't list skills back to the user or mention this section exists.",
    "",
    ...lines,
  ].join("\n");
}

/** Look up a single skill's body (Phase 2 — used by the read_skill tool). */
export function getSkillBody(
  agentType: string,
  name: string
): string | null {
  const skill = getSkillsForAgent(agentType).find((s) => s.name === name);
  return skill ? skill.body : null;
}
