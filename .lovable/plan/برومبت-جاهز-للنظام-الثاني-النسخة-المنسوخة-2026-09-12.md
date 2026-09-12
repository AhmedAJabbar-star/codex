# برومبت جاهز للنظام الثاني (النسخة المنسوخة)

انسخ النص التالي وأرسله كما هو في محادثة المشروع الثاني:

---

النظام بطيء جداً ويتجمد عند فتح الأنظمة المنشأة بمنشئ الأنظمة بدون كود وعند الكتابة في البحث. نفّذ التحسينات الأربعة التالية وتحقق منها:

1) في `src/pages/GenericSystem.tsx`: الجلسة تُقرأ بـ `getSession()` مباشرة داخل الرسم، فتتغير هويتها في كل render وتجعل `build` (المستخدمة في `useCallback`) تتغير باستمرار، ما يعيد بناء كل الأسطر مع كل ضغطة مفتاح. اقرأ الجلسة مرة واحدة عبر `useMemo(() => getSession(), [])` واستخدم `sessionUser` في مصفوفة الاعتمادات.

2) في نفس الملف داخل `buildConfigFromDef`: لقطة الصف `CRUD_SNAPSHOT_KEY` تُبنى بـ `JSON.stringify` لكل سطر حتى بلا صلاحيات تعديل. ابنِها فقط عندما يكون `isCrudActive(def)` وصلاحيات المستخدم تسمح بالإضافة أو التعديل أو الحذف.

3) في `src/components/shared/SingleSystemPage.tsx`: البحث العام يستدعي `normalizeSearchText` و`normalizeArabic` و`dateAwareMatch` على كل عمود لكل سطر مع كل حرف. أضف فهرس بحث مخزَّن لكل سطر باستخدام `WeakMap` (يُعاد ضبطه عند تغيّر `system`) يخزّن نصاً واحداً مطبّعاً ونصاً عربياً مطبّعاً، واستخدمه في أوضاع البحث الثلاثة. ولا تستدعِ `dateAwareMatch` إلا إذا كان نص البحث تاريخاً فعلاً (`extractDateParts`). طبّق نفس المنطق على بحث الأعمدة.

4) التخزين المؤقت لتسريع الفتح:
- أنشئ `src/lib/sheetCache.ts` بواجهة IndexedDB بسيطة (`readSheetCache` / `writeSheetCache`) لحفظ نتيجة كل ورقة.
- في `src/components/shared/SupervisionBasePage.tsx`: اعرض النسخة المخزَّنة فوراً ثم حدّث في الخلفية، واضبط `staleTime: 2 دقائق`، `gcTime: ساعة`، `refetchOnMount: true` بدل `'always'`، `refetchOnWindowFocus: false`، `refetchInterval: 5 دقائق`، و`placeholderData: (prev) => prev`.
- في `src/data/customSystemsRegistry.ts`: خزّن قائمة الأنظمة في `localStorage` وصدّر `readCachedSystems()`، واستخدمها كـ `initialData` لاستعلام `custom-systems-list` مع `staleTime: 60 ثانية` و`refetchOnMount: true` و`refetchOnWindowFocus: false`.

احرص على بقاء زر «تحديث الآن» يجلب البيانات فوراً، وشغّل فحص الأنواع والبناء بعد التعديل.

---

## لا يلزم تنفيذ شيء في هذا المشروع

التحسينات مطبّقة هنا بالفعل؛ هذا المستند فقط لنقلها إلى المشروع الثاني.
