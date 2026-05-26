#!/usr/bin/env node
/**
 * Sync custom skills from lib/anthropic/skills/<agent>/*.md → Anthropic.
 *
 *   node scripts/anthropic/sync-skills.mjs              # sync all skills
 *   node scripts/anthropic/sync-skills.mjs --dry-run    # show what would change
 *   node scripts/anthropic/sync-skills.mjs --only uk-vat-flat-rate
 *
 * How it works:
 *   1. Scans lib/anthropic/skills/<agent>/<skill-name>.md
 *   2. For each, parses YAML frontmatter (name, description), computes a
 *      content hash of the body, and looks it up in skills.lock.json.
 *   3. If new: POST /v1/skills to create it. If changed: POST a new version.
 *      If unchanged: skip.
 *   4. Writes the resulting skill_id and version into skills.lock.json
 *      (committed to the repo as the source of truth for which skill IDs
 *      to attach in the bootstrap script).
 *   5. Prints a config snippet ready to paste into bootstrap-accountancy-agent.mjs.
 *
 * Lock file: skills-for-anthropic/skills.lock.json
 *   {
 *     "<agentType>": {
 *       "<skill-name>": {
 *         "skill_id": "skill_01...",
 *         "version": "1",
 *         "content_hash": "sha256:...",
 *         "uploaded_at": "ISO-8601"
 *       }
 *     }
 *   }
 *
 * Verbose error logging: if the API rejects an upload, the full response
 * body is logged so we can adjust the body shape. The upload function is
 * factored so swapping JSON ↔ multipart is a one-line change.
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  betaHeader: "managed-agents-2026-04-01",
  apiBase: "https://api.anthropic.com",
  skillsDir: join(REPO_ROOT, "lib", "anthropic", "skills"),
  lockPath: join(REPO_ROOT, "skills-for-anthropic", "skills.lock.json"),
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const ONLY_INDEX = argv.indexOf("--only");
const ONLY_FILTER =
  ONLY_INDEX >= 0 && argv[ONLY_INDEX + 1] ? argv[ONLY_INDEX + 1] : null;

// ─────────────────────────────────────────────────────────────────────────────
// .env.local loader
// ─────────────────────────────────────────────────────────────────────────────

function loadDotEnvLocal() {
  const path = join(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Overwrite empty existing values too — some shells inject empty strings
    // for env vars they know about, which would otherwise mask the real value.
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnvLocal();

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not set in .env.local or env.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadLockFile() {
  if (!existsSync(CONFIG.lockPath)) return { skills: {} };
  try {
    return JSON.parse(readFileSync(CONFIG.lockPath, "utf8"));
  } catch (err) {
    console.warn(`⚠️  Could not parse ${CONFIG.lockPath}: ${err.message}`);
    return { skills: {} };
  }
}

function saveLockFile(lock) {
  const dir = dirname(CONFIG.lockPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG.lockPath, JSON.stringify(lock, null, 2) + "\n", "utf8");
}

function sha256(content) {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter = {};
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

function discoverSkills() {
  const out = [];
  if (!existsSync(CONFIG.skillsDir)) return out;
  for (const agentType of readdirSync(CONFIG.skillsDir, { withFileTypes: true })) {
    if (!agentType.isDirectory()) continue;
    const agentDir = join(CONFIG.skillsDir, agentType.name);
    for (const entry of readdirSync(agentDir)) {
      if (!entry.endsWith(".md")) continue;
      const fullPath = join(agentDir, entry);
      const raw = readFileSync(fullPath, "utf8");
      const parsed = parseFrontmatter(raw);
      if (!parsed || !parsed.frontmatter.name || !parsed.frontmatter.description) {
        console.warn(`  ⚠️  Skipping ${agentType.name}/${entry} (missing frontmatter)`);
        continue;
      }
      // Build the SKILL.md content Anthropic wants: same frontmatter (name +
      // description only, no custom tags) plus the body.
      const skillMd = [
        "---",
        `name: ${parsed.frontmatter.name}`,
        `description: ${parsed.frontmatter.description}`,
        "---",
        "",
        parsed.body,
      ].join("\n");
      out.push({
        agentType: agentType.name,
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        skillMd,
        contentHash: sha256(skillMd),
        sourcePath: fullPath,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Anthropic API
// ─────────────────────────────────────────────────────────────────────────────

async function anthropic(path, options = {}) {
  const headers = {
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": CONFIG.betaHeader,
    ...(options.headers ?? {}),
  };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }
  // The Skills API requires both the anthropic-beta header AND a ?beta=true
  // query parameter — the SDK reference at api.md shows it as
  // `POST /v1/skills?beta=true`. Append automatically if not already present.
  const url = new URL(`${CONFIG.apiBase}${path}`);
  if (!url.searchParams.has("beta")) url.searchParams.set("beta", "true");
  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body !== undefined
          ? JSON.stringify(options.body)
          : undefined,
  });
  return res;
}

/**
 * Upload a new custom skill. Tries JSON shape first; falls back to multipart
 * if the API rejects with 4xx. Logs the raw response on failure so we can
 * tighten the shape next iteration.
 */
async function createSkill(skill) {
  // Attempt 1: JSON body. Most modern Anthropic endpoints accept JSON.
  const jsonAttempt = await anthropic("/v1/skills", {
    method: "POST",
    body: {
      display_name: skill.name,
      description: skill.description,
      // SKILL.md body content — most likely field names. We try a few common
      // names by including all of them; the server should accept whichever it
      // expects and ignore the rest.
      content: skill.skillMd,
      skill_md: skill.skillMd,
      instructions: skill.skillMd,
    },
  });
  if (jsonAttempt.ok) {
    return await jsonAttempt.json();
  }

  const jsonError = await jsonAttempt.text();
  console.warn(`  JSON upload returned ${jsonAttempt.status}. Trying multipart…`);
  if (process.env.DEBUG_SYNC) console.warn(`  JSON response: ${jsonError}`);

  // Attempt 2: multipart with the SKILL.md as a file.
  const form = new FormData();
  form.append("display_name", skill.name);
  form.append("description", skill.description);
  form.append(
    "file",
    new Blob([skill.skillMd], { type: "text/markdown" }),
    "SKILL.md"
  );
  const multipartAttempt = await anthropic("/v1/skills", {
    method: "POST",
    body: form,
  });
  if (multipartAttempt.ok) {
    return await multipartAttempt.json();
  }
  const multipartError = await multipartAttempt.text();
  throw new Error(
    `Both upload formats failed.\n` +
      `  JSON (${jsonAttempt.status}): ${jsonError.slice(0, 500)}\n` +
      `  Multipart (${multipartAttempt.status}): ${multipartError.slice(0, 500)}\n` +
      `\n` +
      `Adjust createSkill() in scripts/anthropic/sync-skills.mjs based on the response.`
  );
}

/**
 * Create a new version of an existing skill (for updates to its content).
 * Same body-shape strategy as createSkill().
 */
async function createSkillVersion(skillId, skill) {
  const jsonAttempt = await anthropic(`/v1/skills/${skillId}/versions`, {
    method: "POST",
    body: {
      content: skill.skillMd,
      skill_md: skill.skillMd,
      instructions: skill.skillMd,
    },
  });
  if (jsonAttempt.ok) {
    return await jsonAttempt.json();
  }
  const jsonError = await jsonAttempt.text();
  if (process.env.DEBUG_SYNC) console.warn(`  JSON version response: ${jsonError}`);

  const form = new FormData();
  form.append(
    "file",
    new Blob([skill.skillMd], { type: "text/markdown" }),
    "SKILL.md"
  );
  const multipartAttempt = await anthropic(`/v1/skills/${skillId}/versions`, {
    method: "POST",
    body: form,
  });
  if (multipartAttempt.ok) {
    return await multipartAttempt.json();
  }
  const multipartError = await multipartAttempt.text();
  throw new Error(
    `Both version upload formats failed for ${skillId}.\n` +
      `  JSON (${jsonAttempt.status}): ${jsonError.slice(0, 500)}\n` +
      `  Multipart (${multipartAttempt.status}): ${multipartError.slice(0, 500)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Syncing custom skills → Anthropic\n");

  const lock = loadLockFile();
  if (!lock.skills) lock.skills = {};

  const skills = discoverSkills();
  const filtered = ONLY_FILTER
    ? skills.filter((s) => s.name === ONLY_FILTER)
    : skills;

  if (filtered.length === 0) {
    console.log(
      ONLY_FILTER
        ? `No skill named "${ONLY_FILTER}" found.`
        : "No skills found under lib/anthropic/skills/."
    );
    return;
  }

  console.log(`Discovered ${filtered.length} skill${filtered.length === 1 ? "" : "s"}:`);
  for (const s of filtered) {
    console.log(`  - ${s.agentType}/${s.name}`);
  }
  console.log();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const skill of filtered) {
    const lockEntry = lock.skills[skill.agentType]?.[skill.name];
    const status = !lockEntry
      ? "new"
      : lockEntry.content_hash === skill.contentHash
        ? "unchanged"
        : "changed";

    if (status === "unchanged") {
      console.log(
        `  ✓ ${skill.agentType}/${skill.name} (unchanged, ${lockEntry.skill_id} v${lockEntry.version})`
      );
      skipped += 1;
      continue;
    }

    if (DRY_RUN) {
      console.log(
        `  → ${skill.agentType}/${skill.name} would be ${status === "new" ? "created" : "updated"}`
      );
      continue;
    }

    try {
      if (status === "new") {
        console.log(`  ⏳ Creating ${skill.agentType}/${skill.name}…`);
        const result = await createSkill(skill);
        const skillId =
          result.id ?? result.skill_id ?? result.skill?.id ?? result.skill?.skill_id;
        const version =
          result.version ?? result.latest_version ?? result.skill?.version ?? "1";
        if (!skillId) {
          throw new Error(
            `Skill created but response missing id field. Raw: ${JSON.stringify(result).slice(0, 500)}`
          );
        }
        if (!lock.skills[skill.agentType]) lock.skills[skill.agentType] = {};
        lock.skills[skill.agentType][skill.name] = {
          skill_id: skillId,
          version: String(version),
          content_hash: skill.contentHash,
          uploaded_at: new Date().toISOString(),
        };
        console.log(`     created ${skillId} v${version}`);
        created += 1;
      } else {
        console.log(
          `  ⏳ Updating ${skill.agentType}/${skill.name} (${lockEntry.skill_id})…`
        );
        const result = await createSkillVersion(lockEntry.skill_id, skill);
        const version =
          result.version ?? result.latest_version ?? result.skill?.version ?? "1";
        lock.skills[skill.agentType][skill.name] = {
          ...lockEntry,
          version: String(version),
          content_hash: skill.contentHash,
          uploaded_at: new Date().toISOString(),
        };
        console.log(`     new version ${version}`);
        updated += 1;
      }
      // Save after each successful upload so partial runs don't lose state.
      saveLockFile(lock);
    } catch (err) {
      console.error(`  ✗ ${skill.agentType}/${skill.name} — ${err.message}`);
      failed += 1;
    }
  }

  console.log();
  console.log("──────────────────────────────────────────");
  console.log(
    `Created: ${created}  ·  Updated: ${updated}  ·  Skipped: ${skipped}  ·  Failed: ${failed}`
  );
  console.log("──────────────────────────────────────────");

  if (created + updated > 0 && !DRY_RUN) {
    console.log("\nLock file updated:", CONFIG.lockPath);
    console.log("\nReady-to-paste config for bootstrap-accountancy-agent.mjs:");
    console.log("\n  customSkills: [");
    const byAgent = lock.skills.accountancy ?? {};
    for (const [name, entry] of Object.entries(byAgent)) {
      console.log(`    { skill_id: "${entry.skill_id}", note: "${name}" },`);
    }
    console.log("  ],");
    console.log(
      "\nThen re-run: node scripts/anthropic/bootstrap-accountancy-agent.mjs"
    );
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Sync failed:");
  console.error(err);
  process.exit(1);
});
