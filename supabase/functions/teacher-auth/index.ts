// Custom auth API for teacher individual assignments system.
// Handles: list-users, login, change-password, sync-from-sheet, admin-list, admin-reset, admin-create, archive
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub?gid=1416068353&single=true&output=csv";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; }
        else inQ = false;
      } else val += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ",") { cur.push(val); val = ""; }
    else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
    else if (c !== "\r") val += c;
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  return rows;
}

function clean(s: string): string {
  return (s || "").replace(/^\uFEFF/, "").replace(/\s+/g, " ").trim();
}

async function syncFromSheet(performedBy = "system"): Promise<{ added: number; total: number }> {
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = (await res.text()).replace(/^\uFEFF/, "");
  const [head = [], ...data] = parseCsv(text);
  const headers = head.map(clean);

  const nameIdx = headers.findIndex((h) => h.includes("اسم التدريسي") || h === "اسم التدريسي");
  const deptIdx = headers.findIndex((h) => h.includes("القسم"));
  const collegeIdx = headers.findIndex((h) => h.includes("الكلية"));
  if (nameIdx === -1) throw new Error("لم يتم العثور على عمود اسم التدريسي");

  // Unique names map
  const map = new Map<string, { dept: string; college: string }>();
  for (const row of data) {
    const name = clean(row[nameIdx] || "");
    if (!name) continue;
    if (!map.has(name)) {
      map.set(name, {
        dept: clean(row[deptIdx] || ""),
        college: clean(row[collegeIdx] || ""),
      });
    }
  }

  // Get existing
  const { data: existing } = await supabase
    .from("teacher_users")
    .select("full_name");
  const existingNames = new Set((existing || []).map((u) => u.full_name));

  // Hash for default password "123"
  const defaultHash = await bcrypt.hash("123");

  let added = 0;
  for (const [name, info] of map.entries()) {
    if (existingNames.has(name)) continue;
    const { data: ins, error } = await supabase
      .from("teacher_users")
      .insert({
        full_name: name,
        department: info.dept,
        college: info.college,
        password_hash: defaultHash,
        role: "user",
        must_change_password: true,
        is_manual: false,
      })
      .select("id")
      .single();
    if (error) continue;
    await supabase.from("password_archive").insert({
      user_id: ins.id,
      full_name: name,
      action: "initial_create",
      performed_by: performedBy,
    });
    added++;
  }

  // Ensure admin 'aa' has correct hash for password 'aa'
  const adminHash = await bcrypt.hash("aa");
  const { data: admin } = await supabase
    .from("teacher_users")
    .select("id, password_hash")
    .eq("full_name", "aa")
    .maybeSingle();
  if (admin) {
    // Only fix if not a real bcrypt hash that matches 'aa' — try compare; if false, reset
    let ok = false;
    try { ok = await bcrypt.compare("aa", admin.password_hash); } catch { ok = false; }
    if (!ok) {
      await supabase
        .from("teacher_users")
        .update({ password_hash: adminHash, must_change_password: false })
        .eq("id", admin.id);
    }
  }

  const { count } = await supabase
    .from("teacher_users")
    .select("*", { count: "exact", head: true });
  return { added, total: count || 0 };
}

async function getSessionUser(token: string | null) {
  if (!token) return null;
  const { data } = await supabase
    .from("teacher_sessions")
    .select("user_id, expires_at, teacher_users!inner(id, full_name, department, college, role, must_change_password)")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  // @ts-ignore
  return data.teacher_users;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action: string };

    if (action === "list-users") {
      // Make sure admin exists; auto-sync on first ever call
      const { count } = await supabase
        .from("teacher_users")
        .select("*", { count: "exact", head: true });
      if ((count || 0) <= 1) {
        try { await syncFromSheet("auto-init"); } catch (_) { /* ignore */ }
      }
      const { data } = await supabase
        .from("teacher_users")
        .select("full_name")
        .order("full_name");
      return json({ users: (data || []).map((u) => u.full_name) });
    }

    if (action === "login") {
      const { full_name, password } = body;
      if (!full_name || !password) return json({ error: "البيانات ناقصة" }, 400);
      const { data: user } = await supabase
        .from("teacher_users")
        .select("*")
        .eq("full_name", full_name)
        .maybeSingle();
      if (!user) return json({ error: "اسم التدريسي غير موجود" }, 401);
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return json({ error: "كلمة المرور غير صحيحة" }, 401);
      const { data: sess } = await supabase
        .from("teacher_sessions")
        .insert({ user_id: user.id })
        .select("token")
        .single();
      return json({
        token: sess!.token,
        user: {
          id: user.id,
          full_name: user.full_name,
          department: user.department,
          college: user.college,
          role: user.role,
          must_change_password: user.must_change_password,
        },
      });
    }

    if (action === "logout") {
      const { token } = body;
      if (token) await supabase.from("teacher_sessions").delete().eq("token", token);
      return json({ ok: true });
    }

    if (action === "me") {
      const user = await getSessionUser(body.token);
      if (!user) return json({ error: "الجلسة منتهية" }, 401);
      return json({ user });
    }

    if (action === "change-password") {
      const user = await getSessionUser(body.token);
      if (!user) return json({ error: "الجلسة منتهية" }, 401);
      const { old_password, new_password } = body;
      if (!new_password || new_password.length < 3)
        return json({ error: "كلمة المرور الجديدة قصيرة جداً" }, 400);
      const { data: full } = await supabase
        .from("teacher_users")
        .select("password_hash")
        .eq("id", user.id)
        .single();
      const ok = await bcrypt.compare(old_password || "", full!.password_hash);
      if (!ok) return json({ error: "كلمة المرور الحالية غير صحيحة" }, 401);
      const newHash = await bcrypt.hash(new_password);
      await supabase
        .from("teacher_users")
        .update({ password_hash: newHash, must_change_password: false })
        .eq("id", user.id);
      await supabase.from("password_archive").insert({
        user_id: user.id,
        full_name: user.full_name,
        action: "self_change",
        performed_by: "self",
      });
      return json({ ok: true });
    }

    // ----- Admin actions -----
    const requireAdmin = async () => {
      const u = await getSessionUser(body.token);
      if (!u || u.role !== "admin") return null;
      return u;
    };

    if (action === "admin-list") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { data } = await supabase
        .from("teacher_users")
        .select("id, full_name, department, college, role, must_change_password, is_manual, created_at")
        .order("full_name");
      return json({ users: data || [] });
    }

    if (action === "admin-reset-password") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { user_id, new_password } = body;
      const pw = new_password || "123";
      const hash = await bcrypt.hash(pw);
      const { data: u } = await supabase
        .from("teacher_users")
        .update({ password_hash: hash, must_change_password: true })
        .eq("id", user_id)
        .select("full_name")
        .single();
      if (u) {
        await supabase.from("password_archive").insert({
          user_id,
          full_name: u.full_name,
          action: "admin_reset",
          performed_by: admin.full_name,
        });
      }
      return json({ ok: true, new_password: pw });
    }

    if (action === "admin-create-user") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { full_name, department, college, role, password } = body;
      if (!full_name) return json({ error: "الاسم مطلوب" }, 400);
      const pw = password || "123";
      const hash = await bcrypt.hash(pw);
      const { data, error } = await supabase
        .from("teacher_users")
        .insert({
          full_name,
          department: department || "",
          college: college || "",
          role: role === "admin" ? "admin" : "user",
          password_hash: hash,
          must_change_password: true,
          is_manual: true,
        })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 400);
      await supabase.from("password_archive").insert({
        user_id: data.id,
        full_name,
        action: "admin_create",
        performed_by: admin.full_name,
      });
      return json({ ok: true, password: pw });
    }

    if (action === "admin-delete-user") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { user_id } = body;
      await supabase.from("teacher_users").delete().eq("id", user_id);
      return json({ ok: true });
    }

    if (action === "admin-sync") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const r = await syncFromSheet(admin.full_name);
      return json(r);
    }

    if (action === "admin-archive") {
      const admin = await requireAdmin();
      if (!admin) return json({ error: "صلاحية المدير مطلوبة" }, 403);
      const { data } = await supabase
        .from("password_archive")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      return json({ archive: data || [] });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
