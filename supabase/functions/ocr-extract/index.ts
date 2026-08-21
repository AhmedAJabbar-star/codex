// OCR / vision extraction for the no-code system builder.
// Input:  { image_data_url, fields: [{letter, header, type?}], prompt? }
// Output: { values: { [letter]: string } }
// Uses Lovable AI Gateway (gemini-2.5-flash) — no user API key required.

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

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

interface FieldSpec {
  letter: string;
  header: string;
  type?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY غير مُهيأ في الخادم" }, 500);

    const body = await req.json().catch(() => ({}));

    // ---- Mode "text": full text extraction from any uploaded file (image / PDF / doc).
    if (String(body?.mode || "") === "text") {
      const fileUrl: string = String(body?.file_data_url || "").trim();
      const mime: string = String(body?.mime_type || "").toLowerCase();
      const fileName: string = String(body?.file_name || "ملف");
      const extraPrompt: string = String(body?.prompt || "").trim();
      if (!fileUrl.startsWith("data:")) {
        return json({ error: "الملف مطلوب بصيغة data:...;base64,..." }, 400);
      }
      const instruction =
        (extraPrompt ||
          "استخرج كامل النص الظاهر في الملف المرفق كما هو، مع الحفاظ على الترتيب والأسطر. لا تضف أي شرح أو تعليق. إن لم يوجد نص أعِد نصاً فارغاً.");
      const part = mime.startsWith("image/")
        ? { type: "image_url", image_url: { url: fileUrl } }
        : { type: "file", file: { filename: fileName, file_data: fileUrl } };
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "أنت أداة OCR دقيقة. أعِد النص المستخرج فقط." },
            { role: "user", content: [{ type: "text", text: instruction }, part] },
          ],
        }),
      });
      if (res.status === 429) return json({ error: "تم تجاوز الحد المسموح — حاول لاحقاً" }, 429);
      if (res.status === 402) return json({ error: "رصيد Lovable AI غير كافٍ" }, 402);
      if (!res.ok) {
        const t = await res.text();
        return json({ error: `فشل استخراج النص: ${res.status} ${t.slice(0, 300)}` }, 500);
      }
      const d = await res.json();
      const text = String(d?.choices?.[0]?.message?.content || "").trim();
      return json({ text });
    }

    const image: string = String(body?.image_data_url || "").trim();
    const fields: FieldSpec[] = Array.isArray(body?.fields) ? body.fields : [];
    const userPrompt: string = String(body?.prompt || "").trim();

    if (!image.startsWith("data:image/")) {
      return json({ error: "الصورة مطلوبة بصيغة data:image/...;base64,..." }, 400);
    }
    if (fields.length === 0) {
      return json({ error: "قائمة الحقول (fields) مطلوبة" }, 400);
    }

    // Build the extraction instructions in Arabic. Each field becomes a JSON key = letter.
    const fieldList = fields
      .map((f) => `- "${f.letter}": ${f.header}${f.type ? ` (نوع: ${f.type})` : ""}`)
      .join("\n");

    const defaultPrompt =
      "أنت مساعد استخراج بيانات دقيق. حلّل الصورة المرفقة (وثيقة/جدول/بطاقة) واستخرج القيم المطلوبة. أعِد النتيجة كـ JSON فقط، بدون أي شرح، بمفاتيح هي أحرف الأعمدة أدناه. لأي حقل غير موجود أو غير واضح، استخدم القيمة \"\". اكتب القيم كما تظهر في الصورة (احتفظ باللغة الأصلية). الأرقام بصيغة عربية شرقية اجعلها أرقاماً لاتينية.";

    const systemPrompt = (userPrompt || defaultPrompt) +
      "\n\nالحقول المطلوب استخراجها (استخدم الحرف كمفتاح JSON):\n" + fieldList +
      "\n\nمثال الشكل المطلوب للإجابة:\n{\n  " +
      fields.slice(0, 3).map((f) => `"${f.letter}": "..."`).join(",\n  ") +
      "\n}";

    const messages = [
      { role: "system", content: "أعِد فقط كائن JSON صالحاً، بدون أي نص أو أسوار كود." },
      {
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) return json({ error: "تم تجاوز الحد المسموح — حاول لاحقاً" }, 429);
    if (res.status === 402) return json({ error: "رصيد Lovable AI غير كافٍ — أضف رصيداً من إعدادات المشروع" }, 402);
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `فشل الاستخراج: ${res.status} ${text.slice(0, 400)}` }, 500);
    }

    const data = await res.json();
    const rawContent: string = data?.choices?.[0]?.message?.content || "{}";

    // Some providers wrap the JSON in ```json fences; strip them defensively.
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Best-effort: try to locate the first {...} block.
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    // Keep only requested letters; coerce to string.
    const values: Record<string, string> = {};
    fields.forEach((f) => {
      const k = f.letter;
      const v = (parsed as any)[k] ?? (parsed as any)[k.toLowerCase()] ?? "";
      values[k] = v == null ? "" : String(v).trim();
    });

    return json({ values, raw: cleaned });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
