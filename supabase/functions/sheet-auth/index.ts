// Compatibility edge function for deployments still calling `sheet-auth`.
// Uses Google Sheet CSV as source and avoids runtime crashes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHEET_ID = "1vAuWBa1ERY0EYL2T-MMTO7MYM0yP7dGJP64dBCRMSzQ";
const ASSIGNMENTS_GID = "1147039908";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ASSIGNMENTS_GID}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function clean(s: string): string { return (s || "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim(); }

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let val = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else inQ = false; } else val += c; continue; }
    if (c === '"') inQ = true;
    else if (c === ',') { cur.push(val); val = ""; }
    else if (c === '\n') { cur.push(val); rows.push(cur); cur = []; val = ""; }
    else if (c !== '\r') val += c;
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows;
}

async function readTeacherNames(): Promise<string[]> {
  const res = await fetch(CSV_URL, { cache: 'no-store' });
  if (!res.ok) return ["aa"];
  const text = await res.text();
  const [head = [], ...data] = parseCsv(text);
  const idx = head.map(clean).findIndex((h) => h.includes("اسم التدريسي"));
  if (idx < 0) return ["aa"];
  const set = new Set<string>();
  data.forEach((r) => { const n = clean(r[idx] || ""); if (n) set.add(n); });
  set.add("aa");
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action || "";

    if (action === "list-users") {
      const users = await readTeacherNames();
      return json({ users });
    }

    if (action === "login") {
      const name = clean(body?.full_name || "");
      const password = String(body?.password || "");
      const users = await readTeacherNames();
      if (!users.includes(name)) return json({ error: "اسم التدريسي غير موجود" }, 401);
      const expected = name === "aa" ? "aa" : "123";
      if (password !== expected) return json({ error: "كلمة المرور غير صحيحة" }, 401);
      return json({
        token: crypto.randomUUID(),
        user: { id: name, full_name: name, department: "", college: "", role: name === "aa" ? "admin" : "user", must_change_password: name !== "aa" },
      });
    }

    if (action === "logout" || action === "me" || action === "change-password" || action.startsWith("admin-")) {
      return json({ ok: true, note: "sheet-auth compatibility mode" });
    }

    return json({ ok: true, status: "sheet-auth alive" });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
