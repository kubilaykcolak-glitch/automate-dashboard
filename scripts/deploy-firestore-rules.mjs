// Deploys firestore.rules to the project's cloud.firestore ruleset.
// Run: node scripts/deploy-firestore-rules.mjs <path-to-service-account.json>

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

function die(msg, extra) {
  console.error("FATAL:", msg);
  if (extra) console.error(extra);
  process.exit(1);
}

const saPath = process.argv[2];
if (!saPath) die("Usage: node deploy-firestore-rules.mjs <service-account.json>");
const sa = JSON.parse(fs.readFileSync(path.resolve(saPath), "utf8"));
const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = sa;

const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "firestore.rules");
const rulesSource = fs.readFileSync(rulesPath, "utf8");

function base64url(s) {
  return Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: [
        "https://www.googleapis.com/auth/firebase",
        "https://www.googleapis.com/auth/cloud-platform",
      ].join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(privateKey)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const jwt = `${signingInput}.${signature}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) die("Token exchange failed", JSON.stringify(data));
  return data.access_token;
}

async function call(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) die(`API ${method} ${url} -> ${res.status}`, JSON.stringify(parsed));
  return parsed;
}

(async () => {
  const token = await getAccessToken();

  // 1. Create a Ruleset containing the source
  const rs = await call(
    "POST",
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    token,
    {
      source: {
        files: [{ name: "firestore.rules", content: rulesSource }],
      },
    }
  );
  console.error("Created ruleset:", rs.name);

  // 2. Look up the cloud.firestore release; create it if missing, otherwise update it
  const releaseName = `projects/${projectId}/releases/cloud.firestore`;
  try {
    await call(
      "GET",
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      token
    );
    // Exists — update
    const upd = await call(
      "PATCH",
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      token,
      {
        release: {
          name: releaseName,
          rulesetName: rs.name,
        },
      }
    );
    console.error("Updated release ->", upd.rulesetName);
  } catch (e) {
    // Likely 404 — create
    const created = await call(
      "POST",
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
      token,
      {
        name: releaseName,
        rulesetName: rs.name,
      }
    );
    console.error("Created release ->", created.rulesetName);
  }
  console.error("Done.");
})();
