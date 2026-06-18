## الهدف
إضافة نظام "ثيمات تصميم" يتيح اختيار شكل الواجهة والبطاقات من لوحة التحكم، مع 5 أنماط CSS كاملة ومختلفة جذرياً، تُطبَّق على كل البطاقات في النظام (الرئيسية، صفحة المجموعة، صفحات الأنظمة).

## الأنماط الخمسة
1. **Executive** (رسمي تنفيذي) — حواف حادة، ظلال خفيفة طبقية، خطوط أكاديمية، ألوان كحلي/ذهبي. لا تأثيرات 3D.
2. **Glass Pro** (زجاجي احترافي) — backdrop-blur، شفافية متدرجة، حواف رفيعة لامعة.
3. **Neumorphic Soft** (نيومورفك ناعم) — ظلال داخلية/خارجية متطابقة، خلفية رمادية موحدة، حواف منحنية كبيرة.
4. **Editorial Mono** (تحريري مونوكروم) — أبيض/أسود، خطوط Serif للعناوين، شريط جانبي ملون رفيع، بدون gradient.
5. **Vivid 3D** (الحالي ثلاثي الأبعاد) — يبقى كخيار افتراضي.

كل نمط يعيد تعريف: خلفية الجسم، البطاقة (الرئيسية + الفرعية)، الأيقونة، الشارة، عداد السجلات، الهيدر، الأزرار، الـ select/input، الجداول.

## التنفيذ التقني

### 1) ملف ثيمات جديد `src/styles/themes.css`
يحتوي 5 كتل تحت سلكتورات:
```css
:root[data-ui-theme="executive"] .card3d { ... }
:root[data-ui-theme="executive"] .schedule-card { ... }
:root[data-ui-theme="executive"] .schedule-header { ... }
:root[data-ui-theme="executive"] .schedule-btn { ... }
...
```
يكرر لـ `glass`, `neumorphic`, `editorial`, `vivid3d` (الافتراضي = vivid3d لذا بدون override).

كل ثيم يغيّر:
- `.card3d` و pseudo-elements و hover transform
- `.card3d__icon`, `.card3d__body`, `.card3d__count`, `.card3d__arrow`, `.card3d__orb`
- `.schedule-card`, `.schedule-header`, `.schedule-body::before/::after`
- `.schedule-btn`, `.schedule-select`, `.schedule-input`
- `.schedule-table thead th`
- بطاقات SystemGroup (الأزرار في `src/pages/SystemGroup.tsx`)

ربط الملف عبر `import` في `src/index.css`.

### 2) Hook + storage `src/lib/uiTheme.ts`
```ts
export type UiTheme = 'vivid3d'|'executive'|'glass'|'neumorphic'|'editorial';
export const UI_THEMES: {id, label, description}[];
export function getUiTheme(): UiTheme;       // من localStorage، fallback 'vivid3d'
export function setUiTheme(t: UiTheme): void; // يكتب data-ui-theme على <html> ويُطلق event
export function useUiTheme(): [UiTheme, setter];
```
يُطبَّق على `document.documentElement.setAttribute('data-ui-theme', t)`.

### 3) Bootstrap في `src/main.tsx`
قراءة الثيم وتطبيقه قبل render حتى لا يومض.

### 4) قسم في لوحة التحكم `src/pages/ControlPanel.tsx`
إضافة بطاقة "🎨 نمط التصميم العام" مع 5 أزرار اختيار، معاينة مصغرة لكل نمط (sample card)، ووصف مختصر. عند الضغط يُحدّث الثيم فوراً ويظهر toast.

### 5) ضمان التطبيق
- `SystemGroup.tsx`: تحويل الأزرار لاستخدام كلاسات `card3d` الموحدة بدل inline classes حتى تتأثر بالثيم.
- مراجعة `Dashboard.tsx` (يستخدم `card3d` أصلاً — سيعمل تلقائياً).
- التحقق من `.schedule-card` في الصفحات الفرعية.

## ملفات سيتم إنشاؤها/تعديلها
- جديد: `src/styles/themes.css`
- جديد: `src/lib/uiTheme.ts`
- تعديل: `src/index.css` (import + متغيرات قابلة للـ override)
- تعديل: `src/main.tsx` (bootstrap)
- تعديل: `src/pages/ControlPanel.tsx` (قسم اختيار الثيم)
- تعديل: `src/pages/SystemGroup.tsx` (توحيد كلاسات البطاقات مع `card3d`)

## ملاحظات
- لا تغيير على منطق البيانات أو الطباعة أو المصادقة.
- الثيم الافتراضي يبقى الحالي (Vivid 3D) لمن لم يختر.
- الثيم يُحفظ في `localStorage` لكل مستخدم/متصفح.
