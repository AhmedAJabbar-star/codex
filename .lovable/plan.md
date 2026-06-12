# خطة تنفيذ نظام الصلاحيات وإعادة هيكلة لوحة التحكم

## 1) نقل واجهة إدارة المدير إلى لوحة التحكم
- إنشاء قسم جديد في `ControlPanel.tsx` باسم **«المستخدمون والصلاحيات»**.
- نقل تبويبات «المستخدمون / الأرشيف / إعدادات الاتصال» من `IndividualAssignments.tsx` إلى هذا القسم.
- في صفحة التكليفات الفردية: تبقى فقط شاشة دخول التدريسي + عرض بياناته (بدون لوحة إدارة).
- وصول قسم «المستخدمون والصلاحيات» محمي بكلمة مرور المدير الحالية (`aa/aa`) لمرة واحدة لكل جلسة لوحة التحكم.

## 2) نظام الأدوار + الصلاحيات لكل نظام
- إضافة حقول جديدة لكل مستخدم في جدول `users` على Google Sheets:
  - `role` (موجود) — يُوسَّع إلى: `admin` / `editor` / `viewer` / `user`.
  - `permissions_json` (جديد) — JSON يحوي:
    ```json
    {
      "systems": {
        "<system_id>": { "view": true, "add": true, "edit": false, "delete": false }
      }
    }
    ```
- **الأدوار الجاهزة** (افتراضي عند غياب التخصيص):
  - `admin`: كل شيء + إدارة المستخدمين.
  - `editor`: عرض + إضافة + تعديل (لا حذف).
  - `viewer`: عرض فقط.
  - `user`: حسب صلاحيات النظام نفسه (الوضع الحالي).
- **التخصيص لكل نظام**: في واجهة المستخدم، جدول يعرض كل أنظمة منشئ الأنظمة، مع 4 مفاتيح (عرض/إضافة/تعديل/حذف) لتجاوز الدور.

## 3) واجهة الصلاحيات الجديدة (داخل لوحة التحكم)
- جدول المستخدمين الحاليين مع عمود **الدور** (Select)، وزر **«تخصيص لكل نظام»** يفتح حوار:
  - يُسرد كل الأنظمة المخصّصة (من `customSystemsRegistry`).
  - 4 Switches لكل نظام.
  - زر «استخدام افتراضي الدور».
- زر **«تطبيق على عدة مستخدمين»** لاختيار قائمة وتطبيق صلاحيات/دور دفعة واحدة.

## 4) تطبيق الصلاحيات على واجهة الأنظمة المخصّصة
- في `GenericSystem.tsx` و `CrudPanel.tsx`: قراءة صلاحيات المستخدم الحالي من جلسة التدريسي عبر دالة جديدة `getEffectivePerms(systemId)`:
  - دمج: `crud_permissions` للنظام ∩ صلاحيات المستخدم.
  - إذا لم يكن المستخدم مُسجّلاً في النظام: يستخدم الدور الافتراضي.

## 5) إلغاء كلمة المرور لكل عملية
- `CrudPanel.tsx`:
  - **إضافة / تعديل**: تُنفَّذ مباشرة دون أي إدخال كلمة سر (الجلسة + صلاحية المستخدم كافيتان).
  - **حذف**: يبقى يطلب تأكيد + كلمة مرور المدير (`aa`) لمرة واحدة، تُخزَّن في `sessionStorage` وتُستخدم تلقائيًا لباقي عمليات الحذف ضمن نفس الجلسة (لا إعادة إدخال).
- في `sheet-write` على Edge Function:
  - قبول `token` (جلسة التدريسي) بدل كلمة مدير العمليات غير الحساسة (append/update).
  - التحقق من صلاحيات المستخدم خادميًا.
  - `delete` يبقى يتطلب كلمة المدير.

## 6) ملفات ستُعدَّل / تُنشأ
**إنشاء**
- `src/components/control-panel/UsersPermissionsPanel.tsx` — الواجهة الموحّدة.
- `src/components/control-panel/UserPermissionsDialog.tsx` — حوار التخصيص لكل نظام.
- `src/lib/permissions.ts` — `getEffectivePerms`, `roleDefaults`, …

**تعديل**
- `supabase/functions/sheet-auth/index.ts` — حفظ/قراءة `permissions_json`، توسيع `role`، endpoints: `admin-set-role`, `admin-set-permissions`.
- `supabase/functions/custom-systems/index.ts` — قبول `token` بدل كلمة المدير للعمليات غير الحساسة، فحص الصلاحيات.
- `src/lib/teacherAuth.ts` — تعريف `permissions` في `TeacherUser`، دوال `adminSetRole`, `adminSetPermissions`.
- `src/components/custom-systems/CrudPanel.tsx` — تطبيق `getEffectivePerms`، إزالة طلب كلمة السر للإضافة/التعديل، تخزين كلمة الحذف في الجلسة.
- `src/pages/IndividualAssignments.tsx` — إزالة تبويبات الإدارة.
- `src/pages/ControlPanel.tsx` — تضمين `UsersPermissionsPanel`.

## 7) الأمان
- جميع فحوصات الصلاحيات تُكرَّر **خادميًا** في الـ Edge Functions (لا يكفي العميل).
- `permissions_json` يُكتب فقط بواسطة من له دور `admin` ومحمي