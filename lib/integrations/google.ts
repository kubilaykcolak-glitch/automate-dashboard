import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { encrypt } from "./crypto";
import { loadTokens } from "./store";

/**
 * Google integration runtime — token refresh + thin API wrappers.
 *
 * Agents call these from the chat route's tool loop. The caller never
 * touches the raw OAuth credentials; this module is the only thing that
 * decrypts the stored access_token, refreshes it when expired, and writes
 * the new value back to /users/{uid}/integration_tokens/google.
 *
 * Errors are typed (codes below) so the chat route can map them to clear
 * tool_result messages the agent understands.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";
/** Refresh slightly before the stored expiry to avoid 401 races. */
const REFRESH_SKEW_MS = 60_000;

export type GoogleErrorCode =
  | "not_connected"
  | "no_refresh_token"
  | "refresh_failed"
  | "missing_client_credentials"
  | "api_error";

export class GoogleIntegrationError extends Error {
  code: GoogleErrorCode;
  status?: number;
  constructor(code: GoogleErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "GoogleIntegrationError";
  }
}

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

/**
 * Returns a valid Google access token for the user. Refreshes via the
 * stored refresh_token if the current one is expired (or close enough to
 * expiry that calling Google would race). Writes the new token + expiry
 * back to Firestore so the next caller doesn't refresh again.
 */
export async function getValidGoogleAccessToken(uid: string): Promise<string> {
  const stored = await loadTokens(uid, "google");
  if (!stored) {
    throw new GoogleIntegrationError(
      "not_connected",
      "Google is not connected for this user. Ask them to connect via /dashboard/integrations."
    );
  }

  const now = Date.now();
  const expiresAt = stored.expiresAt ?? 0;
  const expired = !expiresAt || expiresAt - REFRESH_SKEW_MS <= now;
  if (!expired) return stored.accessToken;

  if (!stored.refreshToken) {
    throw new GoogleIntegrationError(
      "no_refresh_token",
      "Stored Google token is expired and no refresh_token is on file. Ask the user to reconnect Google via /dashboard/integrations."
    );
  }

  return refreshAndStore(uid, stored.refreshToken);
}

async function refreshAndStore(
  uid: string,
  refreshToken: string
): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GoogleIntegrationError(
      "missing_client_credentials",
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set on the server."
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const text = await res.text();
  let json: RefreshResponse;
  try {
    json = JSON.parse(text) as RefreshResponse;
  } catch {
    throw new GoogleIntegrationError(
      "refresh_failed",
      `Google token endpoint returned non-JSON: ${text.slice(0, 200)}`,
      res.status
    );
  }
  if (!res.ok || !json.access_token) {
    const msg =
      json.error_description ?? json.error ?? `HTTP ${res.status}`;
    throw new GoogleIntegrationError(
      "refresh_failed",
      `Google refresh failed: ${msg}`,
      res.status
    );
  }

  const accessToken = json.access_token;
  const expiresAt =
    typeof json.expires_in === "number"
      ? Date.now() + json.expires_in * 1000
      : undefined;

  // Persist the refreshed access token + new expiry. The refresh_token
  // itself usually stays the same — Google sometimes rotates it; if a new
  // one came back, capture it too.
  const tokenRef = adminDb
    .collection("users")
    .doc(uid)
    .collection("integration_tokens")
    .doc("google");
  const update: Record<string, unknown> = {
    accessTokenCiphertext: encrypt(accessToken),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (expiresAt !== undefined) update.expiresAt = expiresAt;
  const rotatedRefresh = (json as { refresh_token?: string }).refresh_token;
  if (rotatedRefresh) {
    update.refreshTokenCiphertext = encrypt(rotatedRefresh);
  }
  await tokenRef.set(update, { merge: true });

  return accessToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drive API
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  /** Bytes; only present for non-Google native files. */
  size?: number;
}

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * Searches the user's Google Drive. Defaults to spreadsheets (the most
 * common use case for the accountancy agent); pass `mimeType: null` to
 * search every file type.
 */
export async function googleDriveSearch(
  uid: string,
  params: {
    query: string;
    mimeType?: string | null;
    limit?: number;
  }
): Promise<{ files: DriveFile[] }> {
  const accessToken = await getValidGoogleAccessToken(uid);
  const mimeType =
    params.mimeType === undefined ? SHEET_MIME : params.mimeType;
  const limit = Math.min(50, Math.max(1, params.limit ?? 10));

  // Drive query syntax: `name contains 'x' and mimeType = 'y' and trashed = false`
  const escaped = params.query.replace(/'/g, "\\'");
  const qParts = [
    `name contains '${escaped}'`,
    "trashed = false",
  ];
  if (mimeType) qParts.push(`mimeType = '${mimeType}'`);
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", qParts.join(" and "));
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,modifiedTime,webViewLink,size)"
  );
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("orderBy", "modifiedTime desc");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleIntegrationError(
      "api_error",
      `Drive search failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      res.status
    );
  }
  const data = (await res.json()) as { files?: DriveFile[] };
  return { files: data.files ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets API
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetTabSummary {
  /** Tab title — used as the prefix in A1 notation, e.g. "Sheet1!A1:Z1000". */
  title: string;
  sheetId: number;
  rowCount?: number;
  columnCount?: number;
}

export interface SheetReadResult {
  /** Echoes back what was actually read. Useful when the caller asked for the default range. */
  range: string;
  /** 2D array of cell values. Empty when the range is empty. */
  values: (string | number | boolean)[][];
  /** How many rows were truncated due to cap, if any. */
  truncatedRows: number;
}

/** Cap rows we return to the agent. 1000 rows of a 10-column sheet is
 *  already ~50K tokens of CSV-ish text — past that the agent can't reason
 *  effectively anyway. Agent can re-call with a tighter range if needed. */
const SHEET_ROW_CAP = 1000;

/** Returns the tab titles of a spreadsheet so the agent can pick which to read. */
export async function googleSheetsListTabs(
  uid: string,
  spreadsheetId: string
): Promise<{ title: string; tabs: SheetTabSummary[] }> {
  const accessToken = await getValidGoogleAccessToken(uid);
  const url = `${SHEETS_API}/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties(title,sheetId,gridProperties)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleIntegrationError(
      "api_error",
      `Sheets metadata failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      res.status
    );
  }
  const data = (await res.json()) as {
    properties?: { title?: string };
    sheets?: Array<{
      properties?: {
        title?: string;
        sheetId?: number;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }>;
  };
  const tabs: SheetTabSummary[] = (data.sheets ?? [])
    .map((s) => s.properties)
    .filter(
      (p): p is NonNullable<typeof p> => !!p && typeof p.title === "string"
    )
    .map((p) => ({
      title: p.title!,
      sheetId: p.sheetId ?? 0,
      rowCount: p.gridProperties?.rowCount,
      columnCount: p.gridProperties?.columnCount,
    }));
  return { title: data.properties?.title ?? "Untitled", tabs };
}

/** Reads cell values from a spreadsheet. `range` defaults to the first tab. */
export async function googleSheetsRead(
  uid: string,
  params: { spreadsheetId: string; range?: string }
): Promise<SheetReadResult> {
  const accessToken = await getValidGoogleAccessToken(uid);

  // If no range given, list tabs and read the first one up to SHEET_ROW_CAP.
  let range = params.range;
  if (!range) {
    const { tabs } = await googleSheetsListTabs(uid, params.spreadsheetId);
    const first = tabs[0];
    if (!first) {
      return { range: "", values: [], truncatedRows: 0 };
    }
    range = `${first.title}!A1:Z${SHEET_ROW_CAP}`;
  }

  const url = `${SHEETS_API}/spreadsheets/${encodeURIComponent(
    params.spreadsheetId
  )}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GoogleIntegrationError(
      "api_error",
      `Sheets read failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      res.status
    );
  }
  const data = (await res.json()) as {
    range?: string;
    values?: (string | number | boolean)[][];
  };
  const rows = data.values ?? [];
  const truncatedRows =
    rows.length > SHEET_ROW_CAP ? rows.length - SHEET_ROW_CAP : 0;
  return {
    range: data.range ?? range,
    values: rows.slice(0, SHEET_ROW_CAP),
    truncatedRows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers used by the chat route
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight check the chat route uses to decide whether to register the
 * Google tools at all. Returns true iff a connected token doc exists.
 * (Doesn't decrypt — cheap.)
 */
export async function userHasGoogleConnected(uid: string): Promise<boolean> {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("integration_tokens")
    .doc("google")
    .get();
  return snap.exists;
}

