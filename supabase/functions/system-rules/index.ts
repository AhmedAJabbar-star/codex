// Server-side gate for reading/editing system_access_rules.
// Passwords never leave the server: reads return a masked sentinel instead of
// the real value, and verification happens here.
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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RULES_ID = "global";
/** Sentinel returned instead of a stored password, and understood on save. */
const KEEP = "__KEEP_EXISTING__";
const GROUPS_KEY = "__groups";
const BRANDING_KEY = "__branding";
/** Keys that hold plain settings (no password) and must pass through untouched. */
const PASSTHROUGH_KEYS = [GROUPS_KEY, BRANDING_KEY];

type Rule = Record<string, unknown> & { password?: unknown };
type Rules = Record<string, unknown>;

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function loadRules(): Promise<Rules> {
  const { data } = await admin()
    .from("system_access_rules").select("rules").eq("id", RULES_ID).maybeSingle();
  return (data?.rules || {}) as Rules;
}

/** Replace every password with the KEEP sentinel (or "" when unset). */
function maskRules(rules: Rules): Rules {
  const out: Rules = {};
  for (const [k, v] of Object.entries(rules)) {
    if (PASSTHROUGH_KEYS.includes(k) || !v || typeof v !== "object" || Array.isArray(v)) { out[k] = v; continue; }
    const r = { ...(v as Rule) };
    const pw = typeof r.password === "string" ? r.password : "";
    r.password = pw ? KEEP : "";
    out[k] = r;
  }
  return out;
}

/** Restore real passwords wherever the client sent back the sentinel. */
function unmaskRules(incoming: Rules, stored: Rules): Rules {
  const out: Rules = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (PASSTHROUGH_KEYS.includes(k) || !v || typeof v !== "object" || Array.isArray(v)) { out[k] = v; continue; }
    const r = { ...(v as Rule) };
    if (r.password === KEEP) {
      const prev = (stored[k] as Rule | undefined)?.password;
      r.password = typeof prev === "string" ? prev : "";
    }
    out[k] = r;
  }
  return out;
}

const rulePassword = (rules: Rules, id: string): string => {
  const r = rules[id] as Rule | undefined;
  return typeof r?.password === "string" ? r.password : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // Backwards compatible: a body carrying `rules` without action means "save".
    const action = String(body?.action || (body?.rules ? "save" : "get"));

    if (action === "get") {
      return json({ rules: maskRules(await loadRules()) });
    }

    if (action === "verify") {
      const id = String(body?.system_id || "");
      const password = String(body?.password || "");
      if (!id) return json({ error: "system_id مطلوب" }, 400);
      const expected = rulePassword(await loadRules(), id);
      // An unset password means the system is effectively open.
      return json({ ok: !expected || password === expected });
    }

    if (action === "save") {
      const incoming = body?.rules;
      if (!incoming || typeof incoming !== "object") return json({ error: "rules required" }, 400);
      const stored = await loadRules();
      const expected = rulePassword(stored, "controlPanel");
      if (expected && String(body?.password || "") !== expected) {
        return json({ error: "كلمة المرور غير صحيحة" }, 401);
      }
      const merged = unmaskRules(incoming as Rules, stored);
      const { error } = await admin()
        .from("system_access_rules")
        .upsert({ id: RULES_ID, rules: merged, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, rules: maskRules(merged) });
    }

    return json({ error: "إجراء غير مدعوم" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
