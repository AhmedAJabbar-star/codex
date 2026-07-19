import { useState } from 'react';
import { toast } from 'sonner';
import type { CustomSystemDef, FilterConfigItem, FilterRule, SignatureItem } from '@/data/customSystemsRegistry';
import { EMPTY_SYSTEM, saveCustomSystem, deleteCustomSystem } from '@/data/customSystemsRegistry';
import { OP_LABELS, type Condition, type ConditionOp, parseColumnsRange, colIndexToLetter } from '@/lib/conditionEngine';
const COLORS = ['#475569','#0891b2','#16a34a','#dc2626','#7c3aed','#d97706','#0ea5e9','#e11d48','#059669','#a16207','#1e40af','#be123c'];

const ICONS = [
  // Original
  '📋','📊','📚','🗂️','🛡️','🎯','🧭','⚙️','📈','🧪','🎓','📁','🏛️','🧰','🔖','⚠️','🚨','📐','🧑‍🏫','🧑‍🎓',
  // HR / People
  '👥','🧑‍💼','👨‍💼','👩‍💼','🪪','🧾','📇','🕴️','🤝','🧠','🧑‍🔧','🧑‍🏭','🧑‍🚀','🪖','🎖️',
  // Finance
  '💰','💵','💴','💳','🏦','🧮','📉','💹','🧾','🪙','💎','🧧',
  // Academic
  '📖','📝','✏️','🖋️','🖊️','📜','🏫','🔬','🔭','🧫','🧬','📔','📕','📗','📘','📙',
  // Office / Admin
  '📅','📆','🗓️','📌','📍','🔗','📎','🗃️','🗄️','📤','📥','✉️','📨','📧',
];
const OPS: ConditionOp[] = ['eq','neq','contains','not_contains','token_match','not_token_match','contains_any','eq_number','gt','lt','gte','lte','is_empty','is_not_empty'];
const NEEDS_VALUE: Record<ConditionOp, boolean> = {
  eq: true, neq: true, contains: true, not_contains: true, contains_any: false,
  token_match: true, not_token_match: true,
  eq_number: true, gt: true, lt: true, gte: true, lte: true,
  is_empty: false, is_not_empty: false, regex: false,
};

/** Split a free-text multi-value input on any of: comma, Arabic comma, dash, semicolon, newline, or pipe. */
const splitMulti = (s: string): string[] =>
  (s || '').split(/[,،\-;\n|]+/).map((v) => v.trim()).filter(Boolean);

interface Props {
  initial: CustomSystemDef | null; // null = create new
  onClose: () => void;
  onSaved: () => void;
}

const SystemBuilderDialog = ({ initial, onClose, onSaved }: Props) => {
  const [s, setS] = useState<CustomSystemDef>(() => initial ?? { ...EMPTY_SYSTEM });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const patch = (p: Partial<CustomSystemDef>) => setS((prev) => ({ ...prev, ...p }));

  const addCondition = () => patch({ conditions: [...s.conditions, { column: 'A', op: 'eq', value: '' }] });
  const updCondition = (i: number, p: Partial<Condition>) =>
    patch({ conditions: s.conditions.map((c, idx) => idx === i ? { ...c, ...p } : c) });
  const delCondition = (i: number) => patch({ conditions: s.conditions.filter((_, idx) => idx !== i) });

  // Header labels (column letter -> display name)
  const labels: Record<string, string> = s.header_labels || {};
  const colLetters = parseColumnsRange(s.columns_range).map((i) => colIndexToLetter(i));
  const setLabel = (letter: string, value: string) => {
    const next = { ...(s.header_labels || {}) };
    if (value.trim()) next[letter] = value; else delete next[letter];
    patch({ header_labels: next });
  };

  // Link button labels per column (letter -> button text e.g. "افتح الملف")
  const linkLabels: Record<string, string> = s.column_link_labels || {};
  const setLinkLabel = (letter: string, value: string) => {
    const next = { ...(s.column_link_labels || {}) };
    if (value.trim()) next[letter] = value.trim(); else delete next[letter];
    patch({ column_link_labels: next });
  };

  // Filters config
  const filtersCfg: FilterConfigItem[] = s.filters_config || [];
  const addFilter = () => patch({ filters_config: [...filtersCfg, { column: 'A', control: 'select' }] });
  const updFilter = (i: number, p: Partial<FilterConfigItem>) =>
    patch({ filters_config: filtersCfg.map((f, idx) => idx === i ? { ...f, ...p } : f) });
  const delFilter = (i: number) => patch({ filters_config: filtersCfg.filter((_, idx) => idx !== i) });
  const moveFilter = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= filtersCfg.length) return;
    const next = [...filtersCfg];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ filters_config: next });
  };

  // Per-filter rules helpers
  const addRule = (fi: number) => {
    const f = filtersCfg[fi]; const rules = [...(f.rules || []), { label: '', op: 'is_not_empty' as ConditionOp }];
    updFilter(fi, { rules });
  };
  const updRule = (fi: number, ri: number, p: Partial<FilterRule>) => {
    const f = filtersCfg[fi]; const rules = (f.rules || []).map((r, idx) => idx === ri ? { ...r, ...p } : r);
    updFilter(fi, { rules });
  };
  const delRule = (fi: number, ri: number) => {
    const f = filtersCfg[fi]; const rules = (f.rules || []).filter((_, idx) => idx !== ri);
    updFilter(fi, { rules });
  };
  const moveRule = (fi: number, ri: number, dir: -1 | 1) => {
    const f = filtersCfg[fi]; const rules = [...(f.rules || [])];
    const rj = ri + dir;
    if (rj < 0 || rj >= rules.length) return;
    [rules[ri], rules[rj]] = [rules[rj], rules[ri]];
    updFilter(fi, { rules });
  };

  // Signatures
  const sigs: SignatureItem[] = s.signatures || [];
  const addSig = () => patch({ signatures: [...sigs, { label: '', name: '' }] });
  const updSig = (i: number, p: Partial<SignatureItem>) =>
    patch({ signatures: sigs.map((x, idx) => idx === i ? { ...x, ...p } : x) });
  const delSig = (i: number) => patch({ signatures: sigs.filter((_, idx) => idx !== i) });

  const handleSave = async () => {
    if (!s.title.trim()) { toast.error('العنوان مطلوب'); setStep(1); return; }
    if (!s.sheet_gid.trim()) { toast.error('GID للورقة المصدر مطلوب'); setStep(2); return; }
    const password = window.prompt('أدخل كلمة مرور لوحة التحكم لتأكيد الحفظ:');
    if (password === null) return;
    setBusy(true);
    try {
      await saveCustomSystem(s, password, initial?.id && initial.id !== s.id ? initial.id : undefined);
      toast.success('تم حفظ النظام بنجاح');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!initial?.id) return;
    if (!confirm(`حذف النظام "${initial.title}"؟`)) return;
    const password = window.prompt('أدخل كلمة مرور لوحة التحكم لتأكيد الحذف:');
    if (password === null) return;
    setBusy(true);
    try {
      await deleteCustomSystem(initial.id, password);
      toast.success('تم حذف النظام');
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const Step = ({ n, label }: { n: number; label: string }) => (
    <button
      onClick={() => setStep(n)}
      className="px-3 py-2 rounded-lg text-xs font-black border-2 transition-all"
      style={{
        background: step === n ? s.color : 'white',
        color: step === n ? 'white' : '#1e293b',
        borderColor: step === n ? s.color : '#cbd5e1',
      }}
    >{n}. {label}</button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ background: `${s.color}15` }}>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{s.icon || '📋'}</div>
            <div>
              <h2 className="text-lg font-black">{initial ? 'تعديل نظام' : 'نظام جديد'}</h2>
              <p className="text-xs text-slate-500">{s.title || 'بدون عنوان'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-500 hover:text-slate-900">✕</button>
        </header>

        <div className="px-5 py-3 border-b flex flex-wrap gap-2 bg-slate-50">
          <Step n={1} label="الأساسيات" />
          <Step n={2} label="المصدر والأعمدة" />
          <Step n={3} label="الفلاتر" />
          <Step n={4} label="الشروط" />
          <Step n={5} label="الحماية والصلاحيات" />
          <Step n={6} label="أزرار سريعة" />
          <Step n={7} label="إعدادات الطباعة" />
          <Step n={8} label="ميزات متقدمة" />
        </div>

        <div className="px-5 py-4 overflow-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-black mb-1">عنوان النظام *</label>
                <input className="schedule-select w-full" value={s.title} onChange={(e) => patch({ title: e.target.value })} placeholder="مثال: التدريسيون غير المكلفين" />
                <p className="text-xs text-slate-500 mt-1">هذا العنوان يظهر للمستخدم في البطاقات وشريط النظام.</p>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">اسم الرابط بالإنكليزية (URL slug)</label>
                <input
                  className="schedule-select w-full"
                  dir="ltr"
                  value={s.id}
                  onChange={(e) => {
                    const v = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                      .slice(0, 60);
                    patch({ id: v });
                  }}
                  placeholder="مثال: monthly-assignments"
                />
                <p className="text-xs text-slate-500 mt-1">
                  يظهر في رابط الوصول للنظام: <code dir="ltr">/custom/{s.id || '<اترك-فارغاً-للتوليد-التلقائي>'}</code>.
                  اسمح فقط بحروف إنكليزية صغيرة وأرقام و <code>-</code> و <code>_</code>.
                  {initial && <span className="text-red-600 font-black"> — تحذير: تغيير هذا الحقل لنظام موجود يكسر الروابط المحفوظة.</span>}
                </p>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">الوصف</label>
                <textarea className="schedule-select w-full" rows={2} value={s.description} onChange={(e) => patch({ description: e.target.value })} placeholder="وصف موجز يظهر تحت البطاقة" />
              </div>
              <div>
                <label className="block text-sm font-black mb-1">نص توضيحي (يظهر في أعلى صفحة النظام)</label>
                <input className="schedule-select w-full" value={s.hint} onChange={(e) => patch({ hint: e.target.value })} placeholder="مثال: اختر القسم والفصل الدراسي لعرض البيانات المناسبة" />
              </div>
              <div>
                <label className="block text-sm font-black mb-1">موضع الظهور في الواجهة الرئيسية</label>
                <input
                  type="number"
                  min={1}
                  className="schedule-select w-full"
                  value={Number.isFinite(Number(s.sort_order)) ? Number(s.sort_order) : 100}
                  onChange={(e) => patch({ sort_order: parseInt(e.target.value || '100', 10) || 100 })}
                  placeholder="مثلاً: 1 = الأول، 25 = البطاقة رقم 25"
                />
                <p className="text-xs text-slate-500 mt-1">رقم ترتيب البطاقة بين باقي الأنظمة (الأصغر يظهر أولاً). الافتراضي 100 = نهاية القائمة تقريباً.</p>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">الأيقونة</label>
                <div className="flex flex-wrap gap-1">
                  {ICONS.map((ic) => (
                    <button key={ic} onClick={() => patch({ icon: ic })}
                      className="w-10 h-10 rounded-lg border-2 text-xl"
                      style={{ borderColor: s.icon === ic ? s.color : '#cbd5e1', background: s.icon === ic ? `${s.color}20` : 'white' }}
                    >{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">اللون</label>
                <div className="flex flex-wrap gap-1">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => patch({ color: c })}
                      className="w-8 h-8 rounded-full border-2"
                      style={{ background: c, borderColor: s.color === c ? '#111' : 'transparent' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                <strong className="text-sm">مصدر البيانات</strong>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="radio" name="sheet_source" checked={(s.sheet_source || 'current') === 'current'}
                      onChange={() => patch({ sheet_source: 'current', sheet_url: '' })} />
                    الجدول الحالي للمشروع (عبر GID فقط)
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input type="radio" name="sheet_source" checked={s.sheet_source === 'external'}
                      onChange={() => patch({ sheet_source: 'external' })} />
                    جدول Google Sheets خارجي (رابط + GID)
                  </label>
                </div>
                {s.sheet_source === 'external' && (
                  <div className="space-y-1">
                    <label className="block text-xs font-black">رابط ملف Google Sheets *</label>
                    <input className="schedule-select w-full" value={s.sheet_url || ''}
                      onChange={(e) => patch({ sheet_url: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/d/<ID>/edit" />
                    <p className="text-[11px] text-slate-500">
                      تأكد أن الملف مشارَك بـ «أي شخص لديه الرابط - مشاهد» أو منشور للويب لتمكين القراءة بصيغة CSV.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-black mb-1">GID الورقة المصدر *</label>
                <input className="schedule-select w-full" value={s.sheet_gid} onChange={(e) => patch({ sheet_gid: e.target.value })} placeholder="مثال: 1081297434" />
                <p className="text-xs text-slate-500 mt-1">رقم GID للورقة داخل الملف المختار أعلاه.</p>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">نطاق الأعمدة المعروضة *</label>
                <input className="schedule-select w-full" value={s.columns_range} onChange={(e) => patch({ columns_range: e.target.value })} placeholder="مثال: A:B,D:J,L أو F,G,I,K" />
                <p className="text-xs text-slate-500 mt-1">يدعم نطاقات متعددة بفواصل: مثال <code>A:B,D:J,L</code>. الترتيب يحدد ترتيب الأعمدة.</p>
              </div>

              {colLetters.length > 0 && (
                <div>
                  <label className="block text-sm font-black mb-2">تسميات الأعمدة + أزرار الروابط (اختياري)</label>
                  <div className="space-y-2">
                    {colLetters.map((L) => (
                      <div key={L} className="grid grid-cols-12 gap-2 items-center">
                        <span className="col-span-1 text-xs font-black text-center bg-slate-100 rounded py-2">{L}</span>
                        <input
                          className="schedule-select col-span-6"
                          value={labels[L] || ''}
                          onChange={(e) => setLabel(L, e.target.value)}
                          placeholder={`اسم بديل للعمود ${L} (اختياري)`}
                        />
                        <input
                          className="schedule-select col-span-5"
                          value={linkLabels[L] || ''}
                          onChange={(e) => setLinkLabel(L, e.target.value)}
                          placeholder="🔗 نص زر الرابط (مثل: افتح الملف)"
                          title="عند تعبئة هذا الحقل، إذا كانت الخلية تحتوي رابطاً (https://...) فستظهر كزر قابل للضغط بهذا النص بدلاً من عرض الرابط الطويل."
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    💡 لجعل العمود يعرض زراً قابلاً للنقر (مثل «افتح الملف») بدلاً من رابط طويل، اكتب نص الزر في الحقل الأيسر.
                    سيظهر الزر تلقائياً للخلايا التي تبدأ بـ <code>http://</code> أو <code>https://</code>.
                  </p>
                </div>
              )}
            </div>
          )}


          {step === 3 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <strong className="text-sm">فلاتر متقدمة (لكل فلتر: عمود + عنوان + نوع التحكم)</strong>
                <button className="schedule-btn schedule-btn-primary" onClick={addFilter} style={{ minHeight: 32, padding: '4px 10px' }}>➕ فلتر</button>
              </div>

              {filtersCfg.length === 0 && (
                <>
                  <p className="text-xs text-slate-500 text-center py-2">لا توجد فلاتر مفصّلة — يمكنك استخدام الحقل السريع بالأسفل أو إضافة فلاتر.</p>
                  <label className="block text-sm font-black mb-1">حقل سريع (حروف الأعمدة بفواصل)</label>
                  <input className="schedule-select w-full" value={s.filter_columns} onChange={(e) => patch({ filter_columns: e.target.value })} placeholder="مثال: G,F,E" />
                </>
              )}

              <div className="space-y-3">
                {filtersCfg.map((f, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-lg border space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input className="schedule-select col-span-2" value={f.column} onChange={(e) => updFilter(i, { column: e.target.value.toUpperCase() })} placeholder="عمود (مثال: G)" />
                      <input className="schedule-select col-span-5" value={f.label || ''} onChange={(e) => updFilter(i, { label: e.target.value })} placeholder="عنوان الفلتر الظاهر للمستخدم (اختياري)" />
                      <select className="schedule-select col-span-3" value={f.control || 'select'} onChange={(e) => updFilter(i, { control: e.target.value as any })}>
                        <option value="select">قائمة منسدلة</option>
                        <option value="combo">قائمة + بحث</option>
                        <option value="text">نص حر</option>
                        <option value="numberRange">نطاق رقمي (من — إلى)</option>
                        <option value="dateRange">نطاق تاريخ (من — إلى)</option>
                      </select>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <button onClick={() => moveFilter(i, -1)} disabled={i === 0} className="px-2 py-1 rounded border text-xs font-black disabled:opacity-30" title="نقل لأعلى">▲</button>
                        <button onClick={() => moveFilter(i, 1)} disabled={i === filtersCfg.length - 1} className="px-2 py-1 rounded border text-xs font-black disabled:opacity-30" title="نقل لأسفل">▼</button>
                        <button onClick={() => delFilter(i)} className="text-red-600 font-black text-lg px-1" title="حذف">✕</button>
                      </div>
                    </div>
                    {f.control === 'combo' && (
                      <input
                        className="schedule-select w-full"
                        value={f.search_placeholder || ''}
                        onChange={(e) => updFilter(i, { search_placeholder: e.target.value })}
                        placeholder="نص الإيضاح داخل مربع البحث (مثال: ابحث عن قسم، رقم، أو اسم...)"
                      />
                    )}
                    <label className="flex items-center gap-2 text-xs font-black bg-amber-50 border border-amber-200 rounded px-2 py-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!f.required}
                        onChange={(e) => updFilter(i, { required: e.target.checked })}
                      />
                      <span>⛔ فلتر إجباري — لا يتم عرض أي بيانات قبل اختياره (مثل «الفصل الدراسي» في تكليفات التدريسي)</span>
                    </label>

                    <details>
                      <summary className="cursor-pointer text-xs font-black text-slate-700">
                        خيارات مخصّصة (قواعد) — {(f.rules || []).length}
                      </summary>
                      <div className="mt-2 space-y-2">
                        <p className="text-[11px] text-slate-500">
                          عند إضافة قواعد، تتحوّل القائمة المنسدلة لعرض هذه الخيارات بدلاً من قيم الخلية. كل خيار = تسمية + شرط على نفس العمود.
                          مثال: <code>«لديه منصب»</code> + <code>غير فارغ</code>، أو <code>«يدرّس في الموقع X»</code> + <code>يحتوي على</code> + <code>X</code>.
                        </p>
                        <label className="flex items-center gap-2 text-xs font-black bg-white p-2 rounded border cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!f.include_values}
                            onChange={(e) => updFilter(i, { include_values: e.target.checked })}
                          />
                          <span>إظهار القيم الفردية للعمود مع الخيارات المخصّصة</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            (يدمج قيم الخلية الفعلية — بما فيها القيم المفصولة بسطر جديد — مع قواعدك في نفس القائمة)
                          </span>
                        </label>
                        {(f.rules || []).map((r, ri) => (
                          <div key={ri} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded border">
                            <input
                              className="schedule-select col-span-3"
                              value={r.label}
                              onChange={(e) => updRule(i, ri, { label: e.target.value })}
                              placeholder="اسم الخيار الظاهر في القائمة"
                            />
                            <select
                              className="schedule-select col-span-3"
                              value={r.op}
                              onChange={(e) => updRule(i, ri, { op: e.target.value as ConditionOp, value: '', values: [] })}
                            >
                              {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                            </select>
                            {r.op === 'contains_any' ? (
                              <input
                                className="schedule-select col-span-4"
                                value={(r.values || []).join(', ')}
                                onChange={(e) => updRule(i, ri, { values: splitMulti(e.target.value) })}
                                placeholder="قيم مفصولة (,  ،  -  |  أو سطر جديد)"
                              />
                            ) : NEEDS_VALUE[r.op] ? (
                              <input
                                className="schedule-select col-span-4"
                                value={String(r.value ?? '')}
                                onChange={(e) => updRule(i, ri, { value: e.target.value })}
                                placeholder="القيمة المطلوب مطابقتها"
                              />
                            ) : (
                              <div className="col-span-4 text-[11px] text-slate-400 text-center">— لا قيمة —</div>
                            )}
                            <div className="col-span-2 flex items-center justify-end gap-1">
                              <button onClick={() => moveRule(i, ri, -1)} disabled={ri === 0} className="px-1.5 py-1 rounded border text-[10px] font-black disabled:opacity-30" title="نقل لأعلى">▲</button>
                              <button onClick={() => moveRule(i, ri, 1)} disabled={ri === (f.rules || []).length - 1} className="px-1.5 py-1 rounded border text-[10px] font-black disabled:opacity-30" title="نقل لأسفل">▼</button>
                              <button onClick={() => delRule(i, ri)} className="text-red-600 font-black text-lg px-1" title="حذف">✕</button>
                            </div>
                          </div>
                        ))}
                        <button
                          className="schedule-btn"
                          onClick={() => addRule(i)}
                          style={{ minHeight: 30, padding: '4px 10px', fontSize: 12 }}
                        >➕ إضافة خيار</button>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong className="text-sm">شروط تصفية الصفوف</strong>
                  <select
                    className="schedule-select"
                    value={s.conditions_logic || 'AND'}
                    onChange={(e) => patch({ conditions_logic: e.target.value as 'AND' | 'OR' })}
                    style={{ minWidth: 120 }}
                  >
                    <option value="AND">الكل (AND)</option>
                    <option value="OR">أي شرط (OR)</option>
                  </select>
                </div>
                <button className="schedule-btn schedule-btn-primary" onClick={addCondition} style={{ minHeight: 32, padding: '4px 10px' }}>➕ شرط</button>
              </div>
              {s.conditions.length === 0 && <p className="text-xs text-slate-500 text-center py-3">لا توجد شروط — سيتم عرض كل الصفوف</p>}
              <div className="space-y-2">
                {s.conditions.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                    <input className="schedule-select col-span-2" value={c.column} onChange={(e) => updCondition(i, { column: e.target.value.toUpperCase() })} placeholder="عمود (مثال: E)" />
                    <select className="schedule-select col-span-4" value={c.op} onChange={(e) => updCondition(i, { op: e.target.value as ConditionOp, value: '', values: [] })}>
                      {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                    </select>
                    {c.op === 'contains_any' ? (
                      <input className="schedule-select col-span-5"
                        value={(c.values || []).join(', ')}
                        onChange={(e) => updCondition(i, { values: splitMulti(e.target.value) })}
                        placeholder="قيم مفصولة بأي من (, ، - | سطر جديد): مثل استاذ، أستاذ" />
                    ) : NEEDS_VALUE[c.op] ? (
                      <input className="schedule-select col-span-5" value={String(c.value ?? '')} onChange={(e) => updCondition(i, { value: e.target.value })} placeholder="القيمة المطلوب مطابقتها في العمود" />
                    ) : (
                      <div className="col-span-5 text-xs text-slate-400 text-center">— لا قيمة —</div>
                    )}
                    <button onClick={() => delCondition(i)} className="col-span-1 text-red-600 font-black">✕</button>
                  </div>
                ))}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-black text-slate-600">أعمدة مشتقة (متقدم) — JSON</summary>
                <textarea className="schedule-select w-full mt-2 font-mono text-xs" rows={4}
                  value={JSON.stringify(s.derived_columns, null, 2)}
                  onChange={(e) => { try { patch({ derived_columns: JSON.parse(e.target.value) }); } catch { /* ignore */ } }}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  مثال: [{`{"name":"الفصل","from_columns":{"S":"الاول","T":"الثاني"},"match":"is_zero"}`}]
                </p>
              </details>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <strong className="text-sm">تواقيع الطباعة</strong>
                  <button className="schedule-btn schedule-btn-primary" onClick={addSig} style={{ minHeight: 32, padding: '4px 10px' }}>➕ توقيع</button>
                </div>
                {sigs.length === 0 && <p className="text-xs text-slate-500 text-center py-2">سيتم استخدام التواقيع الافتراضية للنظام.</p>}
                {sigs.map((sig, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input className="schedule-select col-span-4" value={sig.label} onChange={(e) => updSig(i, { label: e.target.value })} placeholder="المنصب (مثال: عميد الكلية / رئيس القسم)" />
                    <input className="schedule-select col-span-7" value={sig.name || ''} onChange={(e) => updSig(i, { name: e.target.value })} placeholder="اسم الشخص المكتوب في التوقيع الرسمي" />
                    <button onClick={() => delSig(i)} className="col-span-1 text-red-600 font-black">✕</button>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={s.protected} onChange={(e) => patch({ protected: e.target.checked })} />
                حماية بكلمة سر
              </label>
              {s.protected && (
                <input className="schedule-select w-full" value={s.password} onChange={(e) => patch({ password: e.target.value })} placeholder="كلمة المرور لحماية دخول النظام (إذا فُعّلت الحماية)" />
              )}
              <label className="flex items-center gap-2 text-sm font-bold mt-3">
                <input type="checkbox" checked={s.enabled !== false} onChange={(e) => patch({ enabled: e.target.checked })} />
                تفعيل النظام (إظهاره في الواجهة الرئيسية)
              </label>

              <div className="border-2 border-amber-300 rounded-lg p-3 bg-amber-50/60 mt-3 space-y-2">
                <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!s.require_teacher_auth}
                    onChange={(e) => patch({ require_teacher_auth: e.target.checked })}
                  />
                  <span>
                    اشتراط دخول التدريسي (كما في «التكليفات الفردية»)
                    <span className="block text-[11px] font-normal text-slate-600 mt-1">
                      عند التفعيل، يظهر شريط علوي باسم المستخدم وزر تسجيل خروج. اختياره يُحدد كيف تُصفّى الصفوف للتدريسي.
                    </span>
                  </span>
                </label>
                {s.require_teacher_auth && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-black mb-1">عمود اسم التدريسي في الورقة (حرف Excel)</label>
                        <input
                          className="schedule-select w-full"
                          value={s.teacher_column || ''}
                          onChange={(e) => patch({ teacher_column: e.target.value.toUpperCase().trim() })}
                          placeholder="أدخل حرف العمود (مثال: F)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-black mb-1">عمود قسم التدريسي في الورقة (حرف Excel)</label>
                        <input
                          className="schedule-select w-full"
                          value={s.teacher_department_column || ''}
                          onChange={(e) => patch({ teacher_department_column: e.target.value.toUpperCase().trim() })}
                          placeholder="أدخل حرف العمود (مثال: P)"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-black mb-1">نطاق تصفية الصفوف للتدريسي</label>
                      <select
                        className="schedule-select w-full"
                        value={s.teacher_filter_scope || 'name'}
                        onChange={(e) => patch({ teacher_filter_scope: e.target.value as any })}
                      >
                        <option value="name">حسب الاسم فقط</option>
                        <option value="department">حسب القسم فقط</option>
                        <option value="name_or_department">الاسم أو القسم (مناسب لرئيس القسم)</option>
                        <option value="all">بدون تصفية (يرى كل الصفوف بعد الدخول)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* CRUD section — granular permissions */}
              {(() => {
                const perms = (s.crud_permissions || {}) as any;
                const legacyAll = s.crud_enabled === true && !s.crud_permissions;
                const cur = {
                  view:   perms.view   ?? legacyAll,
                  add:    perms.add    ?? legacyAll,
                  edit:   perms.edit   ?? legacyAll,
                  delete: perms.delete ?? legacyAll,
                };
                const setPerm = (k: 'view'|'add'|'edit'|'delete', v: boolean) => {
                  const next = { ...cur, [k]: v };
                  patch({ crud_permissions: next, crud_enabled: !!(next.view || next.add || next.edit || next.delete) });
                };
                const anyOn = !!(cur.view || cur.add || cur.edit || cur.delete);
                const PermToggle = ({ k, label, icon }: { k: 'view'|'add'|'edit'|'delete'; label: string; icon: string }) => (
                  <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer text-sm font-bold transition-all ${cur[k] ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={cur[k]} onChange={(e) => setPerm(k, e.target.checked)} />
                    <span>{icon} {label}</span>
                  </label>
                );
                return (
                  <div className="border-2 border-cyan-300 rounded-lg p-3 bg-cyan-50/40 mt-3 space-y-3">
                    <div>
                      <strong className="text-sm">🛠️ صلاحيات إدارة البيانات (CRUD)</strong>
                      <p className="text-[11px] text-slate-600 mt-1">
                        فعّل ما تريد إتاحته في لوحة الإدارة. يُكتب التغيير مباشرة في ورقة Google Sheets المصدر ويتطلب كلمة مرور لوحة التحكم.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <PermToggle k="view"   label="عرض/بحث"   icon="👁️" />
                      <PermToggle k="add"    label="إضافة"      icon="➕" />
                      <PermToggle k="edit"   label="تعديل"      icon="✏️" />
                      <PermToggle k="delete" label="حذف"        icon="🗑️" />
                    </div>
                    {anyOn && colLetters.length > 0 && (
                      <details className="mt-2" open>
                        <summary className="cursor-pointer text-xs font-black text-slate-700">
                          ⚙️ أنواع حقول الإدخال لكل عمود ({colLetters.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          {colLetters.map((L) => {
                            const ct = (s.column_types || {})[L] || 'text';
                            const opts = (s.column_options || {})[L] || '';
                            const src = (s.column_select_source || {})[L] || 'manual';
                            const allowCustom = !!(s.column_select_allow_custom || {})[L];
                            return (
                              <div key={L} className="bg-white p-2.5 rounded-lg border space-y-2">
                                <div className="grid grid-cols-12 gap-2 items-center">
                                  <span className="col-span-1 text-xs font-black text-center bg-slate-100 rounded py-1.5">{L}</span>
                                  <span className="col-span-7 text-xs font-bold truncate">{labels[L] || `عمود ${L}`}</span>
                                  <select
                                    className="schedule-select col-span-4"
                                    value={ct}
                                    onChange={(e) => patch({ column_types: { ...(s.column_types || {}), [L]: e.target.value as any } })}
                                  >
                                    <option value="text">✏️ نص</option>
                                    <option value="number">🔢 رقم</option>
                                    <option value="date">📅 تاريخ</option>
                                    <option value="select">📋 قائمة منسدلة</option>
                                    <option value="readonly">🔒 قراءة فقط</option>
                                  </select>
                                </div>
                                {ct === 'select' && (
                                  <div className="space-y-2 pt-1 border-t border-dashed">
                                    <div className="flex flex-wrap gap-3 text-[11px] font-bold">
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name={`src-${L}`} checked={src === 'manual'}
                                          onChange={() => patch({ column_select_source: { ...(s.column_select_source || {}), [L]: 'manual' } })} />
                                        خيارات يدوية
                                      </label>
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name={`src-${L}`} checked={src === 'column'}
                                          onChange={() => patch({ column_select_source: { ...(s.column_select_source || {}), [L]: 'column' } })} />
                                        القيم الفريدة من نفس العمود
                                      </label>
                                      <label className="flex items-center gap-1.5 cursor-pointer mr-auto bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                        <input type="checkbox" checked={allowCustom}
                                          onChange={(e) => patch({ column_select_allow_custom: { ...(s.column_select_allow_custom || {}), [L]: e.target.checked } })} />
                                        السماح بإدخال قيمة جديدة غير موجودة
                                      </label>
                                    </div>
                                    {src === 'manual' && (
                                      <input className="schedule-select w-full text-xs" value={opts}
                                        onChange={(e) => patch({ column_options: { ...(s.column_options || {}), [L]: e.target.value } })}
                                        placeholder="الخيارات مفصولة بفاصلة (,) أو سطر جديد — مثال: نشِط، متوقف، مؤجل" />
                                    )}
                                    {src === 'column' && (
                                      <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded">
                                        💡 ستُجمع الخيارات تلقائياً من القيم الفريدة الموجودة في عمود <strong>{L}</strong> داخل ورقة Google Sheets.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}

              {/* 📸 OCR — استخراج البيانات بالذكاء الاصطناعي */}
              <div className="mt-4 rounded-xl border-2 border-purple-200 bg-purple-50/40 p-4" dir="rtl">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={!!s.ocr_enabled}
                    onChange={(e) => patch({ ocr_enabled: e.target.checked })}
                  />
                  <strong className="text-sm">📸 تفعيل الاستخراج التلقائي من الصور (OCR بالذكاء الاصطناعي)</strong>
                </label>
                <p className="text-xs text-slate-600 mt-2 leading-6">
                  عند تفعيل هذا الخيار سيظهر زر <strong>📷 استخراج من صورة</strong> داخل نموذج «إضافة سجل»،
                  ويستطيع المستخدم رفع صورة (أو التقاطها بالكاميرا) لبطاقة/جدول/وثيقة، فيقوم النظام تلقائياً
                  بتعبئة حقول النموذج بالقيم المستخرجة (يمكن للمستخدم مراجعتها وتعديلها قبل الحفظ).
                  يعتمد على Lovable AI (نموذج Gemini) — لا يتطلب أي مفتاح خارجي.
                </p>
                {s.ocr_enabled && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-black mb-1">تعليمات مخصصة للنموذج (اختياري)</label>
                      <textarea
                        className="schedule-select w-full text-xs"
                        rows={3}
                        value={s.ocr_prompt || ''}
                        onChange={(e) => patch({ ocr_prompt: e.target.value })}
                        placeholder={'مثال: استخرج بيانات طالب من هوية جامعية. النص العربي كما هو، والأرقام لاتينية. إن كانت الصورة بطاقة تعريف فاستخرج فقط: الاسم الكامل، الرقم الجامعي، القسم، المرحلة.'}
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        اترك الحقل فارغاً لاستخدام تعليمة عربية افتراضية تناسب أغلب الوثائق.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-black mb-1">
                        حصر الاستخراج بأعمدة محددة (اختياري)
                      </label>
                      <input
                        className="schedule-select w-full text-xs"
                        dir="ltr"
                        value={(s.ocr_fields || []).join(', ')}
                        onChange={(e) => {
                          const letters = e.target.value
                            .toUpperCase()
                            .split(/[,\s]+/)
                            .map((x) => x.trim())
                            .filter((x) => /^[A-Z]{1,3}$/.test(x));
                          patch({ ocr_fields: letters });
                        }}
                        placeholder="F, G, H, I (اتركه فارغاً ليشمل كل أعمدة الإضافة)"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        أحرف أعمدة Excel مفصولة بفاصلة. إن ترك فارغاً سيحاول تعبئة جميع الحقول القابلة للتعديل.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 6 && (() => {
            const qfs = s.quick_filters || [];
            const updQF = (i: number, p: any) => patch({ quick_filters: qfs.map((q, idx) => idx === i ? { ...q, ...p } : q) });
            const delQF = (i: number) => patch({ quick_filters: qfs.filter((_, idx) => idx !== i) });
            const addQF = () => patch({ quick_filters: [...qfs, { label: '', column: 'A', op: 'is_not_empty', icon: '⚡', color: '#dc2626' }] });
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-sm">⚡ أزرار فلترة سريعة فوق الجدول</strong>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      تظهر فوق الجدول كأزرار قابلة للتفعيل/الإلغاء — مثل زر «غير مستوفي» في تدقيق النصاب و«تضارب/سليم» في متابعة سير التدريسات.
                    </p>
                  </div>
                  <button className="schedule-btn schedule-btn-primary" onClick={addQF} style={{ minHeight: 32, padding: '4px 10px' }}>➕ زر</button>
                </div>
                {qfs.length === 0 && <p className="text-xs text-slate-500 text-center py-4 bg-slate-50 rounded border border-dashed">لا توجد أزرار سريعة بعد.</p>}
                {qfs.map((q: any, i) => (
                  <div key={i} className="bg-slate-50 border rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 flex gap-1">
                        <input className="schedule-select w-12 text-center" value={q.icon || ''} onChange={(e) => updQF(i, { icon: e.target.value })} placeholder="رمز" maxLength={2} />
                        <select className="schedule-select flex-1" value="" onChange={(e) => { if (e.target.value) updQF(i, { icon: e.target.value }); }} title="اختر أيقونة جاهزة">
                          <option value="">🎨</option>
                          {['⚡','🔥','⭐','✅','❌','⚠️','🚫','🔔','📌','📍','🎯','💡','🟢','🟡','🔴','🔵','🟣','🟠','📊','📈','📉','🏆','🎓','📚','📝','🧮','🗓️','⏰','🔍','👤','👥','🏛️','🏫','💼','🧪','🔬','🧰','🛠️','♻️','🆕','🆗','🆙','🆘','💯','🎁','🎉','🌟','💎','🚀','📞','📧','📦','📁','🗂️','🧩','🔐','🔓','🔑','🧭','🗺️'].map(em => <option key={em} value={em}>{em}</option>)}
                        </select>
                      </div>
                      <input className="schedule-select col-span-3" value={q.label || ''} onChange={(e) => updQF(i, { label: e.target.value })} placeholder="نص الزر الظاهر (مثال: غير مستوفي / تضارب)" />
                      <input className="schedule-select col-span-2 text-center font-mono" value={q.column || ''} onChange={(e) => updQF(i, { column: e.target.value.toUpperCase() })} placeholder="عمود (مثال: E)" />
                      <select className="schedule-select col-span-3" value={q.op || 'eq'} onChange={(e) => updQF(i, { op: e.target.value, value: '', values: [] })}>
                        {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                      </select>
                      <input type="color" className="col-span-1 h-10 w-full rounded border cursor-pointer" value={q.color || '#dc2626'} onChange={(e) => updQF(i, { color: e.target.value })} />
                      <button onClick={() => delQF(i)} className="col-span-1 text-red-600 font-black text-lg">✕</button>
                    </div>
                    {q.op === 'contains_any' ? (
                      <input className="schedule-select w-full" value={(q.values || []).join(', ')}
                        onChange={(e) => updQF(i, { values: splitMulti(e.target.value) })}
                        placeholder="قيم مفصولة (,  ،  -  |  أو سطر جديد)" />
                    ) : NEEDS_VALUE[q.op as ConditionOp] ? (
                      <input className="schedule-select w-full" value={String(q.value ?? '')}
                        onChange={(e) => updQF(i, { value: e.target.value })} placeholder="القيمة المطلوب تصفية الصفوف بها (مثال: نعم / مستوفي)" />
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })()}

          {step === 7 && (() => {
            const pp = s.print_prefs || {};
            const setPP = (p: any) => patch({ print_prefs: { ...pp, ...p } });
            const Bool = ({ k, label, def = true }: { k: string; label: string; def?: boolean }) => {
              const v = (pp as any)[k];
              const checked = v === undefined ? def : !!v;
              return (
                <label className="flex items-center gap-2 text-xs font-bold bg-white border rounded px-2 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={(e) => setPP({ [k]: e.target.checked })} />
                  {label}
                </label>
              );
            };
            const hasPrefs = Object.keys(pp).length > 0;
            return (
              <div className="space-y-4">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                  <strong className="text-sm block mb-1">🖨️ إعدادات الطباعة الافتراضية لهذا النظام</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    اضبط القيم هنا لتصبح <strong>ثابتة عند كل معاينة</strong> لهذا النظام، ولن يظهر شريط الإعدادات للمستخدم تلقائياً.
                    يبقى بإمكانه إظهاره عبر زر «⚙️ إعدادات الطباعة» العائم أو من خلال تفعيل «إظهار شريط الإعدادات تلقائياً» أدناه.
                    إذا لم تضبط أي قيمة، ستُستخدم الإعدادات الافتراضية ويظهر الشريط كالسابق.
                  </p>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
                  <strong className="text-sm">إعدادات الصفحة</strong>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-black mb-1">الاتجاه</label>
                      <select className="schedule-select w-full text-xs" value={pp.orient || ''} onChange={(e) => setPP({ orient: e.target.value || undefined })}>
                        <option value="">— تلقائي —</option>
                        <option value="landscape">أفقي</option>
                        <option value="portrait">عمودي</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black mb-1">حجم الورق</label>
                      <select className="schedule-select w-full text-xs" value={pp.size || ''} onChange={(e) => setPP({ size: e.target.value || undefined })}>
                        <option value="">— تلقائي —</option>
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black mb-1">الهوامش</label>
                      <select className="schedule-select w-full text-xs" value={pp.margin || ''} onChange={(e) => setPP({ margin: e.target.value || undefined })}>
                        <option value="">— تلقائي —</option>
                        <option value="5">ضيقة (5مم)</option>
                        <option value="8">عادية (8مم)</option>
                        <option value="12">واسعة (12مم)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">البانر والتكرار</strong>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Bool k="repeatHeader" label="تكرار البانر بكل صفحة" />
                    <Bool k="compactRepeat" label="بانر مضغوط عند التكرار" />
                    <Bool k="repeatSigs" label="تكرار التواقيع في كل صفحة" def={false} />
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">محتويات البانر</strong>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Bool k="showLogo" label="الشعار" />
                    <Bool k="showTitle" label="العنوان" />
                    <Bool k="showInfo" label="شريط المعلومات" />
                    <Bool k="showDate" label="التاريخ" />
                    <Bool k="showDocnum" label="رقم الوثيقة" def={false} />
                    <Bool k="showCount" label="عدد السجلات" def={false} />
                    <Bool k="showFilters" label="معايير التصفية" def={false} />
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">التواقيع والجدول والعلامة المائية</strong>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <Bool k="showSigs" label="إظهار التواقيع" />
                    <Bool k="fit" label="ملاءمة الأعمدة (تخطيط ثابت)" def={false} />
                    <Bool k="showWatermark" label="إظهار العلامة المائية" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black mb-1 mt-2">نص العلامة المائية (اختياري)</label>
                    <input
                      className="schedule-select w-full text-xs"
                      value={pp.watermarkText || ''}
                      onChange={(e) => setPP({ watermarkText: e.target.value || undefined })}
                      placeholder="افتراضي: الجامعة التكنولوجية"
                    />
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">عنوان الطباعة (ثابت)</strong>
                  <input
                    className="schedule-select w-full text-xs"
                    value={pp.title || ''}
                    onChange={(e) => setPP({ title: e.target.value || undefined })}
                    placeholder="اتركه فارغاً لاستخدام عنوان النظام — عند تعبئته يصبح ثابتاً ولا يمكن للمستخدم تعديله"
                  />
                </div>

                <div className="border-2 border-amber-300 rounded-lg p-3 bg-amber-50/60 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!pp.show_toolbar}
                      onChange={(e) => setPP({ show_toolbar: e.target.checked })}
                    />
                    <span>
                      إظهار شريط الإعدادات في المعاينة تلقائياً
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        افتراضياً يكون الشريط مخفياً، ويستطيع المستخدم إظهاره من زر «⚙️ الإعدادات» العائم
                        <strong> ما لم تُفعّل «قفل الإعدادات» أدناه</strong>.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!pp.lock_settings}
                      onChange={(e) => setPP({ lock_settings: e.target.checked })}
                    />
                    <span>
                      🔒 قفل إعدادات المعاينة والطباعة نهائياً
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        عند التفعيل: يُلغى زر «⚙️ الإعدادات» العائم، وتُعطَّل كل عناصر التحكم في الشريط،
                        فلا يستطيع المستخدم إعادة إظهار أي عنصر أخفيته أو تغيير أي إعداد ضبطتَه هنا.
                      </span>
                    </span>
                  </label>
                  {pp.lock_settings && (
                    <label className="flex items-start gap-2 text-sm font-bold cursor-pointer mr-6 border-r-4 border-amber-400 pr-3">
                      <input
                        type="checkbox"
                        checked={!!pp.title_editable}
                        onChange={(e) => setPP({ title_editable: e.target.checked || undefined })}
                      />
                      <span>
                        ✏️ استثناء «العنوان» من القفل — السماح للمستخدم بتغييره
                        <span className="block text-[11px] font-normal text-slate-600 mt-1">
                          عند التفعيل يبقى حقل العنوان قابلاً للتعديل من قبل المستخدم في شريط المعاينة،
                          بينما تبقى بقية الإعدادات مقفلة. عند إيقافه: العنوان مقفل أيضاً.
                        </span>
                      </span>
                    </label>
                  )}
                </div>

                {hasPrefs && (
                  <button
                    className="schedule-btn"
                    onClick={() => patch({ print_prefs: undefined })}
                    style={{ color: '#b91c1c', fontSize: 12 }}
                  >🗑️ إعادة تعيين جميع إعدادات الطباعة لهذا النظام</button>
                )}
              </div>
            );
          })()}
        </div>


        <footer className="px-5 py-3 border-t flex items-center justify-between gap-2 bg-slate-50">
          {initial?.id ? (
            <button className="schedule-btn" disabled={busy} onClick={handleDelete} style={{ color: '#b91c1c' }}>🗑️ حذف النظام</button>
          ) : <span />}
          <div className="flex gap-2">
            {initial?.id && (
              <button
                className="schedule-btn"
                disabled={busy}
                onClick={() => {
                  setS({ ...s, id: '', title: `${s.title} (نسخة)` });
                  setStep(1);
                  toast.success('تم تجهيز نسخة جديدة — عدّل العنوان ثم احفظ كنظام مستقل.');
                }}
                title="إنشاء نسخة بنفس الإعدادات وحفظها كنظام جديد"
              >📄 إنشاء نسخة</button>
            )}
            <button className="schedule-btn" onClick={onClose}>إلغاء</button>
            <button className="schedule-btn schedule-btn-primary" disabled={busy} onClick={handleSave}>
              {busy ? '⏳ جاري الحفظ...' : '💾 حفظ النظام'}
            </button>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default SystemBuilderDialog;
