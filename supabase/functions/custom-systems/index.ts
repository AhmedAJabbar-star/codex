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
  // v3 additions:
  "sort_order",
  // v4 additions:
  "sheet_source", "sheet_url", "require_teacher_auth",
  // v5 additions:
  "teacher_column", "crud_enabled", "column_types_json", "column_options_json",
  // v6 additions:
  "column_select_source_json", "column_select_allow_custom_json",
  "crud_permissions_json",
  "teacher_department_column", "teacher_filter_scope",
  "required_filters_json", "quick_filters_json",
  // v7 additions:
  "print_prefs_json",
  // v8 additions:
  "column_link_labels_json",
  // v9 additions (OCR):
  "ocr_enabled", "ocr_prompt", "ocr_fields_json",
  // v15 additions (extract text of uploaded files into a neighbouring column):
  "ocr_text_enabled", "ocr_text_targets_json", "ocr_text_prompt",
  // v10 additions (advanced power features):
  "row_rules_json", "aggregations_json", "global_search",
  // v11 additions (Google Drive uploads):
  "drive_folder_id", "column_drive_folders_json",
  // v12 additions (per-system UI theme):
  "ui_theme",
  // v13 additions (bulk Excel import + duplicate prevention):
  "bulk_import_enabled", "dedupe_enabled", "dedupe_columns_json",
  "dedupe_key_column", "dedupe_separator",
  // v14 additions (identity scoping, single response, option limits,
  // linked systems, audit columns, delete archiving, QR input):
  "teacher_college_column", "teacher_scope_criteria_json", "teacher_scope_logic",
  "single_response_enabled", "single_response_column", "single_response_allow_edit",
  "option_limits_json", "linked_systems_json",
  "audit_enabled", "audit_created_by_column", "audit_created_at_column",
  "audit_updated_by_column", "audit_updated_at_column",
  "archive_enabled", "archive_sheet_url", "archive_gid",
  "qr_enabled", "qr_fields_json",
  // v16 additions (advanced processing engine + hidden helper columns):
  "computed_columns_json", "group_stage_json", "conflict_detector_json",
  "hidden_columns",

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
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:AZ1`);
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
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:AZ1`);
  const row: string[] = (r.values && r.values[0]) ? r.values[0].map((x: any) => String(x || "").trim()) : HEADERS;
  cachedColOrder = row.length > 0 ? row : HEADERS;
  return cachedColOrder;
}

async function readAll(): Promise<Record<string, string>[]> {
  await ensureSheet();
  cachedColOrder = null; // re-read after ensureSheet (may have extended)
  const order = await getColOrder();
  const r = await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A2:AZ`);
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
    sort_order: Number.parseInt(clean(r.sort_order) || "100", 10) || 100,
    sheet_source: (clean(r.sheet_source).toLowerCase() === "external") ? "external" : "current",
    sheet_url: clean(r.sheet_url),
    require_teacher_auth: String(r.require_teacher_auth || "").toLowerCase() === "true",
    teacher_column: clean(r.teacher_column).toUpperCase(),
    teacher_department_column: clean(r.teacher_department_column).toUpperCase(),
    teacher_filter_scope: (["name","department","name_or_department","all"].includes(clean(r.teacher_filter_scope)) ? clean(r.teacher_filter_scope) : "name"),
    crud_enabled: String(r.crud_enabled || "").toLowerCase() === "true",
    crud_permissions: parseJson(r.crud_permissions_json || "null", null),
    column_types: parseJson(r.column_types_json || "{}", {}),
    column_options: parseJson(r.column_options_json || "{}", {}),
    column_select_source: parseJson(r.column_select_source_json || "{}", {}),
    column_select_allow_custom: parseJson(r.column_select_allow_custom_json || "{}", {}),
    required_filters: parseJson(r.required_filters_json || "[]", []),
    quick_filters: parseJson(r.quick_filters_json || "[]", []),
    print_prefs: parseJson(r.print_prefs_json || "null", undefined) || undefined,
    column_link_labels: parseJson(r.column_link_labels_json || "{}", {}),
    ocr_enabled: String(r.ocr_enabled || "").toLowerCase() === "true",
    ocr_prompt: clean(r.ocr_prompt),
    ocr_fields: parseJson(r.ocr_fields_json || "[]", []),
    ocr_text_enabled: String(r.ocr_text_enabled || "").toLowerCase() === "true",
    ocr_text_targets: parseJson(r.ocr_text_targets_json || "{}", {}),
    ocr_text_prompt: clean(r.ocr_text_prompt),
    row_rules: parseJson(r.row_rules_json || "[]", []),
    aggregations: parseJson(r.aggregations_json || "[]", []),
    global_search: String(r.global_search || "").toLowerCase() === "true",
    drive_folder_id: clean(r.drive_folder_id),
    column_drive_folders: parseJson(r.column_drive_folders_json || "{}", {}),
    ui_theme: clean(r.ui_theme),
    bulk_import_enabled: String(r.bulk_import_enabled || "").toLowerCase() === "true",
    dedupe_enabled: String(r.dedupe_enabled || "").toLowerCase() === "true",
    dedupe_columns: parseJson(r.dedupe_columns_json || "[]", []),
    dedupe_key_column: clean(r.dedupe_key_column).toUpperCase(),
    dedupe_separator: r.dedupe_separator === undefined || r.dedupe_separator === "" ? "|" : String(r.dedupe_separator),
    teacher_college_column: clean(r.teacher_college_column).toUpperCase(),
    teacher_scope_criteria: parseJson(r.teacher_scope_criteria_json || "[]", []),
    teacher_scope_logic: clean(r.teacher_scope_logic) === "all" ? "all" : "any",
    single_response_enabled: String(r.single_response_enabled || "").toLowerCase() === "true",
    single_response_column: clean(r.single_response_column).toUpperCase(),
    single_response_allow_edit: String(r.single_response_allow_edit || "true").toLowerCase() !== "false",
    option_limits: parseJson(r.option_limits_json || "{}", {}),
    linked_systems: parseJson(r.linked_systems_json || "[]", []),
    audit_enabled: String(r.audit_enabled || "").toLowerCase() === "true",
    audit_created_by_column: clean(r.audit_created_by_column).toUpperCase(),
    audit_created_at_column: clean(r.audit_created_at_column).toUpperCase(),
    audit_updated_by_column: clean(r.audit_updated_by_column).toUpperCase(),
    audit_updated_at_column: clean(r.audit_updated_at_column).toUpperCase(),
    archive_enabled: String(r.archive_enabled || "").toLowerCase() === "true",
    archive_sheet_url: clean(r.archive_sheet_url),
    archive_gid: clean(r.archive_gid),
    qr_enabled: String(r.qr_enabled || "").toLowerCase() === "true",
    qr_fields: parseJson(r.qr_fields_json || "[]", []),
    computed_columns: parseJson(r.computed_columns_json || "[]", []),
    group_stage: parseJson(r.group_stage_json || "null", null),
    conflict_detector: parseJson(r.conflict_detector_json || "null", null),
    hidden_columns: clean(r.hidden_columns),
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
    sort_order: String(Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 100),
    sheet_source: (s.sheet_source === "external") ? "external" : "current",
    sheet_url: String(s.sheet_url || ""),
    require_teacher_auth: String(!!s.require_teacher_auth),
    teacher_column: String(s.teacher_column || "").toUpperCase(),
    teacher_department_column: String(s.teacher_department_column || "").toUpperCase(),
    teacher_filter_scope: (["name","department","name_or_department","all"].includes(String(s.teacher_filter_scope || "")) ? String(s.teacher_filter_scope) : "name"),
    crud_enabled: String(!!s.crud_enabled),
    crud_permissions_json: JSON.stringify(s.crud_permissions ?? null),
    column_types_json: JSON.stringify(s.column_types || {}),
    column_options_json: JSON.stringify(s.column_options || {}),
    column_select_source_json: JSON.stringify(s.column_select_source || {}),
    column_select_allow_custom_json: JSON.stringify(s.column_select_allow_custom || {}),
    required_filters_json: JSON.stringify(s.required_filters || []),
    quick_filters_json: JSON.stringify(s.quick_filters || []),
    print_prefs_json: (s.print_prefs && Object.keys(s.print_prefs).length > 0) ? JSON.stringify(s.print_prefs) : "",
    column_link_labels_json: JSON.stringify(s.column_link_labels || {}),
    ocr_enabled: String(!!s.ocr_enabled),
    ocr_prompt: String(s.ocr_prompt || ""),
    ocr_fields_json: JSON.stringify(s.ocr_fields || []),
    ocr_text_enabled: String(!!s.ocr_text_enabled),
    ocr_text_targets_json: JSON.stringify(s.ocr_text_targets || {}),
    ocr_text_prompt: String(s.ocr_text_prompt || ""),
    row_rules_json: JSON.stringify(s.row_rules || []),
    aggregations_json: JSON.stringify(s.aggregations || []),
    global_search: String(!!s.global_search),
    drive_folder_id: String(s.drive_folder_id || ""),
    column_drive_folders_json: JSON.stringify(s.column_drive_folders || {}),
    ui_theme: String(s.ui_theme || ""),
    bulk_import_enabled: String(!!s.bulk_import_enabled),
    dedupe_enabled: String(!!s.dedupe_enabled),
    dedupe_columns_json: JSON.stringify((s.dedupe_columns || []).map((x: any) => String(x || "").toUpperCase())),
    dedupe_key_column: String(s.dedupe_key_column || "").toUpperCase(),
    dedupe_separator: String(s.dedupe_separator ?? "|"),
    teacher_college_column: String(s.teacher_college_column || "").toUpperCase(),
    teacher_scope_criteria_json: JSON.stringify(s.teacher_scope_criteria || []),
    teacher_scope_logic: String(s.teacher_scope_logic || "any") === "all" ? "all" : "any",
    single_response_enabled: String(!!s.single_response_enabled),
    single_response_column: String(s.single_response_column || "").toUpperCase(),
    single_response_allow_edit: String(s.single_response_allow_edit === false ? "false" : "true"),
    option_limits_json: JSON.stringify(s.option_limits || {}),
    linked_systems_json: JSON.stringify(s.linked_systems || []),
    audit_enabled: String(!!s.audit_enabled),
    audit_created_by_column: String(s.audit_created_by_column || "").toUpperCase(),
    audit_created_at_column: String(s.audit_created_at_column || "").toUpperCase(),
    audit_updated_by_column: String(s.audit_updated_by_column || "").toUpperCase(),
    audit_updated_at_column: String(s.audit_updated_at_column || "").toUpperCase(),
    archive_enabled: String(!!s.archive_enabled),
    archive_sheet_url: String(s.archive_sheet_url || ""),
    archive_gid: String(s.archive_gid || ""),
    qr_enabled: String(!!s.qr_enabled),
    qr_fields_json: JSON.stringify(s.qr_fields || []),
    computed_columns_json: JSON.stringify(s.computed_columns || []),
    group_stage_json: (s.group_stage && (s.group_stage.keys || []).length > 0) ? JSON.stringify(s.group_stage) : "",
    conflict_detector_json: (s.conflict_detector && (s.conflict_detector.group_by || []).length > 0) ? JSON.stringify(s.conflict_detector) : "",
    hidden_columns: String(s.hidden_columns || "").toUpperCase(),
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

/** Sentinel sent to the browser instead of a stored password. */
const KEEP = "__KEEP_EXISTING__";
/** Never expose a system password to the client. */
const maskSystem = (s: any) => ({ ...s, password: s?.password ? KEEP : "" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "list");

    if (action === "list") {
      const noCache = body?.no_cache === true || String(body?.no_cache || "").toLowerCase() === "true";
      if (!noCache && listCache && Date.now() - listCache.at < LIST_TTL_MS) {
        return json(listCache.payload);
      }
      try {
        const all = await readAll();
        const payload = { systems: all.map(rowToSystem).map(maskSystem) };
        listCache = { at: Date.now(), payload };
        return json(payload);
      } catch (e) {
        // On rate-limit or transient error, serve stale cache if any.
        if (listCache) return json(listCache.payload);
        return json({ systems: [], error: (e as Error).message }, 200);
      }
    }

    // Server-side password check for a protected custom system.
    if (action === "verify") {
      const id = clean(body?.id);
      if (!id) return json({ error: "id مطلوب" }, 400);
      const all = await readAll();
      const row = all.find((r) => clean(r.id) === id);
      if (!row) return json({ ok: false });
      const expected = String((rowToSystem(row) as any).password || "");
      return json({ ok: !expected || String(body?.password || "") === expected });
    }

    // Write actions
    if (!(await validatePassword(String(body?.password || "")))) {
      return json({ error: "كلمة المرور غير صحيحة" }, 401);
    }


    if (action === "save") {
      const sys = body?.system || {};
      const originalId = clean(body?.original_id || "");
      if (!sys.title) return json({ error: "العنوان مطلوب" }, 400);
      if (!sys.sheet_gid) return json({ error: "GID للورقة المصدر مطلوب" }, 400);
      // Sanitize only newly typed / changed slugs. Preserve legacy Arabic IDs when editing
      // an existing system whose URL was created before the English slug field existed.
      const rawId = String(sys.id || "");
      if (sys.id && !(originalId && rawId === originalId)) {
        sys.id = String(sys.id).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      }
      const all = await readAll();
      if (!sys.id) sys.id = slugify(sys.title);
      // Rename: locate row by originalId when it changed.
      const lookupId = originalId && originalId !== sys.id ? originalId : sys.id;
      // If renaming, ensure new id doesn't collide with another row.
      if (originalId && originalId !== sys.id) {
        const collision = all.findIndex((r) => clean(r.id) === clean(sys.id));
        if (collision >= 0) return json({ error: "اسم الرابط مستخدم لنظام آخر — اختر اسماً مختلفاً" }, 400);
      }
      const idx = all.findIndex((r) => clean(r.id) === clean(lookupId));
      // The client only ever sees a sentinel, so restore the stored password
      // whenever it comes back unchanged.
      if (String(sys.password || "") === KEEP) {
        sys.password = idx >= 0 ? String((rowToSystem(all[idx]) as any).password || "") : "";
      }
      if (idx >= 0) {

        sys.created_at = clean(all[idx].created_at) || new Date().toISOString();
        const rowVals = await systemToRow(sys);
        const range = await rangeForRow(idx);
        await gapi(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
          method: "PUT", body: JSON.stringify({ values: [rowVals] }),
        });
      } else {
        const rowVals = await systemToRow(sys);
        await gapi(`/values/${encodeURIComponent(SHEET_TITLE)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          method: "POST", body: JSON.stringify({ values: [rowVals] }),
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

    if (action === "sheet-write") {
      const op = String(body?.op || "");
      const gid = String(body?.gid || "");
      const externalUrl = String(body?.sheet_url || "").trim();
      const valuesByLetter = (body?.values || {}) as Record<string, string>;
      const matchByLetter = (body?.match || {}) as Record<string, string>;
      const bulkRows = Array.isArray(body?.rows) ? (body.rows as Record<string, string>[]) : [];
      const actor = String(body?.actor || "").trim();
      // Duplicate-prevention config is read from the system definition (server-side, authoritative).
      let dedupeCols: string[] = [];
      let dedupeEnabled = false;
      let dedupeTargetCol = "";
      let dedupeSep = "|";
      // v14 server-side rules
      let singleEnabled = false, singleCol = "";
      let optionLimits: Record<string, any> = {};
      let auditEnabled = false;
      let auditCreatedBy = "", auditCreatedAt = "", auditUpdatedBy = "", auditUpdatedAt = "";
      let archiveEnabled = false, archiveUrl = "", archiveGid = "";
      if (!gid) return json({ error: "GID مطلوب" }, 400);
      if (!["append", "bulk_append", "update", "delete"].includes(op)) return json({ error: "op غير مدعوم" }, 400);


      // Enforce per-system CRUD permissions (looks up the system by gid+url within registry).
      try {
        const all = await readAll();
        const candidates = all.map(rowToSystem).filter((s: any) => clean(s.sheet_gid) === gid && (
          (s.sheet_source === 'external' ? clean(s.sheet_url) === externalUrl : !externalUrl)
        ));
        const sys: any = candidates[0];
        if (sys) {
          const legacyAll = sys.crud_enabled === true && !sys.crud_permissions;
          const perms = sys.crud_permissions || {};
          const allow = {
            append: perms.add    ?? legacyAll,
            bulk_append: perms.add ?? legacyAll,
            update: perms.edit   ?? legacyAll,
            delete: perms.delete ?? legacyAll,
          } as Record<string, boolean>;

          if (!allow[op]) return json({ error: "هذه العملية غير مسموح بها لهذا النظام" }, 403);
          dedupeCols = (Array.isArray(sys.dedupe_columns) ? sys.dedupe_columns : [])
            .map((x: any) => String(x || "").toUpperCase().trim()).filter(Boolean);
          dedupeEnabled = !!sys.dedupe_enabled && dedupeCols.length > 0;
          dedupeTargetCol = String(sys.dedupe_key_column || "").toUpperCase().trim();
          dedupeSep = String(sys.dedupe_separator || "|");

          singleEnabled = !!sys.single_response_enabled;
          singleCol = String(sys.single_response_column || sys.teacher_column || "").toUpperCase().trim();
          optionLimits = (sys.option_limits && typeof sys.option_limits === "object") ? sys.option_limits : {};
          auditEnabled = !!sys.audit_enabled;
          auditCreatedBy = String(sys.audit_created_by_column || "").toUpperCase().trim();
          auditCreatedAt = String(sys.audit_created_at_column || "").toUpperCase().trim();
          auditUpdatedBy = String(sys.audit_updated_by_column || "").toUpperCase().trim();
          auditUpdatedAt = String(sys.audit_updated_at_column || "").toUpperCase().trim();
          archiveEnabled = !!sys.archive_enabled;
          archiveUrl = String(sys.archive_sheet_url || "").trim();
          archiveGid = String(sys.archive_gid || "").trim();
        }
      } catch { /* if registry lookup fails, fall through (password already validated) */ }

      // Resolve spreadsheet ID (external link OR project sheet)
      let spreadsheetId = SHEET_ID;
      if (externalUrl) {
        const m = externalUrl.match(/\/spreadsheets\/d\/([^/?#]+)/);
        if (m) spreadsheetId = m[1];
        else return json({ error: "رابط Google Sheets غير صالح (يجب أن يحتوي /spreadsheets/d/<ID>)" }, 400);
      }

      const gapiX = async (path: string, init: RequestInit = {}) => {
        const token = await getAccessToken();
        const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
        });
        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) throw new Error(`Sheets API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
        return data;
      };

      // Map gid -> sheet title (and numeric sheetId for delete)
      const meta = await gapiX("?fields=sheets(properties(sheetId,title))");
      const sheetMeta = (meta.sheets || []).find((s: any) => String(s.properties?.sheetId) === gid);
      if (!sheetMeta) return json({ error: `الورقة (gid=${gid}) غير موجودة في الملف` }, 404);
      const sheetTitle: string = sheetMeta.properties.title;
      const numericSheetId: number = sheetMeta.properties.sheetId;

      const letterToIdx = (L: string) => {
        let n = 0; const s = (L || "").toUpperCase();
        for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
        return n - 1;
      };
      const idxToLetter = (i1: number) => {
        let n = i1; let s = "";
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };

      // Read header row + all rows to determine width / find target row
      const data = await gapiX(`/values/${encodeURIComponent(sheetTitle)}!A1:ZZ`);
      const allRows: string[][] = (data.values || []).map((r: any[]) => (r || []).map((c) => String(c ?? "")));
      if (allRows.length === 0) return json({ error: "الورقة فارغة (لا توجد ترويسة)" }, 400);
      const header = allRows[0];
      const auditLetters = [auditCreatedBy, auditCreatedAt, auditUpdatedBy, auditUpdatedAt].filter(Boolean);
      const allLetters = new Set<string>([
        ...Object.keys(valuesByLetter),
        ...bulkRows.flatMap((r) => Object.keys(r || {})),
        ...(dedupeTargetCol ? [dedupeTargetCol] : []),
        ...(auditEnabled ? auditLetters : []),
      ]);
      const width = Math.max(header.length, ...Array.from(allLetters).map((L) => letterToIdx(L) + 1));
      const lastLetter = idxToLetter(width);

      const buildRowFromLetters = (base: string[], values: Record<string, string>): string[] => {
        const out: string[] = [];
        for (let i = 0; i < width; i++) out[i] = base[i] ?? "";
        Object.entries(values || {}).forEach(([L, v]) => {
          const idx = letterToIdx(L);
          if (idx >= 0 && idx < width) out[idx] = String(v ?? "");
        });
        return out;
      };

      // ---- Duplicate prevention helpers (join of one or more columns = composite ID) ----
      const normKey = (v: string) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      const keyOfValues = (values: Record<string, string>) =>
        dedupeCols.map((L) => normKey(values[L] || "")).join(dedupeSep);
      const keyOfSheetRow = (row: string[]) =>
        dedupeCols.map((L) => normKey(row[letterToIdx(L)] || "")).join(dedupeSep);
      const existingKeys = new Set<string>();
      if (dedupeEnabled) {
        for (let i = 1; i < allRows.length; i++) {
          const k = keyOfSheetRow(allRows[i]);
          if (k.replace(new RegExp(`\\${dedupeSep}`, "g"), "").trim()) existingKeys.add(k);
        }
      }
      const applyKeyColumn = (values: Record<string, string>) => {
        if (!dedupeTargetCol || dedupeCols.length === 0) return values;
        return { ...values, [dedupeTargetCol]: dedupeCols.map((L) => String(values[L] ?? "").trim()).join(dedupeSep) };
      };

      // ---- v14: audit stamps, single response, option capacity, delete archiving ----
      const nowStamp = () => {
        try {
          const d = new Date();
          const fmt = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Baghdad", year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", hour12: true,
          }).formatToParts(d).reduce((a: any, p) => (a[p.type] = p.value, a), {} as any);
          return `${fmt.year}-${fmt.month}-${fmt.day} ${fmt.hour}:${fmt.minute} ${String(fmt.dayPeriod || "").toUpperCase()}`;
        } catch { return new Date().toISOString(); }
      };
      const stampCreate = (values: Record<string, string>) => {
        if (!auditEnabled) return values;
        const out = { ...values };
        const t = nowStamp();
        if (auditCreatedBy) out[auditCreatedBy] = actor || out[auditCreatedBy] || "";
        if (auditCreatedAt) out[auditCreatedAt] = t;
        if (auditUpdatedBy) out[auditUpdatedBy] = actor || "";
        if (auditUpdatedAt) out[auditUpdatedAt] = t;
        return out;
      };
      const stampUpdate = (values: Record<string, string>) => {
        if (!auditEnabled) return values;
        const out = { ...values };
        if (auditUpdatedBy) out[auditUpdatedBy] = actor || "";
        if (auditUpdatedAt) out[auditUpdatedAt] = nowStamp();
        // never let the client overwrite creation stamps
        if (auditCreatedBy) delete out[auditCreatedBy];
        if (auditCreatedAt) delete out[auditCreatedAt];
        return out;
      };
      /** Count how many data rows already use `value` in column `L`. */
      const countOption = (L: string, value: string, skipRowIdx = -1) => {
        const idx = letterToIdx(L);
        let n = 0;
        for (let i = 1; i < allRows.length; i++) {
          if (i - 1 === skipRowIdx) continue;
          if (normKey(allRows[i][idx] || "") === normKey(value)) n++;
        }
        return n;
      };
      /** Returns an error message when a chosen option has reached its capacity. */
      const checkOptionLimits = (values: Record<string, string>, skipRowIdx = -1): string | null => {
        for (const [L, cfgRaw] of Object.entries(optionLimits || {})) {
          const cfg: any = cfgRaw || {};
          const val = String(values[L] ?? "").trim();
          if (!val) continue;
          const cap = Number(cfg?.per?.[val] ?? cfg?.limit ?? 0);
          if (!cap || cap <= 0) continue;
          if (countOption(L, val, skipRowIdx) >= cap) {
            return `الخيار «${val}» اكتمل العدد المسموح به (${cap}). يرجى اختيار خيار آخر.`;
          }
        }
        return null;
      };

      if (op === "append" && singleEnabled && singleCol) {
        const me = normKey(actor || valuesByLetter[singleCol] || "");
        if (!me) return json({ error: "يجب تسجيل الدخول قبل إضافة سجل في هذا النظام" }, 403);
        const idx = letterToIdx(singleCol);
        const already = allRows.slice(1).some((r) => normKey(r[idx] || "") === me);
        if (already) return json({ error: "لقد قمت بإرسال سجل مسبقاً — يُسمح بسجل واحد فقط لكل مستخدم" }, 409);
      }

      if (op === "append") {
        const limitErr = checkOptionLimits(valuesByLetter);
        if (limitErr) return json({ error: limitErr }, 409);
        if (dedupeEnabled && existingKeys.has(keyOfValues(valuesByLetter))) {
          return json({ error: "سجل مكرّر: توجد بيانات بنفس المفتاح (" + dedupeCols.join(" + ") + ")" }, 409);
        }
        const row = buildRowFromLetters([], stampCreate(applyKeyColumn(valuesByLetter)));
        await gapiX(`/values/${encodeURIComponent(sheetTitle)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
          method: "POST",
          body: JSON.stringify({ values: [row] }),
        });
        return json({ ok: true });
      }

      if (op === "bulk_append") {
        if (bulkRows.length === 0) return json({ error: "لا توجد صفوف للاستيراد" }, 400);
        if (bulkRows.length > 5000) return json({ error: "الحد الأقصى 5000 صف في الدفعة الواحدة" }, 400);
        const out: string[][] = [];
        let dupSheet = 0, dupFile = 0;
        const batchKeys = new Set<string>();
        for (const r of bulkRows) {
          const vals = r || {};
          if (dedupeEnabled) {
            const k = keyOfValues(vals);
            if (existingKeys.has(k)) { dupSheet++; continue; }
            if (batchKeys.has(k)) { dupFile++; continue; }
            batchKeys.add(k);
          }
          out.push(buildRowFromLetters([], stampCreate(applyKeyColumn(vals))));
        }
        // Write in chunks so very large imports do not exceed API limits.
        const CHUNK = 500;
        for (let i = 0; i < out.length; i += CHUNK) {
          await gapiX(`/values/${encodeURIComponent(sheetTitle)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
            method: "POST",
            body: JSON.stringify({ values: out.slice(i, i + CHUNK) }),
          });
        }
        return json({ ok: true, inserted: out.length, skipped_existing: dupSheet, skipped_in_file: dupFile });
      }


      // Locate target row by matching `match` snapshot against original sheet rows.
      const matchLetters = Object.keys(matchByLetter);
      if (matchLetters.length === 0) return json({ error: "يلزم بيانات لتحديد الصف (match)" }, 400);
      let targetIdx = -1; // 0-based among data rows (after header)
      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        let ok = true;
        for (const L of matchLetters) {
          const idx = letterToIdx(L);
          const cell = String(row[idx] ?? "").trim();
          const expected = String(matchByLetter[L] ?? "").trim();
          if (cell !== expected) { ok = false; break; }
        }
        if (ok) { targetIdx = i - 1; break; }
      }
      if (targetIdx < 0) return json({ error: "لم يُعثر على الصف المطلوب (قد يكون عُدِّل من جانب آخر — أعد التحميل وحاول مجدداً)" }, 404);

      if (op === "delete") {
        // Archive the row (with who/when) before removing it, when enabled.
        if (archiveEnabled && archiveGid) {
          try {
            let archiveSpreadsheetId = spreadsheetId;
            if (archiveUrl) {
              const m = archiveUrl.match(/\/spreadsheets\/d\/([^/?#]+)/);
              if (m) archiveSpreadsheetId = m[1];
            }
            const token = await getAccessToken();
            const gapiA = async (path: string, init: RequestInit = {}) => {
              const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${archiveSpreadsheetId}${path}`, {
                ...init,
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
              });
              const t = await res.text();
              if (!res.ok) throw new Error(`Sheets API ${res.status}: ${t}`);
              return t ? JSON.parse(t) : null;
            };
            const aMeta = await gapiA("?fields=sheets(properties(sheetId,title))");
            const aSheet = (aMeta.sheets || []).find((s: any) => String(s.properties?.sheetId) === archiveGid);
            if (aSheet) {
              const deletedRow = allRows[targetIdx + 1] || [];
              const archived = [...deletedRow, actor || "", nowStamp(), "حذف"];
              await gapiA(`/values/${encodeURIComponent(aSheet.properties.title)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
                method: "POST",
                body: JSON.stringify({ values: [archived] }),
              });
            }
          } catch (_e) { /* archiving must never block the delete */ }
        }
        await gapiX(":batchUpdate", { method: "POST", body: JSON.stringify({
          requests: [{ deleteDimension: { range: {
            sheetId: numericSheetId, dimension: "ROWS",
            startIndex: targetIdx + 1, endIndex: targetIdx + 2,
          }}}],
        })});
        return json({ ok: true });
      }

      // update
      const limitErrU = checkOptionLimits(valuesByLetter, targetIdx);
      if (limitErrU) return json({ error: limitErrU }, 409);
      const base = allRows[targetIdx + 1] || [];
      const newRow = buildRowFromLetters(base, stampUpdate(valuesByLetter));
      const range = `${sheetTitle}!A${targetIdx + 2}:${lastLetter}${targetIdx + 2}`;
      await gapiX(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values: [newRow] }),
      });
      return json({ ok: true });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
