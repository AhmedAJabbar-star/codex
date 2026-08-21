// OCR / vision extraction for the no-code system builder.
// Input:  { image_data_url, fields: [{letter, header, type?}], prompt? }
// Output: { values: { [letter]: string } }
// Uses Lovable AI Gateway (gemini-2.5-flash) — no user API key required.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
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

const BodySchema = z.object({
  mode: z.enum(['text']).optional(),
  file_data_url: z.string().max(30_000_000).optional(),
  mime_type: z.string().max(150).optional(),
  file_name: z.string().max(255).optional(),
  image_data_url: z.string().max(30_000_000).optional(),
  fields: z.array(z.object({ letter: z.string().min(1).max(3), header: z.string().min(1).max(255), type: z.string().max(40).optional() })).max(100).optional(),
  prompt: z.string().max(4000).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY غير مُهيأ في الخادم" }, 500);

    const parsedBody = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) return json({ error: parsedBody.error.flatten().fieldErrors }, 400);
    const body = parsedBody.data;

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
        "مهمة نسخ حرفي فقط: انسخ كل النص المقروء في الملف من البداية إلى النهاية بنفس اللغة والترتيب والأسطر، بما في ذلك العناوين والجداول والحواشي والأرقام. ممنوع التلخيص أو إعادة الصياغة أو التصحيح أو الاستنتاج أو حذف النص المتكرر. لا تضف شرحاً. " +
        (extraPrompt ? `تعليمات تنسيق إضافية لا تلغي النسخ الكامل: ${extraPrompt}` : "");
      const part = mime.startsWith("image/")
        ? { type: "image_url", image_url: { url: fileUrl } }
        : { type: "file", file: { filename: fileName, file_data: fileUrl } };
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 32768,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "أنت أداة OCR دقيقة جداً. أعِد النص المستخرج فقط. القاعدة الأهم: استخرج كامل النص من أول حرف إلى آخر حرف — كل سطر وكل فقرة وكل جدول — ولا تختصر ولا تلخّص ولا تتوقف في منتصف المستند مهما كان طويلاً. اكتب النص كاملاً كما يظهر.",
            },
            { role: "user", content: [{ type: "text", text: instruction + "\n\nتنبيه: يجب أن يشمل الناتج كامل محتوى الملف من البداية إلى النهاية دون أي اختصار." }, part] },
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
      const finishReason = String(d?.choices?.[0]?.finish_reason || "");
      return json({ text, finish_reason: finishReason });
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
      "مهمة نسخ حقول حرفية وليست تحليلاً: انقل القيمة المكتوبة المقابلة لكل حقل كما تظهر تماماً وكاملة. ممنوع التخمين أو التلخيص أو إعادة الصياغة أو إنشاء قيمة غير موجودة. الحقل غير الموجود أو غير المقروء قيمته سلسلة فارغة. احتفظ باللغة الأصلية والأسطر والتكرار.";

    const systemPrompt = defaultPrompt + (userPrompt ? `\nتعليمات تحديد موضع الحقول: ${userPrompt}` : '') +
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
        max_tokens: 32768,
        temperature: 0,
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
