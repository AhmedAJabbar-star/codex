// Sheet-backed auth for Individual Assignments.
// Backend = Google Sheets (via Service Account JWT). NO Supabase DB usage.
// Sheets used: "users" and "archive" (auto-created if missing).
// Sessions are in-memory (resets on cold start; tokens last 7 days max).

import { compare, hash } from "npm:bcrypt-ts@5.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID") || "1vAuWBa1ERY0EYL2T-MMTO7MYM0yP7dGJP64dBCRMSzQ";
const DEFAULT_SA_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
const DEFAULT_ASSIGNMENTS_CSV =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub?gid=1416068353&single=true&output=csv";

const USERS_HEADERS = ["id","full_name","department","college","role","password_hash","must_change_password","is_manual","created_at","updated_at"];
const ARCHIVE_HEADERS = ["id","timestamp","user_id","full_name","action","performed_by"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function clean(s: string) {
  return (s || "").toString().replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
}
function uuid() { return crypto.randomUUID(); }

/* ---------------- Service Account JWT → access token ---------------- */
let cachedToken: { token: string; exp: number } | null = null;
let fallbackUsersCache: { users: Record<string, string>[]; exp: number } | null = null;
let runtimeConnection: { sheetId: string; saJson: string; assignmentsCsv: string } | null = null;
function getConnection() {
  return runtimeConnection || { sheetId: DEFAULT_SHEET_ID, saJson: DEFAULT_SA_JSON, assignmentsCsv: DEFAULT_ASSIGNMENTS_CSV };
}
function setConnectionFromBody(body: any) {
  const c = body?.connection;
  if (!c) return;
  const sheetId = clean(c.sheet_id || "");
  const saJson = (c.service_account_json || "").toString().trim();
  const assignmentsCsv = (c.assignments_csv || "").toString().trim() || DEFAULT_ASSIGNMENTS_CSV;
  if (!sheetId || !saJson) return;
  runtimeConnection = { sheetId, saJson, assignmentsCsv };
  cachedToken = null;
  fallbackUsersCache = null;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function parseServiceAccount(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ناقص");
    }
    return parsed;
  } catch (e) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON غير صالح: ${(e as Error).message}`);
  }
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - 60 > Math.floor(Date.now() / 1000)) {
    return cachedToken.token;
  }
  const conn = getConnection();
  if (!conn.saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON غير مُهيأ");
  const sa = parseServiceAccount(conn.saJson);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OAuth failed: ${JSON.stringify(data)}`);
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

/* ---------------- Sheets API helpers ---------------- */
async function gapi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${getConnection().sheetId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  return data;
}

async function ensureSheet(title: string, headers: string[]) {
  const meta = await gapi("?fields=sheets(properties(title))");
  const exists = (meta.sheets || []).some((s: any) => s.properties?.title === title);
  if (!exists) {
    await gapi(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    });
    // Write headers
    await gapi(`/values/${encodeURIComponent(title)}!A1?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [headers] }),
    });
  } else {
    // Make sure headers exist (row 1 not empty)
    const r = await gapi(`/values/${encodeURIComponent(title)}!A1:Z1`);
    if (!r.values || r.values.length === 0 || (r.values[0] || []).length === 0) {
      await gapi(`/values/${encodeURIComponent(title)}!A1?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [headers] }),
      });
    }
  }
}

async function readAll(title: string, headers: string[]): Promise<Record<string,string>[]> {
  const r = await gapi(`/values/${encodeURIComponent(title)}!A2:Z`);
  const rows = (r.values || []) as string[][];
  return rows
    .filter((row) => row.some((c) => clean(c)))
    .map((row) => {
      const obj: Record<string,string> = {};
      headers.forEach((h, i) => { obj[h] = (row[i] ?? "").toString(); });
      return obj;
    });
}

async function appendRow(title: string, headers: string[], obj: Record<string,any>) {
  const row = headers.map((h) => obj[h] === undefined || obj[h] === null ? "" : String(obj[h]));
  await gapi(`/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

async function updateRowByIndex(title: string, headers: string[], rowIndex0: number, obj: Record<string,any>) {
  // rowIndex0 is 0-based among data rows (so sheet row = rowIndex0 + 2)
  const sheetRow = rowIndex0 + 2;
  const row = headers.map((h) => obj[h] === undefined || obj[h] === null ? "" : String(obj[h]));
  const range = `${title}!A${sheetRow}:${String.fromCharCode(64 + headers.length)}${sheetRow}`;
  await gapi(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [row] }),
  });
}

async function deleteRowByIndex(title: string, rowIndex0: number) {
  const meta = await gapi("?fields=sheets(properties(sheetId,title))");
  const sheet = (meta.sheets || []).find((s: any) => s.properties?.title === title);
  if (!sheet) throw new Error(`Sheet ${title} not found`);
  const sheetId = sheet.properties.sheetId;
  await gapi(":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowIndex0 + 1, endIndex: rowIndex0 + 2 },
        },
      }],
    }),
  });
}

/* ---------------- High-level user store ---------------- */
async function getAllUsers() {
  await ensureSheet("users", USERS_HEADERS);
  return readAll("users", USERS_HEADERS);
}
async function getFallbackUsersFromAssignments(): Promise<Record<string, string>[]> {
  const nowMs = Date.now();
  if (fallbackUsersCache && fallbackUsersCache.exp > nowMs) return fallbackUsersCache.users;
  const res = await fetch(getConnection().assignmentsCsv, { cache: "no-store" });
  if (!res.ok) throw new Error(`فشل قراءة شيت التكليفات: ${res.status}`);
  const text = (await res.text()).replace(/^\uFEFF/, "");
  const [head = [], ...data] = parseCsv(text);
  const headers = head.map(clean);
  const nameIdx = headers.findIndex((h) => h.includes("اسم التدريسي"));
  const deptIdx = headers.findIndex((h) => h.includes("القسم"));
  const colIdx = headers.findIndex((h) => h.includes("الكلية"));
  if (nameIdx === -1) throw new Error("لم يتم العثور على عمود اسم التدريسي");

  const map = new Map<string, { dept: string; college: string }>();
  for (const row of data) {
    const name = clean(row[nameIdx] || "");
    if (!name || map.has(name)) continue;
    map.set(name, { dept: clean(row[deptIdx] || ""), college: clean(row[colIdx] || "") });
  }
  const defaultHash = await hash("123", 10);
  const users = Array.from(map.entries()).map(([full_name, info]) => ({
    id: `fallback:${full_name}`,
    full_name,
    department: info.dept,
    college: info.college,
    role: "user",
    password_hash: defaultHash,
    must_change_password: "true",
    is_manual: "false",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  fallbackUsersCache = { users, exp: nowMs + 5 * 60 * 1000 };
  return users;
}
async function findUserByName(name: string) {
  try {
    const all = await getAllUsers();
    const idx = all.findIndex((u) => clean(u.full_name) === clean(name));
    if (idx >= 0) return { user: all[idx], index: idx };
    // If sheets are reachable but user row not yet synced, try assignments fallback.
    const fallback = await getFallbackUsersFromAssignments();
    const fidx = fallback.findIndex((u) => clean(u.full_name) === clean(name));
    return fidx >= 0 ? { user: fallback[fidx], index: fidx } : null;
  } catch {
    const fallback = await getFallbackUsersFromAssignments();
    const fidx = fallback.findIndex((u) => clean(u.full_name) === clean(name));
    return fidx >= 0 ? { user: fallback[fidx], index: fidx } : null;
  }
}
async function findUserById(id: string) {
  try {
    const all = await getAllUsers();
    const idx = all.findIndex((u) => u.id === id);
    if (idx >= 0) return { user: all[idx], index: idx };
    const fallback = await getFallbackUsersFromAssignments();
    const fidx = fallback.findIndex((u) => u.id === id);
    return fidx >= 0 ? { user: fallback[fidx], index: fidx } : null;
  } catch {
    const fallback = await getFallbackUsersFromAssignments();
    const fidx = fallback.findIndex((u) => u.id === id);
    return fidx >= 0 ? { user: fallback[fidx], index: fidx } : null;
  }
}

async function archive(action: string, full_name: string, performed_by: string, user_id = "") {
  await ensureSheet("archive", ARCHIVE_HEADERS);
  await appendRow("archive", ARCHIVE_HEADERS, {
    id: uuid(),
    timestamp: new Date().toISOString(),
    user_id,
    full_name,
    action,
    performed_by,
  });
}

/* ---------------- Bootstrap (admin + sync from assignments CSV) ---------------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let v = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { v += '"'; i++; } else q = false; } else v += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ",") { cur.push(v); v = ""; }
    else if (c === "\n") { cur.push(v); rows.push(cur); cur = []; v = ""; }
    else if (c !== "\r") v += c;
  }
  if (v.length || cur.length) { cur.push(v); rows.push(cur); }
  return rows;
}

async function ensureAdmin() {
  const existing = await findUserByName("aa");
  if (existing) return;
  const hash = await hash("aa", 10);
  const id = uuid();
  const now = new Date().toISOString();
  await appendRow("users", USERS_HEADERS, {
    id, full_name: "aa", department: "", college: "",
    role: "admin", password_hash: hash,
    must_change_password: "false", is_manual: "true",
    created_at: now, updated_at: now,
  });
  await archive("admin_create", "aa", "system", id);
}

async function syncFromAssignments(performedBy: string): Promise<{added:number; total:number}> {
  const res = await fetch(getConnection().assignmentsCsv, { cache: "no-store" });
  if (!res.ok) throw new Error(`فشل قراءة شيت التكليفات: ${res.status}`);
  const text = (await res.text()).replace(/^\uFEFF/, "");
  const [head = [], ...data] = parseCsv(text);
  const headers = head.map(clean);
  const nameIdx = headers.findIndex((h) => h.includes("اسم التدريسي"));
  const deptIdx = headers.findIndex((h) => h.includes("القسم"));
  const colIdx = headers.findIndex((h) => h.includes("الكلية"));
  if (nameIdx === -1) throw new Error("لم يتم العثور على عمود اسم التدريسي");

  const map = new Map<string, { dept: string; college: string }>();
  for (const row of data) {
    const name = clean(row[nameIdx] || "");
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        dept: clean(row[deptIdx] || ""),
        college: clean(row[colIdx] || ""),
      });
    }
  }

  const all = await getAllUsers();
  const existing = new Set(all.map((u) => clean(u.full_name)));
  const defaultHash = await hash("123", 10);
  let added = 0;
  for (const [name, info] of map.entries()) {
    if (existing.has(name)) continue;
    const id = uuid(); const now = new Date().toISOString();
    await appendRow("users", USERS_HEADERS, {
      id, full_name: name, department: info.dept, college: info.college,
      role: "user", password_hash: defaultHash,
      must_change_password: "true", is_manual: "false",
      created_at: now, updated_at: now,
    });
    await archive("initial_create", name, performedBy, id);
    added++;
  }
  const total = all.length + added;
  return { added, total };
}

/* ---------------- Sessions (in-memory) ---------------- */
type Sess = { user_id: string; expires_at: number };
const SESSIONS = new Map<string, Sess>();
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createSession(user_id: string): string {
  const token = uuid();
  SESSIONS.set(token, { user_id, expires_at: Date.now() + SESSION_TTL_MS });
  return token;
}
async function getSessionUser(token: string | null) {
  if (!token) return null;
  const s = SESSIONS.get(token);
  if (!s || s.expires_at < Date.now()) { SESSIONS.delete(token!); return null; }
  if (s.user_id === "manager-fixed") return managerUser();
  const found = await findUserById(s.user_id);
  return found ? found.user : null;
}

function publicUser(u: Record<string,string>) {
  return {
    id: u.id,
    full_name: u.full_name,
    department: u.department || "",
    college: u.college || "",
    role: (u.role === "admin" ? "admin" : "user") as "admin" | "user",
    must_change_password: String(u.must_change_password).toLowerCase() === "true",
  };
}
function teacherNamesFromUsers(all: Record<string, string>[]) {
  return all.map((u) => u.full_name).filter((n) => n && n !== "aa");
}
function managerUser() {
  return {
    id: "manager-fixed",
    full_name: "مدير النظام",
    department: "",
    college: "",
    role: "admin",
    password_hash: "",
    must_change_password: "false",
    is_manual: "true",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Record<string, string>;
}

/* ---------------- Handler ---------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    setConnectionFromBody(body);
    const { action } = body as { action: string };

    // Try to initialize sheets/admin, but do not block login/list if Sheets auth is down.
    let sheetsReady = true;
    try {
      await ensureSheet("users", USERS_HEADERS);
      await ensureSheet("archive", ARCHIVE_HEADERS);
      await ensureAdmin();
    } catch (e) {
      sheetsReady = false;
      console.warn("Sheets bootstrap unavailable, using fallback mode:", (e as Error).message);
    }

    // NOTE: Keep this block as the single source of truth for teacher-name loading
    // to avoid merge conflicts between fallback and non-fallback branches.
    if (action === "list-users") {
      let all = sheetsReady ? await getAllUsers() : await getFallbackUsersFromAssignments();
      let names = teacherNamesFromUsers(all);
      // If users sheet is still empty in production, sync once from assignments CSV.
      if (names.length === 0) {
        if (sheetsReady) {
          await syncFromAssignments("list-users-auto-sync");
          all = await getAllUsers();
        } else {
          all = await getFallbackUsersFromAssignments();
        }
        names = teacherNamesFromUsers(all);
      }
      return json({ users: names.sort((a,b) => a.localeCompare(b, "ar")) });
    }

    if (action === "background-sync") {
      // Called by other pages' auto-refresh to keep users sheet up-to-date.
      // Only APPENDS new names; never modifies existing rows or passwords.
      try {
        const r = await syncFromAssignments("auto-refresh");
        return json({ ok: true, ...r });
      } catch (e) {
        return json({ ok: false, error: (e as Error).message });
      }
    }

    if (action === "login") {
      const { full_name, password } = body;
      if (!full_name || !password) return json({ error: "البيانات ناقصة" }, 400);
      if (full_name === "__manager__") {
        if (String(password) !== "2021") return json({ error: "كلمة مرور المدير غير صحيحة" }, 401);
        const mgr = managerUser();
        const token = createSession(mgr.id);
        return json({ token, user: publicUser(mgr) });
      }
      const found = await findUserByName(full_name);
      if (!found) return json({ error: "اسم التدريسي غير موجود" }, 401);
      const ok = await compare(password, found.user.password_hash);
      if (!ok) return json({ error: "كلمة المرور غير صحيحة" }, 401);
      const token = createSession(found.user.id);
      return json({ token, user: publicUser(found.user) });
    }

    if (action === "logout") {
      if (body.token) SESSIONS.delete(body.token);
      return json({ ok: true });
    }

    if (action === "me") {
      const u = await getSessionUser(body.token);
      if (!u) return json({ error: "الجلسة منتهية" }, 401);
      return json({ user: publicUser(u) });
    }

    if (action === "change-password") {
      if (!sheetsReady) return json({ error: "خدمة الحفظ غير متاحة حالياً. يرجى المحاولة لاحقاً." }, 503);
      const u = await getSessionUser(body.token);
      if (!u) return json({ error: "الجلسة منتهية" }, 401);
      const { old_password, new_password } = body;
      if (!new_password || new_password.length < 3) return json({ error: "كلمة المرور الجديدة قصيرة جداً" }, 400);
      const ok = await compare(old_password || "", u.password_hash);
      if (!ok) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 401);
      const newHash = await hash(new_password, 10);
      const found = await findUserById(u.id);
      if (!found) return json({ error: "المستخدم غير موجود" }, 404);
      await updateRowByIndex("users", USERS_HEADERS, found.index, {
        ...found.user,
        password_hash: newHash,
        must_change_password: "false",
        updated_at: new Date().toISOString(),
      });
      await archive("self_change", u.full_name, "self", u.id);
      return json({ ok: true });
    }

    /* ---- Admin ---- */
    const requireAdmin = async () => {
      const u = await getSessionUser(body.token);
      if (!u || u.role !== "admin") return null;
      return u;
    };

    if (action === "admin-list") {
      if (!sheetsReady) return json({ error: "لوحة المدير غير متاحة حالياً بسبب مشكلة ربط Google Sheets." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const all = await getAllUsers();
      const users = all.map((u) => ({
        ...publicUser(u),
        is_manual: String(u.is_manual).toLowerCase() === "true",
        created_at: u.created_at,
      }));
      return json({ users });
    }

    if (action === "admin-reset-password") {
      if (!sheetsReady) return json({ error: "خدمة الحفظ غير متاحة حالياً. يرجى المحاولة لاحقاً." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { user_id, new_password } = body;
      const pw = new_password || "123";
      const hash = await hash(pw, 10);
      const found = await findUserById(user_id);
      if (!found) return json({ error: "المستخدم غير موجود" }, 404);
      await updateRowByIndex("users", USERS_HEADERS, found.index, {
        ...found.user, password_hash: hash, must_change_password: "true",
        updated_at: new Date().toISOString(),
      });
      await archive("admin_reset", found.user.full_name, a.full_name, user_id);
      return json({ ok: true, new_password: pw });
    }

    if (action === "admin-create-user") {
      if (!sheetsReady) return json({ error: "خدمة الحفظ غير متاحة حالياً. يرجى المحاولة لاحقاً." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { full_name, department, college, role, password } = body;
      if (!full_name) return json({ error: "الاسم مطلوب" }, 400);
      const exists = await findUserByName(full_name);
      if (exists) return json({ error: "الاسم موجود مسبقاً" }, 400);
      const pw = password || "123";
      const hash = await hash(pw, 10);
      const id = uuid(); const now = new Date().toISOString();
      await appendRow("users", USERS_HEADERS, {
        id, full_name, department: department || "", college: college || "",
        role: role === "admin" ? "admin" : "user",
        password_hash: hash, must_change_password: "true", is_manual: "true",
        created_at: now, updated_at: now,
      });
      await archive("admin_create", full_name, a.full_name, id);
      return json({ ok: true, password: pw });
    }

    if (action === "admin-delete-user") {
      if (!sheetsReady) return json({ error: "خدمة الحفظ غير متاحة حالياً. يرجى المحاولة لاحقاً." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { user_id } = body;
      const found = await findUserById(user_id);
      if (!found) return json({ ok: true });
      if (found.user.full_name === "aa") return json({ error: "لا يمكن حذف حساب المدير الافتراضي" }, 400);
      await deleteRowByIndex("users", found.index);
      await archive("admin_delete", found.user.full_name, a.full_name, user_id);
      return json({ ok: true });
    }

    if (action === "admin-sync") {
      if (!sheetsReady) return json({ error: "تعذر المزامنة حالياً بسبب مشكلة ربط Google Sheets." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const r = await syncFromAssignments(a.full_name);
      return json(r);
    }

    if (action === "admin-archive") {
      if (!sheetsReady) return json({ error: "الأرشيف غير متاح حالياً بسبب مشكلة ربط Google Sheets." }, 503);
      const a = await requireAdmin(); if (!a) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      await ensureSheet("archive", ARCHIVE_HEADERS);
      const all = await readAll("archive", ARCHIVE_HEADERS);
      const archive = all
        .map((r) => ({
          id: r.id,
          user_id: r.user_id || null,
          full_name: r.full_name,
          action: r.action,
          performed_by: r.performed_by || null,
          created_at: r.timestamp,
        }))
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, 500);
      return json({ archive });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    console.error("sheet-auth error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
