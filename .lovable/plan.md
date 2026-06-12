## الهدف
رفع منشئ الأنظمة بدون كود إلى مستوى الأنظمة الأصلية مع 5 تحسينات جوهرية.

## الميزات المطلوبة

### 1) شريط جلسة التدريسي في الأنظمة المُنشأة
- عند تفعيل `require_teacher_auth`، تُضاف شارة علوية تعرض: «👤 اسم التدريسي» + زر «🚪 تسجيل الخروج» + زر «🔑 تغيير كلمة المرور» (نفس تجربة صفحة التكليفات الفردية).
- ينفذ هذا في `GenericSystem.tsx` عبر مكوّن جديد `TeacherSessionBar` يستخدم `getSession/logout` من `teacherAuth`.

### 2) نظام صلاحيات CRUD متكامل
- استبدال `crud_enabled: boolean` بـ `crud_permissions: { view, add, edit, delete }` (4 مفاتيح مستقلة).
- تحديث `SystemBuilderDialog` (الخطوة 5) لعرض 4 مفاتيح Switch بدلاً من مفتاح واحد.
- تحديث `CrudPanel.tsx` لإخفاء/إظهار أزرار «إضافة / تعديل / حذف» حسب الصلاحيات.
- التحقق من الصلاحيات أيضاً في `custom-systems` Edge Function (`sheet-write`) قبل تنفيذ العملية → رفض 403 إذا كانت العملية غير مسموحة.
- توافق رجعي: إذا وُجد `crud_enabled: true` قديم بدون `crud_permissions`، يُعامَل كأن الأربعة مفعلة.

### 3) فلاتر إجبارية (Required Filters)
- إضافة حقل `required_filters: string[]` (قائمة بحروف الأعمدة الإجبارية) إلى `CustomSystemDef`.
- في `SystemBuilderDialog` (خطوة الفلاتر): Checkbox «إجباري» بجانب كل فلتر.
- في `GenericSystem.tsx`: قبل بناء `systemConfig`، تحويل الحروف إلى `requiredFilters` (مفاتيح/تسميات) لتمريرها إلى `SingleSystemPage` الذي يدعمها أصلاً.

### 4) فلترة حسب قسم التدريسي
- توسيع `teacher_column` لتقبل أيضاً `teacher_department_column` (حرف عمود قسم التدريسي).
- في خطوة المصادقة بالبناء: إضافة قائمة منسدلة جديدة «عمود قسم التدريسي» + مفتاح «نطاق التصفية: حسب الاسم فقط / حسب القسم فقط / الاسم أو القسم».
- في `GenericSystem.tsx`: عند تطبيق `require_teacher_auth`، فلترة الصفوف حسب الإعداد المختار (يستخدم `user.full_name` و`user.department` من جلسة التدريسي).

### 5) إكمال التكافؤ مع الأنظمة الأصلية + أزرار الفلترة السريعة
- **أزرار فلاتر سريعة (Quick Filters)**: إضافة حقل `quick_filters: QuickFilter[]` حيث:
  ```
  QuickFilter = { label, icon?, color?, column (letter), op, value | values }
  ```
  - يدعم نفس `ConditionOp` (يساوي / يحتوي / مستوفي / ≠ مستوفي…).
  - تُرسم كأزرار قابلة للتفعيل أعلى الجدول داخل بطاقة «شريط الفلاتر السريعة» (نفس شكل بطاقات الإحصائيات في `SystemStatistics`).
  - يُسمح بأكثر من زر نشط (Toggle) — السلوك مطابق لـ `متابعة سير التدريسات` و«غير مستوفي» في تدقيق النصاب.
- **خطوة جديدة في `SystemBuilderDialog`** لإدارة هذه الأزرار (إضافة/حذف/ترتيب + ألوان + أيقونات).
- **تنفيذ التطبيق** داخل `GenericSystem.tsx`: يُمرّر `quickFilters` إلى `SingleSystemPage` عبر `SystemConfig` موسّع (`__quickFilters`)، ويُعرض شريط الأزرار قبل الجدول.
- **مراجعة شاملة**: مرور سريع على ميزات الأنظمة الأصلية (التوقيعات، تسميات الأعمدة، الإحصائيات، التصدير، الطباعة، شريط الفلاتر، الفلاتر الإجبارية، أزرار التكليفات الفردية، إلخ) للتأكد من أنها كلها متاحة في المنشئ.

## الملفات المتأثرة
- `src/data/customSystemsRegistry.ts` — إضافة الحقول الجديدة + توافق رجعي.
- `src/components/control-panel/SystemBuilderDialog.tsx` — UI للصلاحيات + الفلاتر الإجبارية + قسم التدريسي + الأزرار السريعة.
- `src/components/custom-systems/CrudPanel.tsx` — احترام `crud_permissions`.
- `src/pages/GenericSystem.tsx` — شريط الجلسة + فلترة القسم + تمرير `requiredFilters` و`quickFilters`.
- `src/components/shared/SingleSystemPage.tsx` — تمرير/عرض شريط الأزرار السريعة (إضافة بسيطة).
- `src/components/shared/TeacherSessionBar.tsx` — مكوّن جديد.
- `supabase/functions/custom-systems/index.ts` — التحقق من `crud_permissions` في `sheet-write`.

## ملاحظات تنفيذية
- لا تغييرات في قاعدة البيانات (الأنظمة المخصصة مُخزّنة في الـ Edge Function/Sheet).
- التوافق الرجعي مضمون: الأنظمة القديمة تستمر بالعمل كما هي.
- بعد التنفيذ سأنشر `custom-systems` Edge Function.

هل أبدأ التنفيذ؟
