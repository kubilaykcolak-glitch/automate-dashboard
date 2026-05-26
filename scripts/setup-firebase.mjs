// Idempotent provisioning of Firebase auth providers and Firestore database
// for an existing project, using the Firebase Admin service account JSON.
//
// Run: node scripts/setup-firebase.mjs <path-to-service-account.json>

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

function die(msg, extra) {
  console.error("FATAL:", msg);
  if (extra) console.error(extra);
  process.exit(1);
}

const saPath = process.argv[2];
if (!saPath) die("Usage: node setup-firebase.mjs <service-account.json>");
const sa = JSON.parse(fs.readFileSync(path.resolve(saPath), "utf8"));
const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = sa;

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
        "https://www.googleapis.com/auth/identitytoolkit",
        "https://www.googleapis.com/auth/datastore",
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
  return { ok: res.ok, status: res.status, data: parsed };
}

async function ensureIdentityToolkit(token) {
  // Identity Toolkit "config" lives at projects/{projectId}/config
  // Update the config to enable email/password sign-in.
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=signIn.email`;
  const body = {
    signIn: {
      email: { enabled: true, passwordRequired: true },
    },
  };
  const res = await call("PATCH", url, token, body);
  if (!res.ok) {
    if (res.status === 404) {
      // Identity platform not initialised yet — try to enable Firebase Auth (legacy)
      console.error("Identity Platform config not found; this project may need Firebase Auth initialised manually once.");
    }
    console.error(`identitytoolkit PATCH -> ${res.status}`, JSON.stringify(res.data).slice(0, 400));
  } else {
    console.error("Email/password sign-in: enabled");
  }
}

async function ensureFirestoreDatabase(token) {
  // Default Firestore database id is "(default)".
  // Check if it exists; if not, create it in Native mode in a default location.
  const getUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;
  const got = await call("GET", getUrl, token);
  if (got.ok) {
    console.error(`Firestore database (default) already exists in ${got.data.locationId ?? "unknown"} mode=${got.data.type ?? "unknown"}`);
    return;
  }
  console.error("Firestore database not found; creating in nam5…");
  const createUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases?databaseId=(default)`;
  const body = {
    type: "FIRESTORE_NATIVE",
    locationId: "nam5",
  };
  const created = await call("POST", createUrl, token, body);
  if (!created.ok) {
    console.error("Failed to create Firestore", JSON.stringify(created.data).slice(0, 400));
  } else {
    console.error("Firestore database creation submitted (may take ~30s to finish)");
  }
}

async function authorizeLocalhost(token) {
  // Add localhost + project's default hosting domain to authorized domains.
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains`;
  // Read current config first so we don't clobber.
  const cur = await call("GET", `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, token);
  if (!cur.ok) {
    console.error(`Could not read auth config to merge authorized domains (${cur.status})`);
    return;
  }
  const existing = new Set(cur.data.authorizedDomains ?? []);
  ["localhost", `${projectId}.firebaseapp.com`, `${projectId}.web.app`].forEach((d) => existing.add(d));
  const body = { authorizedDomains: [...existing] };
  const res = await call("PATCH", url, token, body);
  if (!res.ok) {
    console.error(`authorizedDomains PATCH -> ${res.status}`, JSON.stringify(res.data).slice(0, 400));
  } else {
    console.error(`Authorized domains: ${[...existing].join(", ")}`);
  }
}

(async () => {
  const token = await getAccessToken();
  await ensureIdentityToolkit(token);
  await authorizeLocalhost(token);
  await ensureFirestoreDatabase(token);
  console.error("Done.");
})();
