import { useState } from 'react';
import { toast } from 'sonner';
import type { CustomSystemDef, FilterConfigItem, SignatureItem } from '@/data/customSystemsRegistry';
import { EMPTY_SYSTEM, saveCustomSystem, deleteCustomSystem } from '@/data/customSystemsRegistry';
import { OP_LABELS, type Condition, type ConditionOp, parseColumnsRange, colIndexToLetter } from '@/lib/conditionEngine';

const ICONS = ['📋','📊','📚','🗂️','🛡️','🎯','🧭','⚙️','📈','🧪','🎓','📁','🏛️','🧰','🔖','⚠️','🚨','📐','🧑‍🏫','🧑‍🎓'];
const COLORS = ['#475569','#0891b2','#16a34a','#dc2626','#7c3aed','#d97706','#0ea5e9','#e11d48','#059669','#a16207','#1e40af','#be123c'];

const OPS: ConditionOp[] = ['eq','neq','contains','not_contains','contains_any','eq_number','gt','lt','gte','lte','is_empty','is_not_empty','regex'];
const NEEDS_VALUE: Record<ConditionOp, boolean> = {
  eq: true, neq: true, contains: true, not_contains: true, contains_any: false,
  eq_number: true, gt: true, lt: true, gte: true, lte: true,
  is_empty: false, is_not_empty: false, regex: true,
};

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

  const handleSave = async () => {
    if (!s.title.trim()) { toast.error('العنوان مطلوب'); setStep(1); return; }
    if (!s.sheet_gid.trim()) { toast.error('GID للورقة المصدر مطلوب'); setStep(2); return; }
    const password = window.prompt('أدخل كلمة مرور لوحة التحكم لتأكيد الحفظ:');
    if (password === null) return;
    setBusy(true);
    try {
      await saveCustomSystem(s, password);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
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
          <Step n={5} label="الحماية" />
        </div>

        <div className="px-5 py-4 overflow-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-black mb-1">عنوان النظام *</label>
                <input className="schedule-select w-full" value={s.title} onChange={(e) => patch({ title: e.target.value })} placeholder="مثال: التدريسيون غير المكلفين" />
              </div>
              <div>
                <label className="block text-sm font-black mb-1">الوصف</label>
                <textarea className="schedule-select w-full" rows={2} value={s.description} onChange={(e) => patch({ description: e.target.value })} placeholder="وصف موجز يظهر تحت البطاقة" />
              </div>
              <div>
                <label className="block text-sm font-black mb-1">نص توضيحي (يظهر في الصفحة)</label>
                <input className="schedule-select w-full" value={s.hint} onChange={(e) => patch({ hint: e.target.value })} />
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
              <div>
                <label className="block text-sm font-black mb-1">GID الورقة المصدر *</label>
                <input className="schedule-select w-full" value={s.sheet_gid} onChange={(e) => patch({ sheet_gid: e.target.value })} placeholder="مثال: 1081297434" />
                <p className="text-xs text-slate-500 mt-1">رقم GID للورقة من نفس الجدول المنشور.</p>
              </div>
              <div>
                <label className="block text-sm font-black mb-1">نطاق الأعمدة المعروضة *</label>
                <input className="schedule-select w-full" value={s.columns_range} onChange={(e) => patch({ columns_range: e.target.value })} placeholder="مثال: F:N أو F,G,I,K" />
                <p className="text-xs text-slate-500 mt-1">حروف الأعمدة كما في Excel. يقبل النطاق (F:N) أو القائمة (F,G,I).</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="block text-sm font-black mb-1">أعمدة قوائم الفلترة</label>
              <input className="schedule-select w-full" value={s.filter_columns} onChange={(e) => patch({ filter_columns: e.target.value })} placeholder="مثال: G,F,E" />
              <p className="text-xs text-slate-500">حروف الأعمدة مفصولة بفواصل. ترتيب الحروف هو ترتيب ظهور الفلاتر.</p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <strong className="text-sm">شروط تصفية الصفوف (AND بينها)</strong>
                <button className="schedule-btn schedule-btn-primary" onClick={addCondition} style={{ minHeight: 32, padding: '4px 10px' }}>➕ شرط</button>
              </div>
              {s.conditions.length === 0 && <p className="text-xs text-slate-500 text-center py-3">لا توجد شروط — سيتم عرض كل الصفوف</p>}
              <div className="space-y-2">
                {s.conditions.map((c, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border">
                    <input className="schedule-select col-span-2" value={c.column} onChange={(e) => updCondition(i, { column: e.target.value.toUpperCase() })} placeholder="E" />
                    <select className="schedule-select col-span-4" value={c.op} onChange={(e) => updCondition(i, { op: e.target.value as ConditionOp, value: '', values: [] })}>
                      {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                    </select>
                    {c.op === 'contains_any' ? (
                      <input className="schedule-select col-span-5"
                        value={(c.values || []).join(',')}
                        onChange={(e) => updCondition(i, { values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                        placeholder="قيم مفصولة بفواصل: استاذ,أستاذ" />
                    ) : NEEDS_VALUE[c.op] ? (
                      <input className="schedule-select col-span-5" value={String(c.value ?? '')} onChange={(e) => updCondition(i, { value: e.target.value })} placeholder="القيمة" />
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
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={s.protected} onChange={(e) => patch({ protected: e.target.checked })} />
                حماية بكلمة سر
              </label>
              {s.protected && (
                <input className="schedule-select w-full" value={s.password} onChange={(e) => patch({ password: e.target.value })} placeholder="كلمة المرور" />
              )}
              <label className="flex items-center gap-2 text-sm font-bold mt-3">
                <input type="checkbox" checked={s.enabled !== false} onChange={(e) => patch({ enabled: e.target.checked })} />
                تفعيل النظام (إظهاره في الواجهة الرئيسية)
              </label>
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t flex items-center justify-between gap-2 bg-slate-50">
          {initial?.id ? (
            <button className="schedule-btn" disabled={busy} onClick={handleDelete} style={{ color: '#b91c1c' }}>🗑️ حذف النظام</button>
          ) : <span />}
          <div className="flex gap-2">
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
