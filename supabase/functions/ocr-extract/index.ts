// OCR / vision extraction for the no-code system builder.
// Input:  { image_data_url, fields: [{letter, header, type?}], prompt? }
// Output: { values: { [letter]: string } }
// mode 'text'    → نسخ حرفي شامل لكامل الملف (شامل)
// mode 'summary' → مُلخَّص منظم وفيّ للمستند (مُلخَّص)
// mode 'smart'   → استخراج وفق معايير المستخدم فقط (ذكي)
// Uses Lovable AI Gateway (gemini-3.1-pro-preview) — no user API key required.

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
  mode: z.enum(['text', 'summary', 'smart']).optional(),
  file_data_url: z.string().max(40_000_000).optional(),
  mime_type: z.string().max(150).optional(),
  file_name: z.string().max(255).optional(),
  image_data_url: z.string().max(40_000_000).optional(),
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

    // ---- File modes: "text" (شامل) / "summary" (مُلخَّص) / "smart" (ذكي وفق المعايير).
    const fileMode = String(body?.mode || "");
    if (fileMode === "text" || fileMode === "summary" || fileMode === "smart") {
      const fileUrl: string = String(body?.file_data_url || "").trim();
      const mime: string = String(body?.mime_type || "").toLowerCase();
      const fileName: string = String(body?.file_name || "ملف");
      const extraPrompt: string = String(body?.prompt || "").trim();
      if (!fileUrl.startsWith("data:")) {
        return json({ error: "الملف مطلوب بصيغة data:...;base64,..." }, 400);
      }

      // قواعد التعامل مع العناصر غير المطبوعة (خط اليد، الأختام، التواقيع) — مشتركة بين الأوضاع.
      const HANDWRITING_RULES =
        "\nقواعد إلزامية للعناصر غير المطبوعة:" +
        "\n- أي نص مكتوب بخط اليد (في الهوامش، بين الأسطر، أعلى الصفحة أو أسفلها، بأي لون حبر): اقرأه كلمةً كلمة ببطء وعناية فائقة، ثم انسخه في موضعه بين الوسمين [هامش بخط اليد: ...]. خط اليد العربي جزء من المستند — لا تتجاهله أبداً ولا تخمّنه عشوائياً." +
        "\n- الأختام والمطبوعات (الدائرية أو المستطيلة): انسخ النص المقروء داخلها بالشكل [ختم: ...]." +
        "\n- التواقيع: اكتب [توقيع] وأي اسم مقروء بجواره." +
        "\n- الأرقام: انسخها كما تظهر تماماً (عربية أو هندية أو إنكليزية) دون تحويل أو تبديل." +
        "\n- المقطع المتعذّر قراءته فعلاً: اكتب [غير مقروء] ولا تخترع كلمات غير موجودة.";

      let systemPrompt = "";
      let instruction = "";
      if (fileMode === "text") {
        systemPrompt =
          "أنت أداة OCR دقيقة جداً. أعِد النص المستخرج فقط. القاعدة الأهم: استخرج كامل النص من أول حرف إلى آخر حرف — كل سطر وكل فقرة وكل جدول — ولا تختصر ولا تلخّص ولا تتوقف في منتصف المستند مهما كان طويلاً. اكتب النص كاملاً كما يظهر." + HANDWRITING_RULES;
        instruction =
          "مهمة نسخ حرفي فقط: انسخ كل النص المقروء في الملف من البداية إلى النهاية بنفس اللغة والترتيب والأسطر، بما في ذلك العناوين والجداول والحواشي والأرقام والهوامش المكتوبة بخط اليد والأختام. ممنوع التلخيص أو إعادة الصياغة أو التصحيح أو الاستنتاج أو حذف النص المتكرر. لا تضف شرحاً. " +
          (extraPrompt ? `تعليمات تنسيق إضافية لا تلغي النسخ الكامل: ${extraPrompt}` : "") +
          "\n\nتنبيه: يجب أن يشمل الناتج كامل محتوى الملف من البداية إلى النهاية دون أي اختصار.";
      } else if (fileMode === "summary") {
        systemPrompt =
          "أنت أداة تلخيص مستندات رسمية عالية الدقة والأمانة. ممنوع اختراع أو استنتاج أي معلومة غير موجودة صراحةً في المستند." + HANDWRITING_RULES;
        instruction =
          "أنشئ مُلخَّصاً منظماً وفيّاً لهذا المستند بعناوين واضحة تشمل: الجهة المُصدِرة، العدد/الرقم، التاريخ، الموضوع، أهم النقاط بالترتيب، المطلوب أو الخلاصة، الاسم والمنصب في التوقيع، وأي ملاحظات بخط اليد أو نصوص أختام مقروءة. لغة المُلخَّص هي لغة المستند. " +
          (extraPrompt ? `تعليمات إضافية: ${extraPrompt}` : "");
      } else {
        // smart — استخراج وفق معايير المستخدم فقط
        if (!extraPrompt) {
          return json({ error: "وضع الاستخراج الذكي يتطلب معايير محددة (prompt)" }, 400);
        }
        systemPrompt =
          "أنت أداة استخراج ذكية عالية الدقة من المستندات الرسمية. مهمتك استخراج ما تطلبه معايير المستخدم فقط، بنص حرفي منسوخ من الملف. القواعد: انسخ القيم حرفياً دون إعادة صياغة؛ ممنوع اختراع أو استنتاج معلومة غير موجودة — إن لم تجد معلومة مطلوبة اكتب «غير موجود»؛ نصوص خط اليد والأختام تُقرأ بعناية وتُدرج عند صلتها بالمعايير؛ أعد الناتج منظماً بعنوان واضح لكل معيار، دون أي شرح إضافي." + HANDWRITING_RULES;
        instruction = `استخرج من هذا الملف ما يطابق المعايير التالية فقط، ونظّم الناتج بعنوان واضح لكل معيار:\n${extraPrompt}`;
      }

      const part = mime.startsWith("image/")
        ? { type: "image_url", image_url: { url: fileUrl } }
        : { type: "file", file: { filename: fileName, file_data: fileUrl } };
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
        body: JSON.stringify({
          model: "google/gemini-3.1-pro-preview",
          max_tokens: 32768,
          temperature: 0,
          messages: [
            { role: "system", content: systemPrompt },
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
      "مهمة نسخ حقول حرفية وليست تحليلاً: انقل القيمة المكتوبة المقابلة لكل حقل كما تظهر تماماً وكاملة. ممنوع التخمين أو التلخيص أو إعادة الصياغة أو إنشاء قيمة غير موجودة. الحقل غير الموجود أو غير المقروء قيمته سلسلة فارغة. احتفظ باللغة الأصلية والأسطر والتكرار. اقرأ النص المكتوب بخط اليد ونصوص الأختام بنفس العناية — لا تتجاهلها.";

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
        model: "google/gemini-3.1-pro-preview",
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
