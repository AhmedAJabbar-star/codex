import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { toast } from 'sonner';
import type { CustomSystemDef, FilterConfigItem, FilterRule, SignatureItem } from '@/data/customSystemsRegistry';
import { EMPTY_SYSTEM, saveCustomSystem, deleteCustomSystem, listCustomSystems } from '@/data/customSystemsRegistry';
import { OP_LABELS, type Condition, type ConditionOp, type ComputedColumn, type ConflictCfg, type GroupStage, parseColumnsRange, colIndexToLetter } from '@/lib/conditionEngine';
import { UI_THEMES, applyUiTheme, getUiTheme, type UiTheme } from '@/lib/uiTheme';
import { uiConfirm, uiPrompt } from '@/lib/ui-dialog';
/** القيمة الوهمية التي يرسلها الخادم بدل الأسرار المحفوظة (كلمة المرور / مفتاح API). */
const KEEP_SENTINEL = '__KEEP_EXISTING__';

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
const OPS: ConditionOp[] = ['eq','neq','contains','not_contains','token_match','not_token_match','contains_any','in_list','not_in_list','between','eq_number','gt','lt','gte','lte','date_before','date_after','date_equals','date_older_than_days','date_newer_than_days','time_overlaps','is_empty','is_not_empty'];
const NEEDS_VALUE: Record<ConditionOp, boolean> = {
  eq: true, neq: true, contains: true, not_contains: true,
  contains_any: false, in_list: false, not_in_list: false, between: false,
  token_match: true, not_token_match: true,
  eq_number: true, gt: true, lt: true, gte: true, lte: true,
  date_before: true, date_after: true, date_equals: true, date_older_than_days: true, date_newer_than_days: true,
  time_overlaps: true,
  is_empty: false, is_not_empty: false, regex: true,
};
/** Operators whose value is a LIST (comma/newline separated) instead of a single value. */
const MULTI_OPS: ConditionOp[] = ['contains_any', 'in_list', 'not_in_list'];

/** عمليات المقارنة التاريخية التي تقبل الرموز الديناميكية (today / today+N / academic_year_start). */
const DATE_OPS: ConditionOp[] = ['date_before', 'date_after', 'date_equals'];

/** رموز تاريخ ديناميكية جاهزة تُدرج بنقرة واحدة في حقل قيمة الشرط. */
const DATE_TOKENS: { v: string; label: string; hint: string }[] = [
  { v: 'today', label: '📅 اليوم', hint: 'تاريخ اليوم الحالي — يُحسب لحظة عرض البيانات' },
  { v: 'today+1', label: 'غداً', hint: 'تاريخ الغد (today+1)' },
  { v: 'today-1', label: 'أمس', hint: 'تاريخ الأمس (today-1)' },
  { v: 'today+7', label: 'بعد أسبوع', hint: 'اليوم + 7 أيام (today+7)' },
  { v: 'today-7', label: 'قبل أسبوع', hint: 'اليوم - 7 أيام (today-7)' },
  { v: 'today-30', label: 'قبل 30 يوماً', hint: 'اليوم - 30 يوماً (today-30)' },
  { v: 'academic_year_start', label: '🎓 بداية العام الدراسي', hint: '1 أيلول من العام الدراسي الحالي' },
];

/** Split a free-text multi-value input on any of: comma, Arabic comma, semicolon, newline, or pipe.
 *  (الشرطة «-» مستثناة عمداً حتى لا تتكسّر التواريخ مثل 2026-01-01 داخل القوائم) */
const splitMulti = (s: string): string[] =>
  (s || '').split(/[,،;\n|]+/).map((v) => v.trim()).filter(Boolean);

/** تحويل نص أعمدة (أحرف Excel) إلى مصفوفة أحرف كبيرة. */
const parseLettersList = (raw: string): string[] => splitMulti(raw).map((v) => v.toUpperCase()).filter(Boolean);
/** الشكل النصي الموحّد لمصفوفة قيم. */
const joinList = (v: (string | number)[]): string => (v || []).join(', ');

/**
 * حقل إدخال «حرّ» مرتبط بقيمة مُهيكلة (مصفوفة/خريطة).
 * المشكلة التي يحلّها: الحقول المتحكَّمة التي تُعيد كتابة النص من القيمة المُحلَّلة
 * بعد كل حرف تلتهم الفاصلة والمسافة فور كتابتهما وتدمج الكلمات.
 * هنا يحتفظ الحقل بالنص الخام أثناء الكتابة ويرسل القيمة المُحلَّلة للأب فوراً،
 * ولا يعيد المزامنة من الأب إلا إذا تغيّرت القيمة من مصدر خارجي (حذف سطر، استرجاع مسودة…).
 */
const FreeTextInput = <T,>({ canon, parse, serialize, onParsed, ...rest }: {
  /** الشكل النصي الموحّد للقيمة الحالية القادمة من حالة الأب. */
  canon: string;
  parse: (raw: string) => T;
  serialize: (v: NoInfer<T>) => string;
  onParsed: (v: NoInfer<T>) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
  const [text, setText] = useState(canon);
  useEffect(() => {
    // أعد المزامنة فقط إذا كان النص الحالي لا يمثّل القيمة الجديدة (تغيير خارجي).
    setText((t) => (serialize(parse(t)) === canon ? t : canon));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canon]);
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => { setText(e.target.value); onParsed(parse(e.target.value)); }}
    />
  );
};

/** Shared value editor for a condition/quick-filter/rule row.
 *  Renders the right input shape depending on the operator (list / between / single / none).
 *  Note: 'between' stores its bounds in values[0]..values[1] (engine contract). */
const CondValueInput = ({ c, upd, span }: {
  c: { op: ConditionOp; value?: string | number; values?: (string | number)[] };
  upd: (p: Record<string, unknown>) => void;
  span: number;
}) => {
  const spanStyle = { gridColumn: `span ${span}` } as const;
  if (MULTI_OPS.includes(c.op)) {
    return (
      <FreeTextInput
        className="schedule-select w-full" style={spanStyle}
        canon={joinList(c.values || [])}
        parse={splitMulti}
        serialize={joinList}
        onParsed={(vals) => upd({ values: vals })}
        placeholder="قيم مفصولة بفاصلة (, أو ،) أو سطر جديد — مثال: أستاذ، مساعد دكتور"
      />
    );
  }
  if (c.op === 'between') {
    const lo = (c.values || [])[0];
    const hi = (c.values || [])[1];
    return (
      <div className="grid grid-cols-2 gap-1 w-full" style={spanStyle}>
        <input className="schedule-select" value={String(lo ?? '')} onChange={(e) => upd({ values: [e.target.value, hi ?? ''] })} placeholder="من" />
        <input className="schedule-select" value={String(hi ?? '')} onChange={(e) => upd({ values: [lo ?? '', e.target.value] })} placeholder="إلى" />
      </div>
    );
  }
  if (NEEDS_VALUE[c.op]) {
    const isDateOp = DATE_OPS.includes(c.op);
    const ph = c.op === 'date_before' ? 'تاريخ (2026-12-31 أو today)'
      : c.op === 'date_after' ? 'تاريخ (2026-01-01 أو today)'
      : c.op === 'date_equals' ? 'تاريخ يساوي (today أو 2026-08-24)'
      : c.op === 'date_older_than_days' ? 'عدد الأيام (أقدم من…)'
      : c.op === 'date_newer_than_days' ? 'عدد الأيام (خلال آخر…)'
      : c.op === 'time_overlaps' ? 'فترة (مثال: 08:30 AM - 10:00 AM)'
      : c.op === 'regex' ? 'تعبير نمطي (مثال: ^أ)'
      : 'القيمة المطلوب مطابقتها';
    if (isDateOp) {
      return (
        <div className="w-full space-y-1" style={spanStyle}>
          <input className="schedule-select w-full" value={String(c.value ?? '')} onChange={(e) => upd({ value: e.target.value })} placeholder={ph} />
          <div className="flex flex-wrap items-center gap-1">
            {DATE_TOKENS.map((tk) => (
              <button key={tk.v} type="button" title={`${tk.hint} — اضغط لإدراج «${tk.v}»`}
                className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 hover:bg-sky-200 border border-sky-300 transition"
                onClick={() => upd({ value: tk.v })}>{tk.label}</button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <input className="schedule-select w-full" style={spanStyle} value={String(c.value ?? '')} onChange={(e) => upd({ value: e.target.value })} placeholder={ph} />
    );
  }
  return <div className="text-xs text-slate-400 text-center w-full" style={spanStyle}>— لا قيمة —</div>;
};

interface Props {
  initial: CustomSystemDef | null; // null = create new
  onClose: () => void;
  onSaved: () => void;
}

const DRAFT_PREFIX = 'system-builder-draft:';

const SystemBuilderDialog = ({ initial, onClose, onSaved }: Props) => {
  const draftKey = DRAFT_PREFIX + (initial?.id || '__new__');
  const [s, setS] = useState<CustomSystemDef>(() => initial ?? { ...EMPTY_SYSTEM });
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftFound, setDraftFound] = useState<CustomSystemDef | null>(null);
  const [allSystems, setAllSystems] = useState<CustomSystemDef[]>([]);
  // نصوص حرّة للحقول المركّبة (تُحوَّل لخريطة/مصفوفة أثناء الكتابة دون إعادة تنسيق تمنع الإدخال)
  const [ocrTargetsText, setOcrTargetsText] = useState(() =>
    Object.entries(initial?.ocr_text_targets || {}).map(([k, v]) => `${k}=${v}`).join(', '));
  const [qrFieldsText, setQrFieldsText] = useState(() => (initial?.qr_fields || []).join(', '));

  useEffect(() => {
    listCustomSystems().then(setAllSystems).catch(() => { /* ignore */ });
  }, []);

  // === مسوّدة تلقائية: تحفظ كل تعديل محلياً حتى لا يضيع العمل أبداً ===
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setDraftFound(JSON.parse(raw) as CustomSystemDef);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(s)); } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [s, dirty, draftKey]);

  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  // تحذير عند إغلاق/تحديث تبويب المتصفح أثناء وجود تعديلات غير محفوظة
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  /** الإغلاق الآمن — لا يُغلق أبداً بالضغط خارج النافذة، ويطلب تأكيداً عند وجود تعديلات. */
  const requestClose = async () => {
    if (dirty) {
      const ok = await uiConfirm({
        title: 'إغلاق منشئ الأنظمة؟',
        message: 'لديك تعديلات غير محفوظة. عند الإغلاق سيتم الاحتفاظ بها كمسوّدة تُستعاد تلقائياً عند إعادة فتح المنشئ.',
        icon: '📝',
        confirmText: 'إغلاق وحفظ كمسوّدة',
        cancelText: 'متابعة التحرير',
      });
      if (!ok) return;
    }
    onClose();
  };

  // منع الإغلاق بمفتاح Escape بشكل غير مقصود
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void requestClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);


  // === Live theme preview ===
  // Snapshot the global theme when the dialog opens, so we can restore it on close.
  const originalThemeRef = useRef<UiTheme>(getUiTheme());
  const [previewOn, setPreviewOn] = useState(false);
  useEffect(() => {
    originalThemeRef.current = getUiTheme();
    return () => {
      applyUiTheme(originalThemeRef.current);
      document.body.removeAttribute('data-system-theme-preview');
    };
  }, []);
  const previewTheme = (t: UiTheme | '') => {
    if (!t) {
      applyUiTheme(originalThemeRef.current);
      document.body.removeAttribute('data-system-theme-preview');
      setPreviewOn(false);
      return;
    }
    applyUiTheme(t);
    document.body.setAttribute('data-system-theme-preview', t);
    setPreviewOn(true);
  };
  const stopPreview = () => {
    applyUiTheme(originalThemeRef.current);
    document.body.removeAttribute('data-system-theme-preview');
    setPreviewOn(false);
  };

  const patch = (p: Partial<CustomSystemDef>) => { setDirty(true); setS((prev) => ({ ...prev, ...p })); };

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
    const password = await uiPrompt({ title: 'تأكيد حفظ النظام', message: 'أدخل كلمة مرور لوحة التحكم لحفظ التعديلات.', icon: '🔐', password: true, placeholder: 'كلمة المرور', confirmText: 'حفظ' });
    if (password === null) return;
    setBusy(true);
    try {
      await saveCustomSystem(s, password, initial?.id || undefined);
      toast.success('تم حفظ النظام بنجاح');
      clearDraft();
      setDirty(false);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!initial?.id) return;
    if (!(await uiConfirm({ title: 'حذف النظام', message: `سيتم حذف النظام "${initial.title}" نهائياً من القائمة. لا يمكن التراجع عن هذا الإجراء.`, tone: 'danger', confirmText: 'حذف النظام' }))) return;
    const password = await uiPrompt({ title: 'تأكيد الحذف', message: 'أدخل كلمة مرور لوحة التحكم لتأكيد حذف النظام.', icon: '🔐', password: true, placeholder: 'كلمة المرور', tone: 'danger', confirmText: 'تأكيد الحذف' });
    if (password === null) return;
    setBusy(true);
    try {
      await deleteCustomSystem(initial.id, password);
      toast.success('تم حذف النظام');
      clearDraft();
      setDirty(false);
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const STEPS: [number, string][] = [
    [1, '🧩 الأساسيات'],
    [2, '🗂️ المصدر والأعمدة'],
    [3, '🔍 الفلاتر'],
    [4, '⚖️ الشروط'],
    [5, '🛡️ الحماية والصلاحيات'],
    [6, '⚡ أزرار سريعة'],
    [7, '🖨️ إعدادات الطباعة'],
    [8, '✨ ميزات متقدمة'],
    [9, '🔗 الربط والقيود'],
    [10, '🧮 معالجة متقدمة'],
  ];

  const Step = ({ n, label }: { n: number; label: string }) => (
    <button
      onClick={() => setStep(n)}
      className="w-full text-right px-3 py-2.5 rounded-xl text-xs font-black border-2 transition-all flex items-center gap-2"
      style={{
        background: step === n ? s.color : 'white',
        color: step === n ? 'white' : '#1e293b',
        borderColor: step === n ? s.color : '#e2e8f0',
        boxShadow: step === n ? `0 4px 14px ${s.color}55` : 'none',
      }}
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
        style={{ background: step === n ? 'rgba(255,255,255,.25)' : '#f1f5f9' }}
      >{n}</span>
      <span className="flex-1 leading-5">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <header className="px-5 py-4 border-b flex items-center justify-between gap-3" style={{ background: `${s.color}15` }}>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{s.icon || '📋'}</div>
            <div>
              <h2 className="text-lg font-black">{initial ? 'تعديل نظام' : 'نظام جديد'}</h2>
              <p className="text-xs text-slate-500">
                {s.title || 'بدون عنوان'}
                {dirty && <span className="mr-2 text-amber-600 font-bold">• تعديلات غير محفوظة (تُحفظ تلقائياً كمسوّدة)</span>}
              </p>
            </div>
          </div>
          <button onClick={requestClose} className="text-2xl text-slate-500 hover:text-slate-900" title="إغلاق">✕</button>
        </header>

        {draftFound && (
          <div className="px-5 py-3 border-b bg-amber-50 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-amber-800">
              📝 توجد مسوّدة غير محفوظة لهذا النظام «{draftFound.title || 'بدون عنوان'}». هل تريد استعادتها؟
            </span>
            <span className="flex gap-2">
              <button
                className="schedule-btn schedule-btn-primary"
                onClick={() => { setS(draftFound); setDirty(true); setDraftFound(null); toast.success('تمت استعادة المسوّدة'); }}
              >↩️ استعادة المسوّدة</button>
              <button
                className="schedule-btn"
                onClick={() => { clearDraft(); setDraftFound(null); }}
              >🗑️ تجاهل</button>
            </span>
          </div>
        )}


        <div className="flex-1 flex min-h-0">
          {/* شريط تبويبات جانبي */}
          <aside className="w-44 sm:w-56 shrink-0 border-l bg-slate-50/80 overflow-y-auto p-2 flex flex-col gap-1.5">
            {STEPS.map(([n, label]) => <Step key={n} n={n} label={label} />)}
          </aside>

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

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <label className="block text-sm font-black">🎨 تصميم واجهة هذا النظام</label>
                  <div className="flex items-center gap-2 text-xs">
                    {previewOn && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">👁️ معاينة مباشرة</span>
                    )}
                    <button
                      type="button"
                      onClick={stopPreview}
                      disabled={!previewOn}
                      className="px-2 py-1 rounded border font-bold disabled:opacity-40"
                    >
                      إيقاف المعاينة
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-2">
                  اختر مظهراً مستقلاً لهذا النظام. اضغط على أي بطاقة لمعاينته فوراً على الواجهة كاملة. يعود المظهر العام تلقائياً عند إغلاق النافذة.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-auto p-1">
                  <button
                    type="button"
                    onClick={() => { patch({ ui_theme: '' }); previewTheme(''); }}
                    className={`text-right rounded-lg border-2 p-2 transition-all ${!s.ui_theme ? 'border-slate-900 ring-2 ring-slate-300' : 'border-slate-200 hover:border-slate-400'}`}
                  >
                    <div className="h-8 rounded mb-1.5 bg-gradient-to-br from-slate-200 to-slate-100 flex items-center justify-center text-xs font-black text-slate-500">
                      اتّبع العام
                    </div>
                    <div className="text-xs font-black text-slate-900">🔗 المظهر العام</div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">يستخدم التصميم المختار في لوحة التحكم.</div>
                  </button>
                  {UI_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { patch({ ui_theme: t.id }); previewTheme(t.id); }}
                      className={`text-right rounded-lg border-2 p-2 transition-all ${s.ui_theme === t.id ? 'border-slate-900 ring-2 ring-slate-300' : 'border-slate-200 hover:border-slate-400'}`}
                      title={t.description}
                    >
                      <div className="h-8 rounded mb-1.5" style={{ background: t.swatch }} />
                      <div className="text-xs font-black text-slate-900 truncate">{t.label}</div>
                      <div className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{t.description}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 p-3 bg-slate-50/70">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <strong className="text-sm">👁️ معاينة فورية داخلية</strong>
                    <span className="text-[11px] font-bold text-slate-500">
                      {s.ui_theme ? 'التصميم المختار مطبّق الآن على النموذج أدناه وعلى الواجهة خلف النافذة' : 'يتبع المظهر العام حالياً'}
                    </span>
                  </div>
                  <div className="schedule-card" style={{ borderRadius: 18, overflow: 'hidden' }}>
                    <div className="schedule-header" style={{ padding: 16 }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="card3d__icon w-12 h-12 grid place-items-center text-2xl flex-shrink-0">{s.icon || '📋'}</div>
                          <div className="min-w-0">
                            <h3 className="m-0 text-base font-black text-[var(--schedule-text)] truncate">{s.title || 'عنوان النظام'}</h3>
                            <p className="m-0 text-xs font-bold text-[var(--schedule-muted)] truncate">{s.description || 'وصف مختصر للنظام وبياناته'}</p>
                          </div>
                        </div>
                        <span className="schedule-badge">جاهز</span>
                      </div>
                    </div>
                    <div className="schedule-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', padding: 14 }}>
                      <label>
                        <span className="schedule-filter-label">القسم</span>
                        <select className="schedule-select w-full" value="" onChange={() => {}}>
                          <option value="">اختر القسم</option>
                        </select>
                      </label>
                      <label>
                        <span className="schedule-filter-label">الفصل</span>
                        <input className="schedule-select w-full" value="الفصل الثاني" onChange={() => {}} />
                      </label>
                    </div>
                    <div className="schedule-toolbar" style={{ padding: 14 }}>
                      <button type="button" className="schedule-btn schedule-btn-primary">🖨️ طباعة</button>
                      <button type="button" className="schedule-btn schedule-btn-secondary">📥 تصدير</button>
                    </div>
                    <div className="schedule-table-wrap" style={{ margin: 14, maxHeight: 140 }}>
                      <table className="schedule-table" style={{ minWidth: 520 }}>
                        <thead><tr><th>التدريسي</th><th>القسم</th><th>الحالة</th></tr></thead>
                        <tbody>
                          <tr><td>نموذج بيانات</td><td>هندسة مدنية</td><td>مكتمل</td></tr>
                          <tr><td>سجل تجريبي</td><td>الدراسات الأولية</td><td>قيد المتابعة</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
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
              <div>
                <label className="block text-sm font-black mb-1">🙈 أعمدة مخفية مساعِدة (اختياري)</label>
                <input className="schedule-select w-full font-mono" dir="ltr" value={(s as any).hidden_columns || ''} onChange={(e) => patch({ hidden_columns: e.target.value } as any)} placeholder="مثال: E أو E, M" />
                <p className="text-xs text-slate-500 mt-1">أعمدة تُحمَّل لاستخدامها في الفلاتر والشروط والمعادلات لكنها <strong>لا تظهر</strong> في الجدول ولا في نموذج الإضافة — مفيدة للفلترة على عمود غير معروض.</p>
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
                            <CondValueInput c={r} span={4} upd={(p) => updRule(i, ri, p)} />
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
                    <CondValueInput c={c} span={5} upd={(p) => updCondition(i, p)} />
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
              <div className="border rounded-lg p-3 bg-slate-50 text-[11px] text-slate-600 leading-relaxed">
                ✍️ <strong>تواقيع الطباعة</strong> انتقلت إلى تبويب «7. إعدادات الطباعة» لتكون بجانب خيار «إظهار التواقيع».
              </div>


              <label className="flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={s.protected} onChange={(e) => patch({ protected: e.target.checked })} />
                حماية بكلمة سر
              </label>
              {s.protected && (
                <input className="schedule-select w-full" value={s.password === '__KEEP_EXISTING__' ? '' : s.password} onChange={(e) => patch({ password: e.target.value })} placeholder="•••••• محفوظة — اكتب كلمة جديدة لتغييرها" />
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
                      <div>
                        <label className="block text-xs font-black mb-1">عمود الكلية في الورقة (حرف Excel)</label>
                        <input
                          className="schedule-select w-full"
                          value={s.teacher_college_column || ''}
                          onChange={(e) => patch({ teacher_college_column: e.target.value.toUpperCase().trim() })}
                          placeholder="أدخل حرف العمود (مثال: C) — اتركه فارغاً إن لم يوجد"
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
                        <option value="custom">مخصّص (أختار المعايير أدناه)</option>
                        <option value="all">بدون تصفية (يرى كل الصفوف بعد الدخول)</option>
                      </select>
                    </div>
                    {s.teacher_filter_scope === 'custom' && (
                      <div className="border rounded-lg p-3 bg-white space-y-2">
                        <strong className="text-xs block">معايير الهوية المستخدمة في التصفية</strong>
                        <div className="flex flex-wrap gap-3">
                          {([
                            ['name', 'الاسم'],
                            ['department', 'القسم'],
                            ['college', 'الكلية'],
                          ] as const).map(([key, label]) => {
                            const cur = (s.teacher_scope_criteria || []) as string[];
                            const on = cur.includes(key);
                            return (
                              <label key={key} className="flex items-center gap-1 text-xs font-bold">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={(e) => patch({
                                    teacher_scope_criteria: (e.target.checked
                                      ? [...cur, key]
                                      : cur.filter((c) => c !== key)) as any,
                                  })}
                                />
                                {label}
                              </label>
                            );
                          })}
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">منطق الدمج</label>
                          <select
                            className="schedule-select w-full"
                            value={s.teacher_scope_logic || 'any'}
                            onChange={(e) => patch({ teacher_scope_logic: e.target.value as any })}
                          >
                            <option value="any">أي معيار يتحقق (أوسع)</option>
                            <option value="all">كل المعايير يجب أن تتحقق (أضيق)</option>
                          </select>
                        </div>
                      </div>
                    )}
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

                    {/* 📤 Bulk import from Excel/CSV */}
                    {cur.add && (
                      <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-5 h-5"
                            checked={!!s.bulk_import_enabled}
                            onChange={(e) => patch({ bulk_import_enabled: e.target.checked })}
                          />
                          <strong className="text-sm">📤 تفعيل الإضافة الجماعية برفع ملف Excel / CSV</strong>
                        </label>
                        <p className="text-[11px] text-slate-600 leading-5">
                          يظهر زر <strong>«📤 استيراد من Excel»</strong> بجانب زر الإضافة. يرفع المستخدم ملف
                          (<code>.xlsx</code> / <code>.xls</code> / <code>.csv</code>)، ثم يطابق أعمدة الملف مع أعمدة النظام،
                          فتُضاف كل الصفوف دفعة واحدة إلى ورقة Google Sheets فوراً.
                        </p>
                      </div>
                    )}

                    {/* 🚫 Duplicate prevention */}
                    {(cur.add) && (
                      <div className="rounded-xl border-2 border-rose-200 bg-rose-50/50 p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-5 h-5"
                            checked={!!s.dedupe_enabled}
                            onChange={(e) => patch({ dedupe_enabled: e.target.checked })}
                          />
                          <strong className="text-sm">🚫 منع تكرار السجلات (مفتاح فريد)</strong>
                        </label>
                        <p className="text-[11px] text-slate-600 leading-5">
                          يُبنى «مفتاح فريد» بدمج (Join) عمود واحد أو أكثر. أي سجل جديد (فردي أو ضمن ملف Excel)
                          يحمل نفس المفتاح لسجل موجود سيُرفض/يُتجاوز تلقائياً.
                        </p>
                        {s.dedupe_enabled && (
                          <div className="space-y-3 pt-1 border-t border-dashed border-rose-200">
                            <div>
                              <label className="block text-[11px] font-black mb-1">أعمدة المفتاح الفريد (اختر عموداً أو أكثر)</label>
                              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto bg-white p-2 rounded-lg border">
                                {colLetters.map((L) => {
                                  const list = s.dedupe_columns || [];
                                  const on = list.includes(L);
                                  return (
                                    <button
                                      key={L}
                                      type="button"
                                      onClick={() => patch({ dedupe_columns: on ? list.filter((x) => x !== L) : [...list, L] })}
                                      className={`px-2 py-1 rounded-lg border-2 text-[11px] font-bold ${on ? 'border-rose-500 bg-rose-100 text-rose-800' : 'border-slate-200 bg-white text-slate-600'}`}
                                      title={labels[L] || `عمود ${L}`}
                                    >
                                      {L} — {(labels[L] || `عمود ${L}`).slice(0, 18)}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1">
                                المفتاح الحالي: <strong>{(s.dedupe_columns || []).join(` ${s.dedupe_separator || '|'} `) || '— لم تُحدَّد أعمدة —'}</strong>
                              </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-black mb-1">فاصل الدمج</label>
                                <input
                                  className="schedule-select w-full text-xs"
                                  value={s.dedupe_separator ?? '|'}
                                  onChange={(e) => patch({ dedupe_separator: e.target.value })}
                                  placeholder="مثال: |  أو  -  أو  _"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-black mb-1">عمود حفظ المفتاح (اختياري)</label>
                                <select
                                  className="schedule-select w-full text-xs"
                                  value={s.dedupe_key_column || ''}
                                  onChange={(e) => patch({ dedupe_key_column: e.target.value })}
                                >
                                  <option value="">— لا يُحفَظ (المقارنة فقط) —</option>
                                  {colLetters.map((L) => (
                                    <option key={L} value={L}>{L} — {labels[L] || `عمود ${L}`}</option>
                                  ))}
                                </select>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  عند اختيار عمود، تُكتب فيه قيمة المفتاح المدموج تلقائياً عند كل إضافة (يصلح كـ ID).
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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
                            const autoNow = ct === 'datetime' || !!(s.column_auto_now || {})[L];
                            const shCfg = (s.column_select_sheet || {})[L] || {};
                            const parCfg = (s.column_select_parent || {})[L] || {};
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
                                    <option value="datetime">⏱️ وقت وتاريخ تلقائي</option>
                                    <option value="select">📋 قائمة منسدلة</option>
                                    <option value="file">📎 ملف (رفع إلى Google Drive)</option>
                                    <option value="readonly">🔒 قراءة فقط</option>
                                  </select>
                                </div>
                                {(ct === 'text' || ct === 'date' || ct === 'datetime' || ct === 'readonly') && (
                                  <label className="flex items-start gap-2 pt-1 border-t border-dashed text-[11px] font-bold cursor-pointer">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5"
                                      checked={autoNow}
                                      onChange={(e) => patch({ column_auto_now: { ...(s.column_auto_now || {}), [L]: e.target.checked } })}
                                    />
                                    <span>
                                      ⏱️ تعبئة تلقائية بوقت وتاريخ لحظة الإدخال
                                      <span className="block text-[10px] text-slate-500 font-normal">
                                        بالصيغة <code className="bg-slate-100 px-1 rounded" dir="ltr">2:20:20 ص 2021/08/24</code> — يصبح الحقل غير قابل للكتابة أو التعديل، ويُسجَّل تلقائياً عند الحفظ.
                                      </span>
                                    </span>
                                  </label>
                                )}
                                {ct === 'file' && (
                                  <div className="pt-1 border-t border-dashed">
                                    <label className="block text-[11px] font-black text-slate-700 mb-1">
                                      📁 رابط/معرّف فولدر Google Drive لهذا العمود (اختياري)
                                    </label>
                                    <input
                                      className="schedule-select w-full text-xs"
                                      value={(s.column_drive_folders || {})[L] || ''}
                                      onChange={(e) => patch({ column_drive_folders: { ...(s.column_drive_folders || {}), [L]: e.target.value } })}
                                      placeholder="https://drive.google.com/drive/folders/XXXXXXXXXX أو معرّف الفولدر مباشرةً"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">
                                      اترك الحقل فارغاً لاستخدام «الفولدر الافتراضي للنظام» أدناه. عند إدخال رابط فولدر كامل يُستخرج المعرّف تلقائياً.
                                    </p>
                                  </div>
                                )}
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
                                      <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name={`src-${L}`} checked={src === 'sheet'}
                                          onChange={() => patch({ column_select_source: { ...(s.column_select_source || {}), [L]: 'sheet' } })} />
                                        من ورقة Google Sheets أخرى
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
                                    {src === 'sheet' && (
                                      <div className="space-y-1.5 bg-sky-50 border border-sky-200 rounded p-2">
                                        <p className="text-[11px] text-slate-600">
                                          📄 حدّد ورقة العمل (GID) وحرف العمود الذي يحتوي قائمة الخيارات. اترك الرابط فارغاً لاستخدام نفس ملف النظام.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                                          <input className="schedule-select text-xs" value={shCfg.gid || ''}
                                            onChange={(e) => patch({ column_select_sheet: { ...(s.column_select_sheet || {}), [L]: { ...shCfg, gid: e.target.value.trim() } } })}
                                            placeholder="GID ورقة العمل — مثال: 1234567890" />
                                          <input className="schedule-select text-xs" value={shCfg.column || ''}
                                            onChange={(e) => patch({ column_select_sheet: { ...(s.column_select_sheet || {}), [L]: { ...shCfg, column: e.target.value.toUpperCase().trim() } } })}
                                            placeholder="حرف عمود الخيارات — مثال: B" />
                                          <input className="schedule-select text-xs" value={shCfg.url || ''}
                                            onChange={(e) => patch({ column_select_sheet: { ...(s.column_select_sheet || {}), [L]: { ...shCfg, url: e.target.value.trim() } } })}
                                            placeholder="رابط ملف Google Sheets (اختياري)" />
                                        </div>
                                      </div>
                                    )}
                                    {src !== 'manual' && (
                                      <div className="space-y-1.5 bg-violet-50 border border-violet-200 rounded p-2">
                                        <p className="text-[11px] font-black text-violet-800">🔗 قائمة منسدلة تابعة لقائمة أخرى (اختياري)</p>
                                        <p className="text-[11px] text-slate-600">
                                          عند اختيار عمود «الأب» في النموذج، تُعرض في هذا العمود فقط الخيارات المقابلة له في ورقة المصدر
                                          (مثال: اختيار «القسم» يحدّد قائمة «المادة»).
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                          <select className="schedule-select text-xs" value={parCfg.parent || ''}
                                            onChange={(e) => patch({ column_select_parent: { ...(s.column_select_parent || {}), [L]: { ...parCfg, parent: e.target.value } } })}>
                                            <option value="">— بلا اعتماد (قائمة مستقلة) —</option>
                                            {colLetters.filter((x) => x !== L).map((x) => (
                                              <option key={x} value={x}>عمود {x} — {labels[x] || ''}</option>
                                            ))}
                                          </select>
                                          <input className="schedule-select text-xs" value={parCfg.parent_column || ''}
                                            onChange={(e) => patch({ column_select_parent: { ...(s.column_select_parent || {}), [L]: { ...parCfg, parent_column: e.target.value.toUpperCase().trim() } } })}
                                            placeholder="حرف عمود الأب في ورقة المصدر (فارغ = نفس الحرف)" />
                                        </div>
                                      </div>
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

              {/* 📁 Google Drive — الفولدر الافتراضي لرفع الملفات */}
              <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4" dir="rtl">
                <strong className="text-sm">📁 Google Drive — الفولدر الافتراضي لرفع الملفات</strong>
                <p className="text-xs text-slate-600 mt-2 leading-6">
                  عند اختيار نوع الحقل <strong>«📎 ملف»</strong> لأي عمود، سيتم رفع الملف تلقائياً إلى Google Drive
                  ويُخزَّن رابط <strong>«افتح الملف»</strong> في الخلية. يمكنك تحديد فولدر افتراضي لكل النظام هنا،
                  وتخصيص فولدر مختلف لكل عمود من قسم «أنواع حقول الإدخال» أعلاه.
                </p>
                <label className="block text-xs font-black mt-3 mb-1">رابط أو معرّف الفولدر الافتراضي</label>
                <input
                  className="schedule-select w-full text-xs"
                  value={s.drive_folder_id || ''}
                  onChange={(e) => patch({ drive_folder_id: e.target.value })}
                  placeholder="https://drive.google.com/drive/folders/XXXXXXXXXX  أو  1AbCdEfGhIjKlMnOp"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 يمكن لصق رابط الفولدر كاملاً من Drive — سيُستخرج المعرّف تلقائياً. اترك الحقل فارغاً لرفع الملفات
                  إلى «My Drive» الجذر.
                </p>
              </div>

              {/* 🤖 اختيار مزوّد وموديل الذكاء الاصطناعي للاستخراج */}
              {(s.ocr_text_enabled || s.ocr_enabled) && (
                <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50/40 p-4" dir="rtl">
                  <strong className="text-sm">🤖 مزوّد وموديل الذكاء الاصطناعي المستخدم في الاستخراج</strong>
                  <p className="text-xs text-slate-600 mt-2 leading-6">
                    يُطبَّق هذا الاختيار على <strong>استخراج نص الملفات المرفوعة</strong> و<strong>الاستخراج من الصور</strong> معاً.
                  </p>

                  <label className="block text-xs font-black mt-3 mb-1">مزوّد الذكاء الاصطناعي</label>
                  <select
                    className="schedule-select w-full text-xs"
                    value={s.ocr_provider === 'google' ? 'google' : 'lovable'}
                    onChange={(e) => {
                      const p = e.target.value === 'google' ? ('google' as const) : ('' as const);
                      // عند تبديل المزوّد نصفّر الموديل إن كان يتبع المزوّد الآخر لتفادي رفض الطلبات.
                      const cur = String(s.ocr_model || '');
                      const curIsGoogleDirect = cur !== '' && !cur.startsWith('google/');
                      const nextModel = p === 'google' ? (curIsGoogleDirect ? cur : '') : (curIsGoogleDirect ? '' : cur);
                      patch({ ocr_provider: p, ocr_model: nextModel });
                    }}
                  >
                    <option value="lovable">☁️ بوابة Lovable AI — الافتراضي · تُخصم الكلفة من كريدت المشروع</option>
                    <option value="google">🔑 Google AI Studio (مفتاح Google الخاص بالمشروع) — بلا أي خصم من كريدت Lovable</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1 leading-5">
                    {s.ocr_provider === 'google'
                      ? '💡 الاستهلاك يُحتسب على حساب Google AI Studio المرتبط بالمفتاح المحفوظ في أسرار المشروع — موديلات flash لها حصة مجانية يومية، ولن يُخصم أي كريدت من هذا المشروع.'
                      : '💡 الكلفة تُحتسب من رصيد الذكاء الاصطناعي في مساحة عمل المشروع — موديلات flash أسرع وكلفتها أقل بكثير، بينما موديلات pro أدق مع المستندات المعقدة وخط اليد والأختام.'}
                  </p>

                  <label className="block text-xs font-black mt-3 mb-1">الموديل</label>
                  <select
                    className="schedule-select w-full text-xs"
                    value={s.ocr_model || ''}
                    onChange={(e) => patch({ ocr_model: e.target.value })}
                  >
                    {s.ocr_provider === 'google' ? (
                      <>
                        <option value="">⚖️ تلقائي (الافتراضي) — gemini-3.6-flash · ضمن الحصة المجانية اليومية</option>
                        <option value="gemini-3.6-flash">🆓 gemini-3.6-flash — حصة مجانية يومية · مناسب للمستندات الواضحة</option>
                        <option value="gemini-3.5-flash">⚡ gemini-3.5-flash — سريع ومستقر</option>
                        <option value="gemini-3.5-flash-lite">🪶 gemini-3.5-flash-lite — الأسرع · أوسع حصة مجانية</option>
                        <option value="gemini-3.7-flash">🚀 gemini-3.7-flash — أحدث جيل flash</option>
                        <option value="gemini-3.1-pro-preview">💎 gemini-3.1-pro — أعلى دقة · قد يتطلب تفعيل الفوترة في حساب Google</option>
                      </>
                    ) : (
                      <>
                        <option value="">⚖️ تلقائي (الافتراضي) — gemini-3.1-pro · الأدق للمستندات الرسمية وخط اليد</option>
                        <option value="google/gemini-2.5-flash">🆓 gemini-2.5-flash — الأقل كلفة (شبه مجاني) · مناسب للمستندات المطبوعة الواضحة</option>
                        <option value="google/gemini-3.7-flash">⚡ gemini-3.7-flash — سريع وكلفة منخفضة · توازن بين الدقة والسرعة</option>
                        <option value="google/gemini-3.1-pro-preview">💎 gemini-3.1-pro — أعلى دقة · كلفة أعلى</option>
                      </>
                    )}
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    💡 إن ظهرت أخطاء استخراج أو نصوص ناقصة مع موديل flash، بدّل إلى pro من هنا دون أي تعديل برمجي.
                  </p>

                  {s.ocr_provider === 'google' && (
                    <div className="mt-3 border-2 border-emerald-200 bg-emerald-50 rounded-lg p-3">
                      <label className="block text-xs font-black mb-1">🔑 مفتاح Google AI Studio الخاص بك (اختياري)</label>
                      <input
                        className="schedule-select w-full text-xs"
                        dir="ltr"
                        value={s.ai_api_key === KEEP_SENTINEL ? '' : (s.ai_api_key || '')}
                        placeholder={s.ai_api_key === KEEP_SENTINEL ? '•••••••• مفتاح محفوظ — اكتب مفتاحاً جديداً للتغيير' : 'AIza...'}
                        onChange={(e) => patch({ ai_api_key: e.target.value.trim() })}
                      />
                      <p className="text-[11px] text-slate-600 mt-1 leading-5">
                        يُستخدم هذا المفتاح لهذا النظام فقط، ويتقدّم على المفتاح العام المحفوظ في أسرار المشروع.
                        إن تركته فارغاً سيُستخدم المفتاح العام. يُخزَّن على الخادم ولا يُعاد إظهاره بعد الحفظ.
                      </p>
                      {s.ai_api_key === KEEP_SENTINEL && (
                        <button
                          type="button"
                          className="mt-2 text-[11px] font-black text-red-600 underline"
                          onClick={() => patch({ ai_api_key: '' })}
                        >🗑️ حذف المفتاح المحفوظ لهذا النظام</button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 📝 استخراج نص الملفات المرفوعة */}
              <div className="mt-4 rounded-xl border-2 border-teal-200 bg-teal-50/40 p-4" dir="rtl">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-5 h-5"
                    checked={!!s.ocr_text_enabled}
                    onChange={(e) => patch({ ocr_text_enabled: e.target.checked })}
                  />
                  <strong className="text-sm">📝 استخراج نص الملفات المرفوعة وحفظه في عمود مجاور</strong>
                </label>
                <p className="text-xs text-slate-600 mt-2 leading-6">
                  بعد رفع أي ملف في حقل من نوع <strong>«📎 ملف»</strong> (صورة، PDF، مستند…) يظهر للمستخدم خياران/ثلاثة لاستخراج
                  النص بالذكاء الاصطناعي: <strong>📄 شامل</strong> (نسخ حرفي كامل)، <strong>🧾 مُلخَّص</strong> (منظم بالعناوين)،
                  <strong>🎯 ذكي</strong> (يستخرج فقط ما يطابق «تعليمات استخراج النص» أدناه). يُحفَظ الناتج في
                  <strong> أول عمود فارغ مجاور</strong> لعمود الرفع (أو العمود الذي تحدده أدناه)، ويمكن مراجعته وتعديله قبل الحفظ.
                  يدعم النموذج قراءة <strong>خط اليد العربي في الهوامش ونصوص الأختام</strong> ويوسمها بوضوح داخل النص.
                </p>
                {s.ocr_text_enabled && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-black mb-1">تحديد عمود حفظ النص لكل عمود ملفات (اختياري)</label>
                      <input
                        className="schedule-select w-full text-xs"
                        dir="ltr"
                        value={ocrTargetsText}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setOcrTargetsText(raw);
                          const map: Record<string, string> = {};
                          raw.toUpperCase().split(/[,\s]+/).forEach((pair) => {
                            const m = pair.trim().match(/^([A-Z]{1,3})=([A-Z]{1,3})$/);
                            if (m) map[m[1]] = m[2];
                          });
                          patch({ ocr_text_targets: map });
                        }}
                        placeholder="H=I, K=L   (عمود الملف = عمود حفظ النص)"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        اكتب الأزواج بصيغة <bdi dir="ltr">عمود الملف = عمود النص</bdi> مفصولة بفاصلة.
                        اتركه فارغاً ليُستخدم أول عمود فارغ بعد عمود الرفع تلقائياً.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-black mb-1">تعليمات استخراج النص = معايير الوضع «الذكي» (اختياري)</label>
                      <textarea
                        className="schedule-select w-full text-xs"
                        rows={3}
                        value={s.ocr_text_prompt || ''}
                        onChange={(e) => patch({ ocr_text_prompt: e.target.value })}
                        placeholder="مثال: رقم الكتاب وتاريخه، الجهة المُصدِرة، الموضوع، الفقرات المطلوبة، ملاحظات الهوامش بخط اليد."
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        هذه التعليمات هي <strong>معايير وضع «🎯 ذكي»</strong> الذي يختاره المستخدم عند رفع الملف،
                        وتُمرَّر كتوجيهات تنسيق إضافية للوضعين «شامل» و«مُلخَّص». إن تُركت فارغة فلن يعمل الوضع الذكي.
                      </p>
                    </div>
                  </div>
                )}
              </div>

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
                      <FreeTextInput
                        className="schedule-select w-full text-xs"
                        dir="ltr"
                        canon={joinList(s.ocr_fields || [])}
                        parse={(raw) => raw.toUpperCase().split(/[,\s]+/).map((x) => x.trim()).filter((x) => /^[A-Z]{1,3}$/.test(x))}
                        serialize={joinList}
                        onParsed={(letters) => patch({ ocr_fields: letters })}
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
                    <CondValueInput c={q as Condition & { color?: string }} span={12} upd={(p) => updQF(i, p)} />
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

                {(() => {
                  const tb = (s.toolbar_buttons || {}) as Record<string, { show?: boolean; label?: string; color?: string }>;
                  const setTB = (k: string, p: any) => patch({ toolbar_buttons: { ...tb, [k]: { ...(tb[k] || {}), ...p } } } as any);
                  const KEYS: [string, string][] = [
                    ['print', '🖨️ طباعة الجدول (التقرير الرسمي)'],
                    ['pdfFull', '📄 حفظ PDF كامل على الحاسبة'],
                    ['pdfQuick', '📄 تصدير PDF سريع'],
                    ['excel', '📥 تصدير Excel'],
                    ['add', '➕ إضافة سجل'],
                    ['import', '📤 استيراد من Excel'],
                    ['qr', '📷 إضافة عبر QR'],
                  ];
                  return (
                    <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                      <strong className="text-sm">🎛️ أزرار شريط الأدوات (إظهار / الاسم / اللون)</strong>
                      <p className="text-[11px] text-slate-600">
                        أزل التأشير لإخفاء الزر من هذا النظام، أو اكتب اسماً بديلاً (يمكن أن يشمل رمزاً تعبيرياً) واختر لوناً مخصصاً.
                        الحقول الفارغة تعني «الاسم واللون الافتراضي».
                      </p>
                      <div className="space-y-2">
                        {KEYS.map(([k, lbl]) => (
                          <div key={k} className="grid grid-cols-1 md:grid-cols-[190px_1fr_120px] gap-2 items-center bg-white border rounded p-2">
                            <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                              <input type="checkbox" checked={tb[k]?.show !== false} onChange={(e) => setTB(k, { show: e.target.checked })} />
                              {lbl}
                            </label>
                            <input
                              className="schedule-select w-full text-xs"
                              placeholder="اسم بديل للزر (فارغ = الاسم الافتراضي)"
                              value={tb[k]?.label || ''}
                              onChange={(e) => setTB(k, { label: e.target.value })}
                            />
                            <div className="flex items-center gap-1">
                              <input type="color" className="w-9 h-8 rounded border" value={tb[k]?.color || '#1d4ed8'} onChange={(e) => setTB(k, { color: e.target.value })} />
                              {tb[k]?.color && (
                                <button type="button" className="text-[11px] font-black text-slate-500 underline" onClick={() => setTB(k, { color: '' })}>افتراضي</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

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
                  <div className="flex items-center justify-between">
                    <strong className="text-sm">✍️ أسماء التواقيع في نهاية التقرير</strong>
                    <button className="schedule-btn schedule-btn-primary" onClick={addSig} style={{ minHeight: 32, padding: '4px 10px' }}>➕ توقيع</button>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    تظهر هذه التواقيع أسفل الجدول في «طباعة الجدول» — بشرط تفعيل «إظهار التواقيع» أعلاه.
                    إذا تركت القائمة فارغة تُستخدم التواقيع الافتراضية (مقرر القسم / رئيس القسم / مصادقة العميد).
                  </p>
                  {sigs.length === 0 && <p className="text-xs text-slate-500 text-center py-2">سيتم استخدام التواقيع الافتراضية للنظام.</p>}
                  {sigs.map((sig, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <input className="schedule-select col-span-4 text-xs" value={sig.label} onChange={(e) => updSig(i, { label: e.target.value })} placeholder="المنصب (مثال: عميد الكلية / رئيس القسم)" />
                      <input className="schedule-select col-span-7 text-xs" value={sig.name || ''} onChange={(e) => updSig(i, { name: e.target.value })} placeholder="اسم الشخص المكتوب في التوقيع الرسمي" />
                      <button onClick={() => delSig(i)} className="col-span-1 text-red-600 font-black">✕</button>
                    </div>
                  ))}
                </div>

                <div className="border rounded-lg p-3 bg-emerald-50/60 border-emerald-200">
                  <strong className="text-sm block mb-1">📊 ذيل المجاميع في الطباعة</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    المجاميع المُعرَّفة في الخطوة 8 «ذيل المجاميع» تُطبع تلقائياً كصف أخير مميّز في نهاية الجدول ضمن التقرير الرسمي.
                  </p>
                </div>



                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">🔠 حجم الخط وارتفاع الخلية في التقرير الرسمي</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    القيم الافتراضية تُحسب تلقائياً حسب عدد الأعمدة والسجلات. غيّرها هنا لتثبيت مظهر موحّد لهذا النظام.
                    «ارتفاع الخلية» مفيد جداً للأعمدة التي يُكتب فيها يدوياً بعد الطباعة (مثل عمود التوقيع).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-black mb-1">حجم خط البيانات</label>
                      <select className="schedule-select w-full text-xs" value={String(pp.font_scale ?? '')}
                        onChange={(e) => setPP({ font_scale: e.target.value ? Number(e.target.value) : undefined })}>
                        <option value="">— تلقائي —</option>
                        <option value="80">80٪ (مصغّر)</option>
                        <option value="90">90٪</option>
                        <option value="100">100٪</option>
                        <option value="110">110٪</option>
                        <option value="125">125٪</option>
                        <option value="140">140٪</option>
                        <option value="160">160٪ (كبير جداً)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black mb-1">ارتفاع الخلية (السطر)</label>
                      <select className="schedule-select w-full text-xs" value={String(pp.row_scale ?? '')}
                        onChange={(e) => setPP({ row_scale: e.target.value ? Number(e.target.value) : undefined })}>
                        <option value="">— تلقائي —</option>
                        <option value="60">مضغوط جداً</option>
                        <option value="80">مضغوط</option>
                        <option value="100">عادي</option>
                        <option value="140">مريح</option>
                        <option value="190">واسع (مساحة كتابة)</option>
                        <option value="260">واسع جداً</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs font-bold cursor-pointer bg-white p-2 rounded border">
                    <input type="checkbox" checked={!!pp.one_page} onChange={(e) => setPP({ one_page: e.target.checked })} />
                    <span>
                      📄 محاولة الطباعة على ورقة واحدة
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        يُصغَّر الخط وارتفاع الأسطر تدريجياً حتى يدخل التقرير كله في صفحة واحدة — يمنع ظهور ورقة إضافية فيها سطر أو سطران فقط.
                      </span>
                    </span>
                  </label>
                  <div>
                    <label className="block text-[11px] font-black mb-1">ارتفاع حيز التوقيع والختم</label>
                    <select className="schedule-select w-full text-xs" value={String(pp.signature_space_mm ?? 4)}
                      onChange={(e) => setPP({ signature_space_mm: Number(e.target.value) })}>
                      <option value="0">بلا حيز فارغ — الاسم والمنصب مباشرة</option>
                      <option value="2">2 مم — مضغوط جداً</option>
                      <option value="4">4 مم — مضغوط (موصى به)</option>
                      <option value="7">7 مم — متوسط</option>
                      <option value="10">10 مم — واسع</option>
                      <option value="15">15 مم — واسع جداً</option>
                    </select>
                    <p className="text-[11px] text-slate-500 mt-1">يتحكم فقط بالفراغ بين عبارة «التوقيع والختم» والاسم؛ بقية عناصر التوقيع تبقى متقاربة.</p>
                  </div>
                </div>

                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <strong className="text-sm">📐 عرض الأعمدة في التقرير الرسمي</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    يمنع هذا الإعداد هدر المساحة: «الضبط التلقائي الذكي» يخمّد أطوال النصوص فلا يبتلع عمود
                    مثل «اسم التدريسي» نصف الصفحة، ويمنح الأعمدة الفارغة (مثل «التوقيع») حداً أدنى معقولاً للكتابة اليدوية.
                  </p>
                  <div>
                    <label className="block text-[11px] font-black mb-1">طريقة التوزيع</label>
                    <select
                      className="schedule-select w-full text-xs"
                      value={pp.col_width_mode || ''}
                      onChange={(e) => setPP({ col_width_mode: e.target.value || undefined })}
                    >
                      <option value="">— تلقائي ذكي (موصى به) —</option>
                      <option value="smart">ضبط تلقائي ذكي</option>
                      <option value="content">حسب طول المحتوى</option>
                      <option value="equal">أعمدة متساوية</option>
                      <option value="manual">نسب يدوية (من الجدول أدناه)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black mb-1">نِسَب يدوية — سطر لكل عمود بصيغة: «عنوان العمود = 20»</label>
                    <textarea
                      className="schedule-select w-full text-xs font-mono"
                      rows={4}
                      defaultValue={Object.entries(pp.col_widths || {}).map(([k, v]) => `${k} = ${v}`).join('\n')}
                      placeholder={'التوقيع = 25\nمجموع الأجور = 15'}
                      onBlur={(e) => {
                        const map: Record<string, number> = {};
                        e.target.value.split('\n').forEach((line) => {
                          const idx = line.lastIndexOf('=');
                          if (idx < 1) return;
                          const key = line.slice(0, idx).trim();
                          const val = Number(line.slice(idx + 1).trim());
                          if (key && val > 0) map[key] = Math.min(90, val);
                        });
                        setPP({ col_widths: Object.keys(map).length ? map : undefined });
                      }}
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      الأعمدة غير المذكورة يُوزَّع عليها الباقي تلقائياً حتى يبلغ المجموع 100٪ — فلا تبقى مساحة فارغة على يمين الجدول أو يساره.
                    </p>
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

          {step === 8 && (() => {
            const rules = (s as any).row_rules || [];
            const aggs = (s as any).aggregations || [];
            const updRule = (i: number, p: any) => patch({ row_rules: rules.map((r: any, idx: number) => idx === i ? { ...r, ...p } : r) } as any);
            const delRule = (i: number) => patch({ row_rules: rules.filter((_: any, idx: number) => idx !== i) } as any);
            const addRule = () => patch({ row_rules: [...rules, { color: '#fee2e2', label: '', logic: 'AND', conditions: [{ column: 'A', op: 'is_not_empty' }] }] } as any);
            const updRuleCond = (i: number, ci: number, p: any) => {
              const r = rules[i]; const cs = (r.conditions || []).map((c: any, idx: number) => idx === ci ? { ...c, ...p } : c);
              updRule(i, { conditions: cs });
            };
            const addRuleCond = (i: number) => updRule(i, { conditions: [...(rules[i].conditions || []), { column: 'A', op: 'is_not_empty' }] });
            const delRuleCond = (i: number, ci: number) => updRule(i, { conditions: (rules[i].conditions || []).filter((_: any, idx: number) => idx !== ci) });
            const addAgg = () => patch({ aggregations: [...aggs, { column: 'A', op: 'sum', label: '' }] } as any);
            const updAgg = (i: number, p: any) => patch({ aggregations: aggs.map((a: any, idx: number) => idx === i ? { ...a, ...p } : a) } as any);
            const delAgg = (i: number) => patch({ aggregations: aggs.filter((_: any, idx: number) => idx !== i) } as any);
            const PRESET_COLORS = ['#fee2e2','#fef3c7','#dcfce7','#dbeafe','#f3e8ff','#ffedd5','#fce7f3','#e0e7ff'];
            return (
              <div className="space-y-5">
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
                  <strong className="text-sm block mb-1">✨ ميزات متقدمة</strong>
                  <p className="text-[11px] text-slate-600">
                    ثلاث ميزات احترافية: تلوين الصفوف بناءً على شرط، ذيل مجاميع/متوسطات للأعمدة الرقمية، وشريط بحث عام فوق الجدول.
                  </p>
                </div>

                {/* Global search */}
                <div className="border rounded-lg p-3 bg-slate-50">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!(s as any).global_search} onChange={(e) => patch({ global_search: e.target.checked } as any)} />
                    <span>
                      🔍 تفعيل شريط البحث العام فوق الجدول
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        عند التفعيل يظهر مربع بحث يفلتر السجلات عبر جميع الأعمدة الظاهرة بشكل فوري.
                      </span>
                    </span>
                  </label>
                </div>

                {/* Row highlighting */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm">🎨 قواعد تلوين الصفوف</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">أول قاعدة يتحقق شرطها = يُطبَّق لونها على خلفية الصف.</p>
                    </div>
                    <button className="schedule-btn schedule-btn-primary" onClick={addRule} style={{ minHeight: 32, padding: '4px 10px' }}>➕ قاعدة</button>
                  </div>
                  {rules.length === 0 && <p className="text-xs text-slate-500 text-center py-3 bg-white rounded border border-dashed">لا توجد قواعد تلوين.</p>}
                  {rules.map((r: any, i: number) => (
                    <div key={i} className="bg-white border rounded-lg p-3 space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3 flex items-center gap-1">
                          <input type="color" className="h-9 w-12 rounded border cursor-pointer" value={r.color || '#fee2e2'} onChange={(e) => updRule(i, { color: e.target.value })} />
                          <div className="flex flex-wrap gap-0.5">
                            {PRESET_COLORS.map((c) => (
                              <button key={c} onClick={() => updRule(i, { color: c })} className="w-4 h-4 rounded-full border" style={{ background: c, borderColor: r.color === c ? '#111' : '#e2e8f0' }} title={c} />
                            ))}
                          </div>
                        </div>
                        <input className="schedule-select col-span-5" value={r.label || ''} onChange={(e) => updRule(i, { label: e.target.value })} placeholder="وصف القاعدة (اختياري) — مثل: متأخر / منتهي" />
                        <select className="schedule-select col-span-2" value={r.logic || 'AND'} onChange={(e) => updRule(i, { logic: e.target.value })}>
                          <option value="AND">كل الشروط</option>
                          <option value="OR">أي شرط</option>
                        </select>
                        <button className="schedule-btn schedule-btn-secondary col-span-1" onClick={() => addRuleCond(i)} style={{ minHeight: 32, padding: '4px 6px' }}>➕</button>
                        <button onClick={() => delRule(i)} className="col-span-1 text-red-600 font-black">✕</button>
                      </div>
                      <div className="space-y-1 pl-2">
                        {(r.conditions || []).map((c: any, ci: number) => (
                          <div key={ci} className="grid grid-cols-12 gap-2 items-center">
                            <input className="schedule-select col-span-2 text-center font-mono" value={c.column} onChange={(e) => updRuleCond(i, ci, { column: e.target.value.toUpperCase() })} placeholder="عمود" />
                            <select className="schedule-select col-span-4" value={c.op} onChange={(e) => updRuleCond(i, ci, { op: e.target.value, value: '', values: [] })}>
                              {OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                            </select>
                            <CondValueInput c={c} span={5} upd={(p) => updRuleCond(i, ci, p)} />
                            <button onClick={() => delRuleCond(i, ci)} className="col-span-1 text-red-500 text-sm">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Aggregations */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm">📊 ذيل المجاميع (Aggregations)</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">يضيف صفاً في أسفل الجدول بمجموع/متوسط/عدد لكل عمود مختار (يُحسب على الصفوف بعد التصفية).</p>
                    </div>
                    <button className="schedule-btn schedule-btn-primary" onClick={addAgg} style={{ minHeight: 32, padding: '4px 10px' }}>➕ عمود</button>
                  </div>
                  {aggs.length === 0 && <p className="text-xs text-slate-500 text-center py-3 bg-white rounded border border-dashed">لم يتم إضافة أي تجميع.</p>}
                  {aggs.map((a: any, i: number) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-lg border">
                      <input className="schedule-select col-span-2 text-center font-mono" value={a.column} onChange={(e) => updAgg(i, { column: e.target.value.toUpperCase() })} placeholder="عمود" />
                      <select className="schedule-select col-span-3" value={a.op} onChange={(e) => updAgg(i, { op: e.target.value })}>
                        <option value="sum">Σ المجموع</option>
                        <option value="avg">x̄ المتوسط</option>
                        <option value="count"># عدد القيم</option>
                        <option value="countUnique">#∪ عدد القيم الفريدة</option>
                        <option value="min">↓ الأصغر</option>
                        <option value="max">↑ الأكبر</option>
                      </select>
                      <input className="schedule-select col-span-6" value={a.label || ''} onChange={(e) => updAgg(i, { label: e.target.value })} placeholder="التسمية الظاهرة (اختياري) — مثال: مجموع الساعات" />
                      <button onClick={() => delAgg(i)} className="col-span-1 text-red-600 font-black">✕</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {step === 9 && (() => {
            const limits = (s.option_limits || {}) as Record<string, any>;
            const links = (s.linked_systems || []) as any[];
            const setLimit = (letter: string, cfg: any) => patch({ option_limits: { ...limits, [letter]: cfg } });
            const delLimit = (letter: string) => {
              const next = { ...limits }; delete next[letter];
              patch({ option_limits: next });
            };
            const updLink = (i: number, p: any) => patch({ linked_systems: links.map((l, idx) => idx === i ? { ...l, ...p } : l) });
            const delLink = (i: number) => patch({ linked_systems: links.filter((_, idx) => idx !== i) });
            const addLink = () => patch({ linked_systems: [...links, { target_id: '', label: '', map: {} }] });
            return (
              <div className="space-y-5">
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
                  <strong className="text-sm block mb-1">🔗 الربط والقيود</strong>
                  <p className="text-[11px] text-slate-600">
                    قيود الإرسال (رد واحد لكل مستخدم، سعة الخيارات)، أعمدة التتبّع التلقائية، أرشفة المحذوف، الربط بين الأنظمة، وقارئ QR.
                  </p>
                </div>

                {/* Joined reports (تقارير مدمجة من نظامين) */}
                {(() => {
                  const jrs = (s.joined_reports || []) as any[];
                  const updJ = (i: number, p: any) => patch({ joined_reports: jrs.map((j, idx) => idx === i ? { ...j, ...p } : j) } as any);
                  const delJ = (i: number) => patch({ joined_reports: jrs.filter((_, idx) => idx !== i) } as any);
                  const addJ = () => patch({ joined_reports: [...jrs, {
                    id: `join_${Date.now().toString(36)}`, title: '', target_id: '', left_key: 'A', right_key: 'A',
                    join_type: 'left', columns: [], show_totals: false,
                    style: { header_bg: '#0f172a', header_color: '#ffffff', row_bg: '#ffffff', alt_row_bg: '#f8fafc', text_color: '#0f172a', border_color: '#cbd5e1', font_size: 12, row_height: 24, footer_bg: '#e2e8f0', footer_text: '#0f172a', align: 'center' },
                  }] } as any);
                  const setStyle = (i: number, p: any) => updJ(i, { style: { ...(jrs[i].style || {}), ...p } });
                  const AGGS: [string, string][] = [
                    ['first', 'أول قيمة مطابقة'],
                    ['last', 'آخر قيمة مطابقة'],
                    ['sum', 'مجموع القيم'],
                    ['avg', 'متوسط القيم'],
                    ['count', 'عدد القيم'],
                    ['min', 'أصغر قيمة'],
                    ['max', 'أكبر قيمة'],
                    ['concat', 'دمج كل القيم نصياً'],
                  ];
                  return (
                    <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="text-sm">🧩 تقارير مدمجة من نظامين (Join)</strong>
                          <div className="text-[11px] text-slate-600 mt-1 leading-relaxed bg-white border rounded p-2">
                            اختر النظام الثاني، ثم <b>عمود المُعرِّف المشترك</b> في كل جهة (مثلاً رقم الهوية أو اسم التدريسي).
                            بعدها أضف الأعمدة التي تريدها في التقرير الموحّد، وحدّد لكل عمود من النظام الثاني
                            <b> طريقة الاشتقاق</b> عند تعدّد الصفوف المطابقة (أول/آخر/مجموع/متوسط/عدد/أصغر/أكبر/دمج).
                            يظهر التقرير كزر داخل النظام، مع تحكم كامل بالتصميم من الهيدر حتى الفوتر.
                          </div>
                        </div>
                        <button className="schedule-btn schedule-btn-primary shrink-0" style={{ minHeight: 32, padding: '4px 10px', fontSize: 12 }} onClick={addJ}>+ تقرير مدمج</button>
                      </div>

                      {jrs.length === 0 && <div className="text-[11px] text-slate-500">لا توجد تقارير مدمجة بعد.</div>}

                      {jrs.map((j, i) => {
                        const cols = (j.columns || []) as any[];
                        const updC = (ci: number, p: any) => updJ(i, { columns: cols.map((c, x) => x === ci ? { ...c, ...p } : c) });
                        const delC = (ci: number) => updJ(i, { columns: cols.filter((_, x) => x !== ci) });
                        const addC = (side: 'left' | 'right') => updJ(i, { columns: [...cols, { side, column: 'A', label: '', agg: side === 'right' ? 'first' : undefined }] });
                        const stl = j.style || {};
                        return (
                          <div key={j.id || i} className="border-2 rounded-lg p-3 bg-white space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-black mb-1">عنوان التقرير</label>
                                <input className="schedule-select w-full text-xs" value={j.title || ''} onChange={(e) => updJ(i, { title: e.target.value })} placeholder="مثال: كشف موحّد للأجور والتكليفات" />
                              </div>
                              <div>
                                <label className="block text-[11px] font-black mb-1">النظام الثاني</label>
                                <select className="schedule-select w-full text-xs" value={j.target_id || ''} onChange={(e) => updJ(i, { target_id: e.target.value })}>
                                  <option value="">— اختر —</option>
                                  {allSystems.filter((x) => x.id && x.id !== s.id).map((x) => (
                                    <option key={x.id} value={x.id}>{x.icon} {x.title}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[11px] font-black mb-1">مُعرِّف هذا النظام (حرف)</label>
                                <input className="schedule-select w-full text-xs" value={j.left_key || ''} onChange={(e) => updJ(i, { left_key: e.target.value.toUpperCase().trim() })} placeholder="مثال: B" />
                              </div>
                              <div>
                                <label className="block text-[11px] font-black mb-1">مُعرِّف النظام الثاني (حرف)</label>
                                <input className="schedule-select w-full text-xs" value={j.right_key || ''} onChange={(e) => updJ(i, { right_key: e.target.value.toUpperCase().trim() })} placeholder="مثال: C" />
                              </div>
                              <div>
                                <label className="block text-[11px] font-black mb-1">نوع الدمج</label>
                                <select className="schedule-select w-full text-xs" value={j.join_type || 'left'} onChange={(e) => updJ(i, { join_type: e.target.value })}>
                                  <option value="left">كل صفوف هذا النظام (حتى غير المطابقة)</option>
                                  <option value="inner">الصفوف المتطابقة فقط</option>
                                </select>
                              </div>
                            </div>

                            <div className="border rounded p-2 bg-slate-50 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-xs">أعمدة التقرير الموحّد</strong>
                                <div className="flex gap-1">
                                  <button className="schedule-btn schedule-btn-secondary" style={{ minHeight: 28, padding: '2px 8px', fontSize: 11 }} onClick={() => addC('left')}>+ عمود من هذا النظام</button>
                                  <button className="schedule-btn schedule-btn-secondary" style={{ minHeight: 28, padding: '2px 8px', fontSize: 11 }} onClick={() => addC('right')}>+ عمود من النظام الثاني</button>
                                </div>
                              </div>
                              {cols.length === 0 && <div className="text-[11px] text-slate-500">أضف عموداً واحداً على الأقل.</div>}
                              {cols.map((c, ci) => (
                                <div key={ci} className="grid grid-cols-1 md:grid-cols-[110px_80px_1fr_150px_36px] gap-1 items-center">
                                  <select className="schedule-select text-[11px]" value={c.side} onChange={(e) => updC(ci, { side: e.target.value })}>
                                    <option value="left">هذا النظام</option>
                                    <option value="right">النظام الثاني</option>
                                  </select>
                                  <input className="schedule-select text-[11px]" value={c.column || ''} onChange={(e) => updC(ci, { column: e.target.value.toUpperCase().trim() })} placeholder="حرف" />
                                  <input className="schedule-select text-[11px]" value={c.label || ''} onChange={(e) => updC(ci, { label: e.target.value })} placeholder="عنوان العمود (فارغ = عنوان الورقة)" />
                                  {c.side === 'right' ? (
                                    <select className="schedule-select text-[11px]" value={c.agg || 'first'} onChange={(e) => updC(ci, { agg: e.target.value })}>
                                      {AGGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  ) : <span className="text-[10px] text-slate-400">—</span>}
                                  <button className="text-red-600 font-black" onClick={() => delC(ci)}>×</button>
                                </div>
                              ))}
                              <label className="flex items-center gap-2 text-[11px] font-bold pt-1">
                                <input type="checkbox" checked={!!j.show_totals} onChange={(e) => updJ(i, { show_totals: e.target.checked })} />
                                إظهار ذيل مجاميع للأعمدة الرقمية
                              </label>
                            </div>

                            <div className="border rounded p-2 bg-slate-50">
                              <strong className="text-xs block mb-1">🎨 تصميم الجدول (الهيدر → الفوتر)</strong>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-bold">
                                <label>خلفية الهيدر<input type="color" className="w-full h-7 rounded border" value={stl.header_bg || '#0f172a'} onChange={(e) => setStyle(i, { header_bg: e.target.value })} /></label>
                                <label>لون خط الهيدر<input type="color" className="w-full h-7 rounded border" value={stl.header_color || '#ffffff'} onChange={(e) => setStyle(i, { header_color: e.target.value })} /></label>
                                <label>خلفية الصفوف<input type="color" className="w-full h-7 rounded border" value={stl.row_bg || '#ffffff'} onChange={(e) => setStyle(i, { row_bg: e.target.value })} /></label>
                                <label>خلفية الصفوف الزوجية<input type="color" className="w-full h-7 rounded border" value={stl.alt_row_bg || '#f8fafc'} onChange={(e) => setStyle(i, { alt_row_bg: e.target.value })} /></label>
                                <label>لون النص<input type="color" className="w-full h-7 rounded border" value={stl.text_color || '#0f172a'} onChange={(e) => setStyle(i, { text_color: e.target.value })} /></label>
                                <label>لون الحدود<input type="color" className="w-full h-7 rounded border" value={stl.border_color || '#cbd5e1'} onChange={(e) => setStyle(i, { border_color: e.target.value })} /></label>
                                <label>خلفية الفوتر<input type="color" className="w-full h-7 rounded border" value={stl.footer_bg || '#e2e8f0'} onChange={(e) => setStyle(i, { footer_bg: e.target.value })} /></label>
                                <label>لون خط الفوتر<input type="color" className="w-full h-7 rounded border" value={stl.footer_text || '#0f172a'} onChange={(e) => setStyle(i, { footer_text: e.target.value })} /></label>
                                <label>حجم الخط (px)<input type="number" min={8} max={22} className="schedule-select w-full text-[11px]" value={stl.font_size || 12} onChange={(e) => setStyle(i, { font_size: parseInt(e.target.value) || 12 })} /></label>
                                <label>ارتفاع الصف (px)<input type="number" min={16} max={60} className="schedule-select w-full text-[11px]" value={stl.row_height || 24} onChange={(e) => setStyle(i, { row_height: parseInt(e.target.value) || 24 })} /></label>
                                <label>محاذاة النص
                                  <select className="schedule-select w-full text-[11px]" value={stl.align || 'center'} onChange={(e) => setStyle(i, { align: e.target.value })}>
                                    <option value="center">وسط</option>
                                    <option value="right">يمين</option>
                                    <option value="left">يسار</option>
                                  </select>
                                </label>
                              </div>
                            </div>

                            <div className="text-right">
                              <button className="text-red-600 text-[11px] font-black underline" onClick={() => delJ(i)}>🗑️ حذف هذا التقرير المدمج</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Single response */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!s.single_response_enabled} onChange={(e) => patch({ single_response_enabled: e.target.checked })} />
                    <span>
                      🔒 السماح بسجل واحد فقط لكل مستخدم
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        بعد إرسال المستخدم سجله، يتحول زر «إضافة» إلى «لقد أرسلت ردك». التحقق يتم على الخادم.
                      </span>
                    </span>
                  </label>
                  {s.single_response_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-black mb-1">عمود هوية المستخدم (حرف Excel)</label>
                        <input className="schedule-select w-full" value={s.single_response_column || ''} onChange={(e) => patch({ single_response_column: e.target.value.toUpperCase().trim() })} placeholder="عادةً عمود الاسم (مثال: B)" />
                      </div>
                      <label className="flex items-center gap-2 text-xs font-bold mt-5">
                        <input type="checkbox" checked={s.single_response_allow_edit !== false} onChange={(e) => patch({ single_response_allow_edit: e.target.checked })} />
                        السماح للمستخدم بتعديل سجله لاحقاً
                      </label>
                    </div>
                  )}
                </div>

                {/* Option limits */}
                {(() => {
                  const selectCols = colLetters.filter((L) => (s.column_types || {})[L] === 'select');
                  const optionsOf = (L: string): string[] =>
                    String((s.column_options || {})[L] || '')
                      .split(/[,،\n]+/).map((x) => x.trim()).filter(Boolean);
                  return (
                    <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <strong className="text-sm">🎯 سعة خيارات القوائم المنسدلة (تحديد عدد لكل خيار)</strong>
                          <div className="text-[11px] text-slate-600 mt-1 leading-relaxed bg-white border rounded p-2">
                            كيف تعمل؟ تختار <b>عموداً من نوع «📋 قائمة منسدلة»</b>، ثم تحدد كم رداً يُسمح به
                            <b> لكل خيار داخل تلك القائمة</b>. يعدّ النظام الصفوف الموجودة فعلاً في الورقة لكل قيمة؛
                            وعند بلوغ الخيار حدّه يُعطَّل أو يُخفى <b>هو وحده</b> دون بقية الخيارات، والتحقق النهائي يجري على الخادم.
                            <br />
                            <b>السعة العامة</b> = حدّ واحد يُطبَّق على كل الخيارات. و<b>السعة المخصّصة</b> أدناه تُحدَّد
                            <b> لكل خيار على حدة</b> وتتقدّم على السعة العامة (0 = بلا حد).
                          </div>
                        </div>
                        <button
                          className="schedule-btn schedule-btn-primary shrink-0"
                          style={{ minHeight: 32, padding: '4px 10px' }}
                          onClick={() => setLimit(selectCols.find((L) => !limits[L]) || selectCols[0] || 'A', { limit: 0, per: {}, mode: 'disable' })}
                        >➕ إضافة عمود</button>
                      </div>

                      {selectCols.length === 0 && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                          ⚠️ لا يوجد عمود من نوع «قائمة منسدلة» بعد. اذهب إلى الخطوة 5 ← «أنواع حقول الإدخال» واجعل نوع العمود «📋 قائمة منسدلة» وأدخل خياراته، ثم عُد إلى هنا.
                        </p>
                      )}
                      {Object.keys(limits).length === 0 && <p className="text-xs text-slate-500 text-center py-3 bg-white rounded border border-dashed">لا توجد قيود سعة.</p>}

                      {Object.entries(limits).map(([letter, cfg]: [string, any]) => {
                        const opts = optionsOf(letter);
                        const per: Record<string, number> = cfg.per || {};
                        return (
                          <div key={letter} className="bg-white p-3 rounded-lg border space-y-2">
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-4">
                                <label className="block text-[10px] font-black mb-1">العمود (قائمة منسدلة)</label>
                                <select
                                  className="schedule-select w-full text-xs"
                                  value={letter}
                                  onChange={(e) => {
                                    const nl = e.target.value;
                                    const next: Record<string, any> = {};
                                    Object.entries(limits).forEach(([k, v]) => { next[k === letter ? nl : k] = v; });
                                    patch({ option_limits: next });
                                  }}
                                >
                                  {(selectCols.length ? selectCols : colLetters).map((L) => (
                                    <option key={L} value={L}>{L} — {labels[L] || `عمود ${L}`}</option>
                                  ))}
                                  {!colLetters.includes(letter) && <option value={letter}>{letter}</option>}
                                </select>
                              </div>
                              <div className="col-span-3">
                                <label className="block text-[10px] font-black mb-1">السعة العامة (0 = بلا حد)</label>
                                <input className="schedule-select w-full text-xs" type="number" min={0} value={cfg.limit ?? 0}
                                  onChange={(e) => setLimit(letter, { ...cfg, limit: Number(e.target.value) })} placeholder="مثال: 5" />
                              </div>
                              <div className="col-span-4">
                                <label className="block text-[10px] font-black mb-1">عند اكتمال الخيار</label>
                                <select className="schedule-select w-full text-xs" value={cfg.mode || 'disable'} onChange={(e) => setLimit(letter, { ...cfg, mode: e.target.value })}>
                                  <option value="disable">تعطيل الخيار مع «اكتمل العدد»</option>
                                  <option value="hide">إخفاء الخيار نهائياً</option>
                                </select>
                              </div>
                              <button onClick={() => delLimit(letter)} className="col-span-1 text-red-600 font-black self-end pb-2" title="حذف">✕</button>
                            </div>

                            <div className="pt-2 border-t border-dashed">
                              <label className="block text-[10px] font-black mb-1">سعة مخصّصة لكل خيار (اتركه 0 لاعتماد السعة العامة)</label>
                              {opts.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {opts.map((opt) => (
                                    <div key={opt} className="flex items-center gap-2 bg-slate-50 border rounded px-2 py-1">
                                      <span className="text-[11px] font-bold flex-1 truncate" title={opt}>{opt}</span>
                                      <input
                                        className="schedule-select text-xs w-20 text-center"
                                        type="number" min={0}
                                        value={per[opt] ?? 0}
                                        onChange={(e) => {
                                          const v = Number(e.target.value) || 0;
                                          const nextPer = { ...per };
                                          if (v > 0) nextPer[opt] = v; else delete nextPer[opt];
                                          setLimit(letter, { ...cfg, per: nextPer });
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <>
                                  <p className="text-[11px] text-slate-500 mb-1">
                                    لم يتم العثور على خيارات مكتوبة يدوياً لهذا العمود (ربما مصدر الخيارات «القيم الفريدة من العمود»). اكتب السعة يدوياً بصيغة «الخيار=العدد».
                                  </p>
                                  <FreeTextInput
                                    className="schedule-select w-full text-xs"
                                    canon={Object.entries(per).map(([k, v]) => `${k}=${v}`).join(' , ')}
                                    parse={(raw) => {
                                      const m: Record<string, number> = {};
                                      raw.split(/[,،\n]+/).forEach((pair) => {
                                        const [k, v] = pair.split('=');
                                        if (k && k.trim() && v !== undefined && !Number.isNaN(Number(v))) m[k.trim()] = Number(v);
                                      });
                                      return m;
                                    }}
                                    serialize={(m) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' , ')}
                                    onParsed={(m) => setLimit(letter, { ...cfg, per: m })}
                                    placeholder="مثال: قاعة أ=3 , قاعة ب=5"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Audit columns */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!s.audit_enabled} onChange={(e) => patch({ audit_enabled: e.target.checked })} />
                    <span>
                      🧾 أعمدة التتبّع التلقائية
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        تُملأ على الخادم: اسم مُدخل البيانات وتاريخ الإضافة (مرة واحدة)، واسم آخر مُعدِّل وتاريخ آخر تعديل.
                      </span>
                    </span>
                  </label>
                  {s.audit_enabled && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div><label className="block text-xs font-black mb-1">مُدخل البيانات</label>
                        <input className="schedule-select w-full" value={s.audit_created_by_column || ''} onChange={(e) => patch({ audit_created_by_column: e.target.value.toUpperCase().trim() })} placeholder="مثال: X" /></div>
                      <div><label className="block text-xs font-black mb-1">تاريخ الإضافة</label>
                        <input className="schedule-select w-full" value={s.audit_created_at_column || ''} onChange={(e) => patch({ audit_created_at_column: e.target.value.toUpperCase().trim() })} placeholder="مثال: Y" /></div>
                      <div><label className="block text-xs font-black mb-1">آخر مُعدِّل</label>
                        <input className="schedule-select w-full" value={s.audit_updated_by_column || ''} onChange={(e) => patch({ audit_updated_by_column: e.target.value.toUpperCase().trim() })} placeholder="مثال: Z" /></div>
                      <div><label className="block text-xs font-black mb-1">تاريخ آخر تعديل</label>
                        <input className="schedule-select w-full" value={s.audit_updated_at_column || ''} onChange={(e) => patch({ audit_updated_at_column: e.target.value.toUpperCase().trim() })} placeholder="مثال: AA" /></div>
                    </div>
                  )}
                </div>

                {/* Archive */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!s.archive_enabled} onChange={(e) => patch({ archive_enabled: e.target.checked })} />
                    <span>
                      🗄️ أرشفة السجل قبل حذفه
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        يُنسخ السطر كاملاً إلى ورقة الأرشيف مع اسم من حذفه وتاريخ الحذف، ثم يُحذف من الورقة الأصلية.
                      </span>
                    </span>
                  </label>
                  {s.archive_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div><label className="block text-xs font-black mb-1">رابط ملف الأرشيف (اختياري)</label>
                        <input className="schedule-select w-full" value={s.archive_sheet_url || ''} onChange={(e) => patch({ archive_sheet_url: e.target.value.trim() })} placeholder="اتركه فارغاً لاستخدام نفس الملف الحالي" /></div>
                      <div><label className="block text-xs font-black mb-1">GID ورقة الأرشيف *</label>
                        <input className="schedule-select w-full" value={s.archive_gid || ''} onChange={(e) => patch({ archive_gid: e.target.value.trim() })} placeholder="مثال: 123456789" /></div>
                    </div>
                  )}
                </div>

                {/* Linked systems */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm">🔗 الأنظمة المرتبطة</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">يظهر زر انتقال للنظام الآخر مع تعبئة الحقول المشتركة تلقائياً.</p>
                    </div>
                    <button className="schedule-btn schedule-btn-primary" style={{ minHeight: 32, padding: '4px 10px' }} onClick={addLink}>➕ ربط</button>
                  </div>
                  {links.length === 0 && <p className="text-xs text-slate-500 text-center py-3 bg-white rounded border border-dashed">لا توجد أنظمة مرتبطة.</p>}
                  {links.map((l, i) => (
                    <div key={i} className="bg-white p-2 rounded-lg border space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <select className="schedule-select col-span-5" value={l.target_id || ''} onChange={(e) => updLink(i, { target_id: e.target.value })}>
                          <option value="">— اختر النظام الهدف —</option>
                          {allSystems.filter((x) => x.id && x.id !== s.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.icon} {x.title}</option>
                          ))}
                        </select>
                        <input className="schedule-select col-span-6" value={l.label || ''} onChange={(e) => updLink(i, { label: e.target.value })} placeholder="نص الزر (اختياري) — مثال: التالي: استمارة الأجور" />
                        <button onClick={() => delLink(i)} className="col-span-1 text-red-600 font-black">✕</button>
                      </div>
                      <FreeTextInput
                        className="schedule-select w-full text-xs"
                        canon={Object.entries(l.map || {}).map(([k, v]) => `${k}=${v}`).join(' , ')}
                        parse={(raw) => {
                          const map: Record<string, string> = {};
                          raw.split(/[,،\n]+/).forEach((pair) => {
                            const [k, v] = pair.split('=');
                            if (k && k.trim() && v && v.trim()) map[k.trim().toUpperCase()] = v.trim().toUpperCase();
                          });
                          return map;
                        }}
                        serialize={(m) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join(' , ')}
                        onParsed={(map) => updLink(i, { map })}
                        placeholder="ربط الأعمدة: عمود هنا = عمود هناك — مثال: B=C , F=D"
                      />
                    </div>
                  ))}
                </div>

                {/* QR */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!s.qr_enabled} onChange={(e) => patch({ qr_enabled: e.target.checked })} />
                    <span>
                      📷 تفعيل الإدخال عبر قارئ QR
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        يظهر زر 📷 في نافذة الإضافة لمسح رمز يحمل قيمة واحدة أو عدة حقول بصيغة «حرف العمود=القيمة».
                      </span>
                    </span>
                  </label>
                  {s.qr_enabled && (
                    <div>
                      <label className="block text-xs font-black mb-1">الأعمدة التي يمكن تعبئتها بالمسح (اتركه فارغاً = كل الأعمدة)</label>
                      <input
                        className="schedule-select w-full"
                        dir="ltr"
                        value={qrFieldsText}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setQrFieldsText(raw);
                          patch({ qr_fields: splitMulti(raw).map((v) => v.toUpperCase()) });
                        }}
                        placeholder="مثال: B, C, F"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {step === 10 && (() => {
            const ccs = (s.computed_columns || []) as ComputedColumn[];
            const setCCs = (v: ComputedColumn[]) => patch({ computed_columns: v });
            const addCC = () => setCCs([...ccs, { name: '', type: 'duration', columns: [] }]);
            const updCC = (i: number, p: Partial<ComputedColumn>) => setCCs(ccs.map((c, idx) => idx === i ? { ...c, ...p } : c));
            const delCC = (i: number) => setCCs(ccs.filter((_, idx) => idx !== i));
            

            const gs = s.group_stage;
            const setGS = (p: Partial<GroupStage>) => patch({ group_stage: { keys: gs?.keys || [], aggs: gs?.aggs || [], having: gs?.having || [], emit: gs?.emit || 'groups', ...p } });
            const gsAggs = gs?.aggs || [];
            const gsHaving = gs?.having || [];
            const HAVING_OPS: ('eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte')[] = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte'];

            const cd = s.conflict_detector;
            const setCD = (p: Partial<ConflictCfg>) => patch({ conflict_detector: {
              group_by: cd?.group_by || [], range_column: cd?.range_column || '',
              from_column: cd?.from_column || '', to_column: cd?.to_column || '',
              also_match: cd?.also_match || [],
              flag: cd?.flag || 'يوجد تعارض ⚠️',
              flag_column: cd?.flag_column || '⚠️ تعارض',
              only_conflicts: cd?.only_conflicts !== false,
              ...p,
            } });

            const CC_TYPES: [ComputedColumn['type'], string][] = [
              ['duration', '⏱️ مدة زمنية (ساعات)'],
              ['expr', '🧮 معادلة حسابية'],
              ['sum', 'Σ جمع أعمدة'],
              ['concat', '🔗 دمج نصوص'],
              ['count_tokens', '# عدد العناصر في خلية'],
              ['date_diff_days', '📅 فرق الأيام بين تاريخين'],
              ['year_from_date', '📆 سنة من تاريخ'],
              ['month_from_date', '🗓️ رقم الشهر من تاريخ'],
              ['default_if_empty', '🩹 قيمة بديلة عند الفراغ'],
              ['row_number', '# ترقيم تلقائي'],
            ];

            return (
              <div className="space-y-5">
                <div className="bg-violet-50 border-2 border-violet-200 rounded-lg p-3">
                  <strong className="text-sm block mb-1">🧮 المعالجة المتقدمة للبيانات</strong>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    ثلاث مراحل تعمل بالترتيب بعد الشروط والفلاتر: <strong>1) كاشف التعارضات</strong> يوسم الصفوف المتضاربة،
                    ثم <strong>2) الأعمدة المحسوبة</strong> تضيف أعمدة بصيغ ومعادلات، ثم <strong>3) مرحلة التجميع</strong> تجمع الصفوف وتحسب إحصاءاتها.
                    بها يمكن بناء أنظمة مثل «تدريسيون بلا نظري»، «تعارض القاعات»، و«إجمالي الساعات لكل مدرّس» دون كود.
                  </p>
                </div>

                {/* ===== الأعمدة المحسوبة ===== */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-sm">🧮 الأعمدة المحسوبة (صيغ ومعادلات)</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">أعمدة جديدة تُحسب لكل صف: مدة المحاضرة، مجموع ساعات، معادلات حسابية، فرق التواريخ…</p>
                    </div>
                    <button className="schedule-btn schedule-btn-primary" onClick={addCC} style={{ minHeight: 32, padding: '4px 10px' }}>➕ عمود</button>
                  </div>
                  {ccs.length === 0 && <p className="text-xs text-slate-500 text-center py-3 bg-white rounded border border-dashed">لا توجد أعمدة محسوبة.</p>}
                  {ccs.map((cc, i) => (
                    <div key={i} className="bg-white p-2 rounded-lg border space-y-2">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <input className="schedule-select col-span-4" value={cc.name} onChange={(e) => updCC(i, { name: e.target.value })} placeholder="اسم العمود الظاهر (مثال: المدة بالساعات)" />
                        <select className="schedule-select col-span-6" value={cc.type} onChange={(e) => updCC(i, { type: e.target.value as ComputedColumn['type'], columns: [], expr: '', separator: undefined, round: undefined })}>
                          {CC_TYPES.map(([t, lbl]) => <option key={t} value={t}>{lbl}</option>)}
                        </select>
                        <button onClick={() => delCC(i)} className="col-span-2 text-red-600 font-black">✕ حذف</button>
                      </div>
                      <label className="flex items-center gap-2 text-[11px] font-bold cursor-pointer bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                        <input type="checkbox" checked={!!cc.filterable}
                          onChange={(e) => updCC(i, { filterable: e.target.checked })} />
                        <span>🔎 إتاحة فلتر لهذا العمود أعلى الجدول (ويُشمل تلقائياً في البحث العام وبحث الأعمدة)</span>
                      </label>
                      <div className="flex flex-wrap gap-2 items-center">
                        {cc.type === 'duration' && (
                          <FreeTextInput className="schedule-select flex-1 font-mono text-center" dir="ltr"
                            canon={joinList(cc.columns || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => updCC(i, { columns: cols })}
                            placeholder="عمود فترة واحد (J) أو عمودان: بداية، نهاية (J, K)" />
                        )}
                        {cc.type === 'expr' && (
                          <input className="schedule-select flex-1 font-mono" dir="ltr" value={cc.expr || ''} onChange={(e) => updCC(i, { expr: e.target.value })} placeholder="{D} + {E} * 2  — استخدم {حرف العمود}" />
                        )}
                        {(cc.type === 'sum' || cc.type === 'concat') && (
                          <FreeTextInput className="schedule-select flex-1 font-mono text-center" dir="ltr"
                            canon={joinList(cc.columns || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => updCC(i, { columns: cols })}
                            placeholder="الأعمدة مفصولة بفواصل — مثال: D, E, F" />
                        )}
                        {cc.type === 'concat' && (
                          <input className="schedule-select w-24 text-center" value={cc.separator ?? ''} onChange={(e) => updCC(i, { separator: e.target.value })} placeholder="الفاصل" />
                        )}
                        {cc.type === 'count_tokens' && (
                          <FreeTextInput className="schedule-select w-32 font-mono text-center" dir="ltr"
                            canon={joinList(cc.columns || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => updCC(i, { columns: cols })}
                            placeholder="العمود (مثل: E)" />
                        )}
                        {cc.type === 'date_diff_days' && (
                          <FreeTextInput className="schedule-select flex-1 font-mono text-center" dir="ltr"
                            canon={joinList(cc.columns || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => updCC(i, { columns: cols })}
                            placeholder="من، إلى (مثل: H, I) — «إلى» اختياري = اليوم" />
                        )}
                        {(cc.type === 'year_from_date' || cc.type === 'month_from_date') && (
                          <FreeTextInput className="schedule-select w-32 font-mono text-center" dir="ltr"
                            canon={joinList(cc.columns || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => updCC(i, { columns: cols })}
                            placeholder="عمود التاريخ (H)" />
                        )}
                        {cc.type === 'default_if_empty' && (
                          <>
                            <FreeTextInput className="schedule-select w-32 font-mono text-center" dir="ltr"
                              canon={joinList(cc.columns || [])}
                              parse={parseLettersList} serialize={joinList}
                              onParsed={(cols) => updCC(i, { columns: cols })}
                              placeholder="العمود (E)" />
                            <input className="schedule-select flex-1"
                              value={cc.fallback ?? ''}
                              onChange={(e) => updCC(i, { fallback: e.target.value })}
                              placeholder="القيمة البديلة عند فراغ الخلية (مثال: غير محدد)" />
                          </>
                        )}
                        {(cc.type === 'sum' || cc.type === 'expr' || cc.type === 'duration') && (
                          <input className="schedule-select w-24 text-center" type="number" step="0.01"
                            value={cc.round ?? ''}
                            onChange={(e) => updCC(i, { round: e.target.value === '' ? undefined : Number(e.target.value) })}
                            placeholder="تقريب" />
                        )}
                        {cc.type === 'row_number' && <span className="text-[11px] text-slate-500">يُرقّم الصفوف النهائية (بعد كل المراحل) بدءاً من 1.</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ===== مرحلة التجميع ===== */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!gs} onChange={(e) => patch({ group_stage: e.target.checked ? { keys: [], aggs: [], having: [], emit: 'groups' } : undefined })} />
                    <span>
                      📊 تفعيل مرحلة التجميع (Group By)
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        تجمع الصفوف حسب عمود/أعمدة وتحسب إحصاءات لكل مجموعة (عدد، مجموع، قيم فريدة…)، مع إمكانية إبقاء المجموعات المطابقة لشروط فقط.
                        مثال: تجميع حسب «اسم التدريسي» + عدّ المواد النظرية = 0 ⟵ نظام «تدريسيون بلا نظري».
                      </span>
                    </span>
                  </label>
                  {gs && (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-3 text-xs font-black">أعمدة التجميع</label>
                        <FreeTextInput className="schedule-select col-span-5 font-mono text-center" dir="ltr"
                          canon={joinList(gs.keys || [])}
                          parse={parseLettersList} serialize={joinList}
                          onParsed={(keys) => setGS({ keys })}
                          placeholder="مثال: F  أو  F, B" />
                        <label className="col-span-2 text-xs font-black">ما الذي يُعرض؟</label>
                        <select className="schedule-select col-span-2" value={gs.emit || 'groups'} onChange={(e) => setGS({ emit: e.target.value as 'groups' | 'rows' })}>
                          <option value="groups">سطر لكل مجموعة</option>
                          <option value="rows">كل الصفوف + التجميعات</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs">الإحصاءات المحسوبة لكل مجموعة</strong>
                          <button className="schedule-btn" style={{ minHeight: 28, padding: '2px 8px', fontSize: 11 }}
                            onClick={() => setGS({ aggs: [...gsAggs, { name: '', op: 'count' }] })}>➕ إحصاء</button>
                        </div>
                        {gsAggs.map((a, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white p-1.5 rounded border">
                            <input className="schedule-select col-span-4" value={a.name} onChange={(e) => setGS({ aggs: gsAggs.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x) })} placeholder="اسم العمود (مثال: عدد المواد)" />
                            <select className="schedule-select col-span-4" value={a.op} onChange={(e) => setGS({ aggs: gsAggs.map((x, xi) => xi === i ? { ...x, op: e.target.value as any } : x) })}>
                              <option value="count"># عدد الصفوف</option>
                              <option value="count_unique">#∪ قيم فريدة لعمود</option>
                              <option value="sum">Σ مجموع عمود</option>
                              <option value="avg">x̄ متوسط عمود</option>
                              <option value="min">↓ أصغر قيمة</option>
                              <option value="max">↑ أكبر قيمة</option>
                            </select>
                            {a.op !== 'count' ? (
                              <input className="schedule-select col-span-3 text-center font-mono" value={a.column || ''} onChange={(e) => setGS({ aggs: gsAggs.map((x, xi) => xi === i ? { ...x, column: e.target.value.toUpperCase() } : x) })} placeholder="عمود (E)" />
                            ) : <span className="col-span-3 text-center text-[10px] text-slate-400">—</span>}
                            <button onClick={() => setGS({ aggs: gsAggs.filter((_, xi) => xi !== i) })} className="col-span-1 text-red-600 font-black">✕</button>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs">شروط على المجموعات (Having) — أبقِ فقط المجموعات المطابقة</strong>
                          <button className="schedule-btn" style={{ minHeight: 28, padding: '2px 8px', fontSize: 11 }}
                            onClick={() => setGS({ having: [...gsHaving, { agg: gsAggs[0]?.name || '', op: 'eq', value: 0 }] })}>➕ شرط</button>
                        </div>
                        {gsHaving.map((h, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white p-1.5 rounded border">
                            <select className="schedule-select col-span-5" value={h.agg} onChange={(e) => setGS({ having: gsHaving.map((x, xi) => xi === i ? { ...x, agg: e.target.value } : x) })}>
                              <option value="">— اختر عمود الإحصاء —</option>
                              {gsAggs.map((a) => <option key={a.name} value={a.name}>{a.name || '(بدون اسم)'}</option>)}
                            </select>
                            <select className="schedule-select col-span-3" value={h.op} onChange={(e) => setGS({ having: gsHaving.map((x, xi) => xi === i ? { ...x, op: e.target.value as typeof h.op } : x) })}>
                              {HAVING_OPS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                            </select>
                            <input className="schedule-select col-span-3" type="number" value={String(h.value ?? '')} onChange={(e) => setGS({ having: gsHaving.map((x, xi) => xi === i ? { ...x, value: Number(e.target.value) } : x) })} placeholder="القيمة" />
                            <button onClick={() => setGS({ having: gsHaving.filter((_, xi) => xi !== i) })} className="col-span-1 text-red-600 font-black">✕</button>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-12 gap-2 items-center">
                        <label className="col-span-3 text-xs font-black">ترتيب النتائج حسب</label>
                        <input className="schedule-select col-span-5" value={gs.sort_by || ''} onChange={(e) => setGS({ sort_by: e.target.value })} placeholder="اسم عمود (إحصاء أو أصلي)" />
                        <select className="schedule-select col-span-4" value={gs.sort_dir || 'asc'} onChange={(e) => setGS({ sort_dir: e.target.value as 'asc' | 'desc' })}>
                          <option value="asc">تصاعدي</option>
                          <option value="desc">تنازلي</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* ===== كاشف التعارضات ===== */}
                <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
                  <label className="flex items-start gap-2 text-sm font-bold cursor-pointer">
                    <input type="checkbox" checked={!!cd} onChange={(e) => patch({ conflict_detector: e.target.checked ? { group_by: [], range_column: '', flag: 'يوجد تعارض ⚠️', flag_column: '⚠️ تعارض', only_conflicts: true } : undefined })} />
                    <span>
                      ⚠️ تفعيل كاشف التعارضات الزمنية
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        يقارن الفترات الزمنية بين الصفوف داخل كل مجموعة (مثل نفس القاعة في نفس اليوم) ويوسم المتضاربة.
                        مثال نظام «تعارض القاعات»: التجميع = عمود القاعة + عمود اليوم، وعمود الفترة = عمود الوقت.
                      </span>
                    </span>
                  </label>
                  {cd && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-black mb-1">أعمدة التجميع (نفس القاعة/اليوم…)</label>
                          <FreeTextInput className="schedule-select w-full font-mono text-center" dir="ltr"
                            canon={joinList(cd.group_by || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => setCD({ group_by: cols })}
                            placeholder="مثال: G, N" />
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">عمود الفترة الزمنية «08:30 AM - 10:00 AM»</label>
                          <input className="schedule-select w-full font-mono text-center" dir="ltr" value={cd.range_column || ''} onChange={(e) => setCD({ range_column: e.target.value.toUpperCase() })} placeholder="مثال: J" />
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">أو عمودا البداية والنهاية (بديل عن عمود الفترة)</label>
                          <div className="grid grid-cols-2 gap-1">
                            <input className="schedule-select font-mono text-center" dir="ltr" value={cd.from_column || ''} onChange={(e) => setCD({ from_column: e.target.value.toUpperCase() })} placeholder="من (J)" />
                            <input className="schedule-select font-mono text-center" dir="ltr" value={cd.to_column || ''} onChange={(e) => setCD({ to_column: e.target.value.toUpperCase() })} placeholder="إلى (K)" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">أعمدة يجب تطابقها أيضاً (اختياري — مثل الفصل)</label>
                          <FreeTextInput className="schedule-select w-full font-mono text-center" dir="ltr"
                            canon={joinList(cd.also_match || [])}
                            parse={parseLettersList} serialize={joinList}
                            onParsed={(cols) => setCD({ also_match: cols })}
                            placeholder="مثال: S" />
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">اسم عمود النتيجة</label>
                          <input className="schedule-select w-full" value={cd.flag_column || ''} onChange={(e) => setCD({ flag_column: e.target.value })} placeholder="⚠️ تعارض" />
                        </div>
                        <div>
                          <label className="block text-xs font-black mb-1">نص التعارض</label>
                          <input className="schedule-select w-full" value={cd.flag || ''} onChange={(e) => setCD({ flag: e.target.value })} placeholder="يوجد تعارض ⚠️" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                        <input type="checkbox" checked={cd.only_conflicts !== false} onChange={(e) => setCD({ only_conflicts: e.target.checked })} />
                        إظهار الصفوف المتعارضة فقط (أوقفه لعرض كل الصفوف مع وسم المتعارض منها)
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          </div>
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
            <button className="schedule-btn" onClick={requestClose}>إلغاء</button>
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
