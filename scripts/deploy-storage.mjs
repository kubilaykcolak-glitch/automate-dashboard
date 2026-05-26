// Ensures Firebase Storage is provisioned and deploys storage.rules.
// Run: node scripts/deploy-storage.mjs <path-to-service-account.json>

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
if (!saPath) die("Usage: node deploy-storage.mjs <service-account.json>");
const sa = JSON.parse(fs.readFileSync(path.resolve(saPath), "utf8"));
const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = sa;

const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "storage.rules");
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
  const signature = signer.sign(privateKey).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
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

async function call(method, url, token, body, opts = {}) {
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
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!res.ok && !opts.allowFail) die(`API ${method} ${url} -> ${res.status}`, JSON.stringify(parsed));
  return { ok: res.ok, status: res.status, data: parsed };
}

async function enableApi(token, apiId) {
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${apiId}:enable`;
  const r = await call("POST", url, token, {}, { allowFail: true });
  if (r.ok) {
    console.error(`Enabled API: ${apiId}`);
  } else if (r.status === 409 || JSON.stringify(r.data).includes("already")) {
    console.error(`API already enabled: ${apiId}`);
  } else {
    console.error(`Could not enable ${apiId} (${r.status}). May already be enabled or needs propagation.`);
  }
}

async function waitForApiReady(token, apiId, maxSeconds = 60) {
  for (let i = 0; i < maxSeconds / 2; i++) {
    const r = await call(
      "GET",
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${apiId}`,
      token,
      null,
      { allowFail: true }
    );
    if (r.ok && r.data.state === "ENABLED") return;
    await new Promise((res) => setTimeout(res, 2000));
  }
}

(async () => {
  const token = await getAccessToken();

  // 0. Enable the firebasestorage API if not enabled
  await enableApi(token, "firebasestorage.googleapis.com");
  await waitForApiReady(token, "firebasestorage.googleapis.com");

  // 1. List Firebase-linked buckets
  const buckets = await call(
    "GET",
    `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/buckets`,
    token,
    null,
    { allowFail: true }
  );
  let bucketName;
  if (buckets.ok && buckets.data.buckets && buckets.data.buckets.length > 0) {
    bucketName = buckets.data.buckets[0].name.split("/").pop();
    console.error(`Firebase-linked bucket: ${bucketName}`);
  } else {
    // 2. Try linking the default GCS bucket
    const defaultBucket = `${projectId}.firebasestorage.app`;
    console.error(`No bucket linked. Linking default ${defaultBucket}…`);
    const link = await call(
      "POST",
      `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/buckets/${defaultBucket}:addFirebase`,
      token,
      {},
      { allowFail: true }
    );
    if (link.ok) {
      bucketName = defaultBucket;
      console.error(`Linked: ${bucketName}`);
    } else {
      // Try the legacy appspot name
      const legacy = `${projectId}.appspot.com`;
      console.error(`Linking ${defaultBucket} failed (${link.status}). Trying legacy ${legacy}…`);
      const link2 = await call(
        "POST",
        `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/buckets/${legacy}:addFirebase`,
        token,
        {},
        { allowFail: true }
      );
      if (link2.ok) {
        bucketName = legacy;
        console.error(`Linked: ${bucketName}`);
      } else {
        die(`Could not link any storage bucket to Firebase.\n${JSON.stringify(link2.data)}`);
      }
    }
  }

  // 3. Create ruleset
  const rs = await call(
    "POST",
    `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
    token,
    {
      source: {
        files: [{ name: "storage.rules", content: rulesSource }],
      },
    }
  );
  console.error("Created ruleset:", rs.data.name);

  // 4. Release to firebase.storage/<bucket>
  const releaseId = `firebase.storage/${bucketName}`;
  const releaseName = `projects/${projectId}/releases/${encodeURIComponent(releaseId)}`;
  const get = await call(
    "GET",
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    token,
    null,
    { allowFail: true }
  );
  if (get.ok) {
    const upd = await call(
      "PATCH",
      `https://firebaserules.googleapis.com/v1/${releaseName}`,
      token,
      {
        release: {
          name: releaseName,
          rulesetName: rs.data.name,
        },
      }
    );
    console.error("Updated release ->", upd.data.rulesetName);
  } else {
    const created = await call(
      "POST",
      `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
      token,
      {
        name: releaseName,
        rulesetName: rs.data.name,
      }
    );
    console.error("Created release ->", created.data.rulesetName);
  }

  console.error("Done.");
})();
