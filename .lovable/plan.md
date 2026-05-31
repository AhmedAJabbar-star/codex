## نظرة عامة
بناء محرّك عام (Generic System Engine) يقرأ تعريفات الأنظمة من ورقة Google Sheet جديدة باسم `systems_registry`، ويعرضها تلقائياً في الواجهة كبطاقات وصفحات كاملة بدون الحاجة لكتابة كود. مع شاشة منشئ احترافية داخل لوحة التحكم تتيح إضافة/تعديل/حذف الأنظمة.

## 1) ورقة `systems_registry` على Google Sheets

ورقة جديدة داخل نفس الجدول المنشور. أعمدتها:

| العمود | الوصف |
|---|---|
| `id` | معرّف فريد (مثل `custom_xyz`) |
| `title` | اسم النظام |
| `description` | وصف قصير |
| `icon` | أيقونة (emoji) |
| `color` | لون البطاقة (hex) |
| `sheet_gid` | GID الورقة المصدر |
| `columns_range` | نطاق الأعمدة المعروضة (مثل `F:N`) |
| `filter_columns` | الأعمدة لقوائم الفلترة مفصولة بفواصل (مثل `G,F,E`) |
| `conditions_json` | JSON لشروط الفلترة المركّبة |
| `protected` | TRUE/FALSE |
| `password` | كلمة المرور |
| `hint` | نص توضيحي |
| `enabled` | TRUE/FALSE |

### صيغة `conditions_json`
مصفوفة شروط تُجمَع بـ AND، مع دعم OR داخل كل شرط:
```json
[
  { "column": "E", "op": "contains_any", "values": ["استاذ", "أستاذ"] },
  { "column": "C", "op": "neq", "value": "مجاز" },
  { "column": "N", "op": "eq_number", "value": 0 }
]
```
العمليات المدعومة: `eq`, `neq`, `contains`, `contains_any`, `not_contains`, `eq_number`, `gt`, `lt`, `gte`, `lte`, `is_empty`, `is_not_empty`, `regex`.

### أعمدة مشتقة (اختياري متقدم)
عمود `derived_columns_json` لتوليد عمود فلترة افتراضي (مثل "الفصل الدراسي" في `TeachersWithoutTheory`):
```json
[{ "name": "الفصل", "from_columns": {"S": "الاول", "T": "الثاني"}, "match": "is_zero" }]
```

## 2) المحرّك العام `GenericSystemPage`

ملف جديد `src/pages/GenericSystem.tsx` يستخدم `SupervisionBasePage` ويبني `SystemConfig` ديناميكياً من تعريف النظام:
- يحلّل `columns_range` (`F:N` → فهارس الأعمدة)
- يطبّق `conditions_json` على كل صف
- يبني `filters[]` من `filter_columns`
- يولّد الأعمدة المشتقة

## 3) تسجيل ديناميكي

- `src/data/customSystemsRegistry.ts`: جلب الورقة وتطبيعها والـ cache (`useQuery` مع refetch كل 60 ثانية)
- `src/App.tsx`: إضافة مسار شامل `/custom/:id` → `GenericSystem`
- `src/pages/Dashboard.tsx`: قراءة الأنظمة المخصّصة وعرضها كبطاقات بنفس نمط الأنظمة الحالية، مع احتساب العداد
- `src/lib/systemAccess.ts`: دمج التعريفات المخصّصة في `SYSTEMS_REGISTRY` ديناميكياً

## 4) شاشة المنشئ في لوحة التحكم

قسم جديد في `ControlPanel.tsx` بعنوان "منشئ الأنظمة":
- **قائمة الأنظمة المخصّصة** مع أزرار تعديل/حذف/تعطيل
- **زر "نظام جديد"** يفتح حواراً متعدد الخطوات (Stepper):
  1. **الأساسيات**: العنوان، الوصف، الأيقونة، اللون
  2. **مصدر البيانات**: GID + نطاق الأعمدة المعروضة (مع معاينة الأعمدة)
  3. **الفلاتر**: اختيار الأعمدة (drag list) + تحديد نوع التحكم (select/combo)
  4. **الشروط**: محرّر مرئي للشروط — صفوف ديناميكية (عمود + عملية + قيمة) مع AND ضمنية
  5. **الحماية**: محمي/كلمة مرور
  6. **معاينة مباشرة** للبيانات المرشّحة قبل الحفظ
- **الحفظ**: عبر edge function جديد `custom-systems` يكتب إلى ورقة `systems_registry` بنفس آلية `sheet-auth` (Service Account JWT)

## 5) Edge Function `custom-systems`

`supabase/functions/custom-systems/index.ts`:
- `POST /add` — يكتب صفاً جديداً
- `POST /update` — يحدّث صفاً بالـ id
- `POST /delete` — يحذف الصف
- مصادقة بكلمة مرور المدير (نفس نمط `system-rules`)
- يقرأ `GOOGLE_SHEET_ID` و`GOOGLE_SERVICE_ACCOUNT_JSON` الموجودين

## 6) الملفات المتأثرة

**جديدة**:
- `src/pages/GenericSystem.tsx`
- `src/data/customSystemsRegistry.ts`
- `src/lib/conditionEngine.ts` — منطق تقييم الشروط
- `src/components/control-panel/SystemBuilderDialog.tsx`
- `src/components/control-panel/ConditionEditor.tsx`
- `src/components/control-panel/SystemPreview.tsx`
- `supabase/functions/custom-systems/index.ts`

**معدّلة**:
- `src/App.tsx` — مسار `/custom/:id`
- `src/pages/Dashboard.tsx` — عرض البطاقات المخصّصة + العداد
- `src/pages/ControlPanel.tsx` — قسم منشئ الأنظمة
- `src/lib/systemAccess.ts` — دمج التعريفات

## 7) خطوة يدوية مطلوبة منك قبل التشغيل

إضافة ورقة جديدة في جدول Google Sheets المنشور باسم **`systems_registry`** بالأعمدة المذكورة في القسم (1) — صف العناوين فقط. الـ GID الناتج سأضيفه في `src/data/supervisionData.ts`.

## 8) ملاحظات تقنية

- المعالجة العربية: تطبيع الهمزة (أ/إ/آ → ا) تلقائياً في `contains` و`contains_any`
- `columns_range` يقبل صيغة `F:N` أو `F,G,I,K` لاختيار غير متتالٍ
- التحديث التلقائي كل 60 ثانية للأنظمة المخصّصة كبقية الأنظمة
- بطاقات الأنظمة المخصّصة تظهر بنفس تصميم الأنظمة الأصلية
- الـ id يُولَّد تلقائياً من العنوان (slug) عند الإنشاء