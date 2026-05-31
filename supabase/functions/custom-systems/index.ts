// CRUD for custom systems stored in Google Sheets "systems_registry".
// Uses Service Account JWT to authenticate. Reads are public (no password).
// Writes require the control-panel password (validated against system_access_rules).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID") || "1vAuWBa1ERY0EYL2T-MMTO7MYM0yP7dGJP64dBCRMSzQ";
const SA_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FALLBACK_PASSWORD = "2021";

const HEADERS = [
  "id", "title", "description", "icon", "color",
  "sheet_gid", "columns_range", "filter_columns",
  "conditions_json", "derived_columns_json",
  "protected", "password", "hint", "enabled",
  "created_at", "updated_at",
  // v2 additions:
  "filters_config_json", "conditions_logic", "header_labels_json", "signatures_json",
];
const SHEET_TITLE = "systems_registry";

function clean(s: any) { return (s ?? "").toString().replace(/^\uFEFF/, "").trim(); }

/* ---------- Service Account JWT ---------- */
let cachedToken: { token: string; exp: number } | null = null;
function pemToBuf(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - 60 > Math.floor(Date.now() / 1000)) return cachedToken.token;
  if (!SA_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON غير مُهيأ");
  const sa = JSON.parse(SA_JSON);
  sa.private_key = String(sa.private_key || "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
    }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBuf(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}
async function gapi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function ensureSheet() {
  const meta = await gapi("?fields=sheets(properties(title))");
  const exists = (meta.sheets || []).some((s: any) => s.properties?.title === SHEET_TITLE);
  if (!exists) {
    await gapi(":batchUpdate", { method: "POST", body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: SHEET_TITLE } } }],
    })});
    await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [HEADERS] }),
    });
    return;
  }
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:Z1`);
  const currentRow: string[] = (r.values && r.values[0]) ? r.values[0].map((x: any) => String(x || "")) : [];
  if (currentRow.length === 0) {
    await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [HEADERS] }),
    });
    return;
  }
  // Extend header row if new columns are missing (preserve order of existing ones).
  const missing = HEADERS.filter((h) => !currentRow.includes(h));
  if (missing.length > 0) {
    const newRow = [...currentRow, ...missing];
    await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [newRow] }),
    });
  }
}

async function rangeForRow(rowIdx0: number) {
  const order = await getColOrder();
  const n = order.length || HEADERS.length;
  // Supports up to column ZZ
  const toLetter = (idx1: number) => {
    let n = idx1; let s = "";
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };
  const lastCol = toLetter(n);
  return `${SHEET_TITLE}!A${rowIdx0 + 2}:${lastCol}${rowIdx0 + 2}`;
}

let cachedColOrder: string[] | null = null;
async function getColOrder(): Promise<string[]> {
  if (cachedColOrder) return cachedColOrder;
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:Z1`);
  const row: string[] = (r.values && r.values[0]) ? r.values[0].map((x: any) => String(x || "").trim()) : HEADERS;
  cachedColOrder = row.length > 0 ? row : HEADERS;
  return cachedColOrder;
}

async function readAll(): Promise<Record<string, string>[]> {
  await ensureSheet();
  cachedColOrder = null; // re-read after ensureSheet (may have extended)
  const order = await getColOrder();
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A2:Z`);
  const rows = (r.values || []) as string[][];
  return rows
    .filter((row) => row.some((c) => clean(c)))
    .map((row) => {
      const obj: Record<string, string> = {};
      order.forEach((h, i) => { obj[h] = (row[i] ?? "").toString(); });
      return obj;
    });
}

function rowToSystem(r: Record<string, string>) {
  const parseJson = (v: string, fb: any) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
  return {
    id: clean(r.id),
    title: clean(r.title),
    description: clean(r.description),
    icon: clean(r.icon) || "📋",
    color: clean(r.color) || "#0891b2",
    sheet_gid: clean(r.sheet_gid),
    columns_range: clean(r.columns_range) || "F:N",
    filter_columns: clean(r.filter_columns),
    filters_config: parseJson(r.filters_config_json || "[]", []),
    conditions: parseJson(r.conditions_json || "[]", []),
    conditions_logic: (clean(r.conditions_logic) || "AND").toUpperCase() === "OR" ? "OR" : "AND",
    derived_columns: parseJson(r.derived_columns_json || "[]", []),
    header_labels: parseJson(r.header_labels_json || "{}", {}),
    signatures: parseJson(r.signatures_json || "[]", []),
    protected: String(r.protected || "").toLowerCase() === "true",
    password: clean(r.password),
    hint: clean(r.hint),
    enabled: String(r.enabled || "true").toLowerCase() !== "false",
  };
}

async function systemToRow(s: any): Promise<string[]> {
  const now = new Date().toISOString();
  const order = await getColOrder();
  const valByCol: Record<string, string> = {
    id: String(s.id || ""),
    title: String(s.title || ""),
    description: String(s.description || ""),
    icon: String(s.icon || "📋"),
    color: String(s.color || "#0891b2"),
    sheet_gid: String(s.sheet_gid || ""),
    columns_range: String(s.columns_range || "F:N"),
    filter_columns: String(s.filter_columns || ""),
    conditions_json: JSON.stringify(s.conditions || []),
    derived_columns_json: JSON.stringify(s.derived_columns || []),
    protected: String(!!s.protected),
    password: String(s.password || ""),
    hint: String(s.hint || ""),
    enabled: String(s.enabled === false ? "false" : "true"),
    created_at: String(s.created_at || now),
    updated_at: now,
    filters_config_json: JSON.stringify(s.filters_config || []),
    conditions_logic: String(s.conditions_logic || "AND").toUpperCase() === "OR" ? "OR" : "AND",
    header_labels_json: JSON.stringify(s.header_labels || {}),
    signatures_json: JSON.stringify(s.signatures || []),
  };
  return order.map((h) => valByCol[h] ?? "");
}

async function validatePassword(password: string): Promise<boolean> {
  let expected = FALLBACK_PASSWORD;
  try {
    if (SUPABASE_URL && SERVICE_ROLE) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
      const { data } = await admin.from("system_access_rules").select("rules").eq("id", "global").maybeSingle();
      const pw = (data?.rules as any)?.controlPanel?.password;
      if (typeof pw === "string" && pw.trim()) expected = pw;
    }
  } catch { /* fallback */ }
  return String(password || "") === expected;
}

function slugify(t: string): string {
  const s = (t || "").toString().trim().replace(/\s+/g, "_").replace(/[^\w\u0600-\u06FF]/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return (s || "system") + "_" + rand;
}

// In-memory cache for list action to avoid Google Sheets 429 quota errors.
let listCache: { at: number; payload: any } | null = null;
const LIST_TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "list");

    if (action === "list") {
      if (listCache && Date.now() - listCache.at < LIST_TTL_MS) {
        return json(listCache.payload);
      }
      try {
        const all = await readAll();
        const payload = { systems: all.map(rowToSystem) };
        listCache = { at: Date.now(), payload };
        return json(payload);
      } catch (e) {
        // On rate-limit or transient error, serve stale cache if any.
        if (listCache) return json(listCache.payload);
        return json({ systems: [], error: (e as Error).message }, 200);
      }
    }

    // Write actions
    if (!(await validatePassword(String(body?.password || "")))) {
      return json({ error: "كلمة المرور غير صحيحة" }, 401);
    }

    if (action === "save") {
      const sys = body?.system || {};
      if (!sys.title) return json({ error: "العنوان مطلوب" }, 400);
      if (!sys.sheet_gid) return json({ error: "GID للورقة المصدر مطلوب" }, 400);
      const all = await readAll();
      if (!sys.id) sys.id = slugify(sys.title);
      const idx = all.findIndex((r) => clean(r.id) === clean(sys.id));
      if (idx >= 0) {
        sys.created_at = clean(all[idx].created_at) || new Date().toISOString();
        await gapi(`/values/${encodeURIComponent(rangeForRow(idx))}?valueInputOption=RAW`, {
          method: "PUT", body: JSON.stringify({ values: [systemToRow(sys)] }),
        });
      } else {
        await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: "POST", body: JSON.stringify({ values: [systemToRow(sys)] }),
        });
      }
      listCache = null;
      return json({ ok: true, id: sys.id });
    }

    if (action === "delete") {
      const id = clean(body?.id);
      if (!id) return json({ error: "id مطلوب" }, 400);
      const all = await readAll();
      const idx = all.findIndex((r) => clean(r.id) === id);
      if (idx < 0) return json({ ok: true });
      const meta = await gapi("?fields=sheets(properties(sheetId,title))");
      const sheet = (meta.sheets || []).find((s: any) => s.properties?.title === SHEET_TITLE);
      if (!sheet) return json({ error: "ورقة systems_registry غير موجودة" }, 500);
      await gapi(":batchUpdate", { method: "POST", body: JSON.stringify({
        requests: [{ deleteDimension: { range: {
          sheetId: sheet.properties.sheetId, dimension: "ROWS",
          startIndex: idx + 1, endIndex: idx + 2,
        }}}],
      })});
      listCache = null;
      return json({ ok: true });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
