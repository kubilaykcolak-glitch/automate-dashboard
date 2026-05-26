// One-shot helper: uses the Firebase Admin service account to fetch (or create)
// the Firebase Web App config, then prints it as KEY=VALUE lines on stdout.
// Run: node scripts/fetch-firebase-config.mjs <path-to-service-account.json>

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

function die(msg, extra) {
  console.error("FATAL:", msg);
  if (extra) console.error(extra);
  process.exit(1);
}

const saPath = process.argv[2];
if (!saPath) die("Usage: node fetch-firebase-config.mjs <service-account.json>");
const sa = JSON.parse(fs.readFileSync(path.resolve(saPath), "utf8"));
const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = sa;
if (!projectId || !clientEmail || !privateKey) die("Service account JSON is missing required fields.");

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/cloud-platform",
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

async function api(method, urlPath, token, body) {
  const res = await fetch(`https://firebase.googleapis.com${urlPath}`, {
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
  if (!res.ok) die(`API ${method} ${urlPath} failed (${res.status})`, JSON.stringify(parsed));
  return parsed;
}

async function pollOperation(opName, token) {
  for (let i = 0; i < 30; i++) {
    const op = await api("GET", `/v1beta1/${opName}`, token);
    if (op.done) {
      if (op.error) die("Operation errored", JSON.stringify(op.error));
      return op.response;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  die(`Operation ${opName} timed out`);
}

(async () => {
  const token = await getAccessToken();
  const listed = await api("GET", `/v1beta1/projects/${projectId}/webApps`, token);
  let appId;
  if (listed.apps && listed.apps.length > 0) {
    appId = listed.apps[0].appId;
    console.error(`Using existing Web App: ${appId}`);
  } else {
    console.error("No Web App found — creating one…");
    const op = await api("POST", `/v1beta1/projects/${projectId}/webApps`, token, {
      displayName: "automate-dashboard",
    });
    const created = await pollOperation(op.name, token);
    appId = created.appId;
    console.error(`Created Web App: ${appId}`);
  }

  // appId in the config endpoint uses the bare ID; the listed object exposes it directly.
  const cfg = await api("GET", `/v1beta1/projects/${projectId}/webApps/${appId}/config`, token);

  const out = {
    NEXT_PUBLIC_FIREBASE_API_KEY: cfg.apiKey ?? "",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: cfg.authDomain ?? `${projectId}.firebaseapp.com`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: cfg.projectId ?? projectId,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: cfg.storageBucket ?? `${projectId}.appspot.com`,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: cfg.messagingSenderId ?? "",
    NEXT_PUBLIC_FIREBASE_APP_ID: cfg.appId ?? appId,
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
})();
