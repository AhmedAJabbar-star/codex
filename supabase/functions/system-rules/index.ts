// Server-side gate for editing system_access_rules.
// Validates the control-panel password against the currently stored rules
// before allowing writes via the service role key. Reads remain public.
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
const FALLBACK_PASSWORD = "2021";
const RULES_ID = "global";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { password, rules } = await req.json();
    if (!rules || typeof rules !== "object") return json({ error: "rules required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Read current rules to validate password (chicken-and-egg: fall back to default).
    const { data: current } = await admin
      .from("system_access_rules")
      .select("rules")
      .eq("id", RULES_ID)
      .maybeSingle();

    const currentRules = (current?.rules || {}) as Record<string, { password?: string; protected?: boolean }>;
    const expected =
      (currentRules.controlPanel?.password && String(currentRules.controlPanel.password)) ||
      FALLBACK_PASSWORD;

    if (String(password || "") !== expected) {
      return json({ error: "كلمة المرور غير صحيحة" }, 401);
    }

    const { error } = await admin
      .from("system_access_rules")
      .upsert({ id: RULES_ID, rules, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
