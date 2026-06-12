import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CustomSystemDef } from '@/data/customSystemsRegistry';
import { sheetWrite, isCrudActive } from '@/data/customSystemsRegistry';
import { fetchSheetByGid } from '@/data/supervisionData';
import { parseColumnsRange, colIndexToLetter, colLetterToIndex } from '@/lib/conditionEngine';
import { getSession, getCachedAdminPassword, setCachedAdminPassword } from '@/lib/teacherAuth';
import { getEffectivePerms } from '@/lib/permissions';

interface Props {
  def: CustomSystemDef;
}

type ColType = 'text' | 'number' | 'date' | 'select' | 'readonly';

interface ColMeta {
  letter: string;
  header: string;
  type: ColType;
  options: string[];          // computed options for select
  allowCustom: boolean;       // free-text combobox
  source: 'manual' | 'column';
}

const CrudPanel = ({ def }: Props) => {
  const qc = useQueryClient();
  const externalUrl = def.sheet_source === 'external' ? def.sheet_url : undefined;
  const session = getSession();
  const teacherCol = (def.teacher_column || '').toUpperCase();
  const teacherName = session?.user?.full_name || '';

  const { data: sheet, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['custom-crud', def.id, def.sheet_gid, externalUrl || ''],
    queryFn: () => fetchSheetByGid(def.sheet_gid, externalUrl),
    staleTime: 0,
  });

  const cols: ColMeta[] = useMemo(() => {
    if (!sheet) return [];
    const idxs = parseColumnsRange(def.columns_range);
    const types = def.column_types || {};
    const manualOpts = def.column_options || {};
    const srcMap = def.column_select_source || {};
    const allowMap = def.column_select_allow_custom || {};
    return idxs.map((i) => {
      const letter = colIndexToLetter(i);
      const header = sheet.headers[i] || letter;
      const labelOverride = (def.header_labels || {})[letter];
      const type = (types[letter] as ColType) || 'text';
      const source = (srcMap[letter] || 'manual') as 'manual' | 'column';
      let options: string[] = [];
      if (type === 'select') {
        if (source === 'column') {
          const colIdx = colLetterToIndex(letter);
          const headerKey = sheet.headers[colIdx];
          const set = new Set<string>();
          sheet.rows.forEach((r) => {
            const raw = (r[headerKey] || '').trim();
            if (!raw) return;
            // Split on newlines so multi-line cells contribute distinct values
            raw.split(/\r?\n/).forEach((v) => {
              const t = v.trim();
              if (t) set.add(t);
            });
          });
          options = Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
        } else {
          options = (manualOpts[letter] || '')
            .split(/[,،\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      return {
        letter,
        header: labelOverride || header,
        type,
        options,
        allowCustom: !!allowMap[letter],
        source,
      };
    });
  }, [sheet, def]);

  // Build editable rows (filter by teacher if required)
  const rows = useMemo(() => {
    if (!sheet) return [] as Array<{ raw: Record<string, string>; snapshot: Record<string, string>; display: Record<string, string> }>;
    const out: Array<{ raw: Record<string, string>; snapshot: Record<string, string>; display: Record<string, string> }> = [];
    sheet.rows.forEach((r) => {
      if (def.require_teacher_auth && teacherCol && teacherName) {
        const cellIdx = colLetterToIndex(teacherCol);
        const cell = (cellIdx >= 0 ? r[sheet.headers[cellIdx]] : '') || '';
        if (cell.trim() !== teacherName.trim()) return;
      }
      const snapshot: Record<string, string> = {};
      const display: Record<string, string> = {};
      cols.forEach((c) => {
        const v = r[sheet.headers[colLetterToIndex(c.letter)]] || '';
        snapshot[c.letter] = v;
        display[c.letter] = v;
      });
      out.push({ raw: r, snapshot, display });
    });
    return out;
  }, [sheet, cols, def, teacherCol, teacherName]);

  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => Object.values(r.display).some((v) => v.toLowerCase().includes(q)));
  }, [rows, search]);

  const [editing, setEditing] = useState<null | { mode: 'add' | 'edit'; values: Record<string, string>; snapshot?: Record<string, string> }>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const openAdd = () => {
    const init: Record<string, string> = {};
    cols.forEach((c) => { init[c.letter] = ''; });
    if (def.require_teacher_auth && teacherCol && teacherName) init[teacherCol] = teacherName;
    setEditing({ mode: 'add', values: init });
  };

  const openEdit = (snapshot: Record<string, string>) => {
    setEditing({ mode: 'edit', values: { ...snapshot }, snapshot });
  };

  const ensurePassword = (forDelete: boolean): string | null => {
    const cached = getCachedAdminPassword();
    if (cached) return cached;
    const promptMsg = forDelete
      ? '🔐 أدخل كلمة مرور المدير لتأكيد الحذف (تُحفظ لباقي الجلسة):'
      : '🔐 أدخل كلمة مرور المدير لتفعيل عمليات الإدارة (تُحفظ لباقي الجلسة):';
    const pw = window.prompt(promptMsg) || '';
    if (!pw) return null;
    setCachedAdminPassword(pw);
    return pw;
  };

  const submit = async () => {
    if (!editing) return;
    const password = ensurePassword(false);
    if (!password) return;
    setBusy(true);
    try {
      const payloadValues: Record<string, string> = {};
      cols.forEach((c) => {
        if (c.type !== 'readonly') payloadValues[c.letter] = editing.values[c.letter] || '';
      });
      if (editing.mode === 'add') {
        await sheetWrite({ op: 'append', gid: def.sheet_gid, sheet_url: externalUrl, values: payloadValues, password });
        toast.success('تمت إضافة السجل بنجاح ✅');
      } else {
        await sheetWrite({
          op: 'update', gid: def.sheet_gid, sheet_url: externalUrl,
          values: payloadValues, match: editing.snapshot, password,
        });
        toast.success('تم تحديث السجل بنجاح ✅');
      }
      setEditing(null);
      await refetch();
      qc.invalidateQueries({ queryKey: [`custom-${def.id}`] });
    } catch (e) {
      // If password was wrong, clear cache so user is prompted again next time.
      const msg = (e as Error).message || '';
      if (/كلمة المرور/.test(msg)) setCachedAdminPassword(null);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const remove = async (snapshot: Record<string, string>) => {
    if (!confirm('⚠️ حذف هذا السجل من ورقة Google Sheets نهائياً؟\nلا يمكن التراجع عن هذا الإجراء.')) return;
    const password = ensurePassword(true);
    if (!password) return;
    setBusy(true);
    try {
      await sheetWrite({ op: 'delete', gid: def.sheet_gid, sheet_url: externalUrl, match: snapshot, password });
      toast.success('تم حذف السجل ✅');
      await refetch();
      qc.invalidateQueries({ queryKey: [`custom-${def.id}`] });
    } catch (e) {
      const msg = (e as Error).message || '';
      if (/كلمة المرور/.test(msg)) setCachedAdminPassword(null);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // Effective perms = system perms ∩ user perms (role + per-system override).
  const perms = useMemo(
    () => getEffectivePerms(def, session?.user as any),
    [def, session?.user],
  );
  if (!isCrudActive(def) || !perms.view) return null;

  const accent = def.color || '#0891b2';

  return (
    <div
      className="mb-4 rounded-2xl border-2 shadow-sm overflow-hidden bg-white"
      style={{ borderColor: `${accent}40` }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right transition-colors"
        style={{ background: `linear-gradient(135deg, ${accent}18, ${accent}08)` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center text-xl shadow-sm"
            style={{ background: accent, color: 'white' }}
          >✏️</div>
          <div>
            <div className="font-black text-sm" style={{ color: accent }}>إدارة البيانات</div>
            <div className="text-[11px] text-slate-500">إضافة • تعديل • حذف • بحث — تُحفظ مباشرة في Google Sheets</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black bg-white px-2.5 py-1 rounded-full border shadow-sm" style={{ color: accent }}>
            {filtered.length} سجل
          </span>
          <span className="text-lg transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </button>

      {open && (
        <div className="p-4 space-y-3 border-t" style={{ borderColor: `${accent}25` }}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {perms.add && (
              <button
                onClick={openAdd}
                disabled={isLoading || busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-black text-sm text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
                style={{ background: accent }}
              >
                <span className="text-lg leading-none">＋</span> إضافة سجل
              </button>
            )}

            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
              <input
                className="w-full pr-9 pl-3 py-2 rounded-lg border-2 border-slate-200 text-sm focus:outline-none focus:border-slate-400 transition-colors"
                placeholder="بحث في جميع الأعمدة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="px-3 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold hover:bg-slate-50 disabled:opacity-50"
              title="تحديث"
            >{isFetching ? '⏳' : '🔄'} تحديث</button>
          </div>

          {def.require_teacher_auth && teacherCol && (
            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              🔐 يتم عرض سجلات التدريسي <strong>«{teacherName}»</strong> فقط (مطابقة العمود {teacherCol}).
            </div>
          )}

          {/* Table */}
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white" style={{ maxHeight: 420 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10" style={{ background: `${accent}10` }}>
                <tr>
                  {cols.map((c) => (
                    <th key={c.letter} className="px-3 py-2.5 text-right font-black border-b-2 whitespace-nowrap" style={{ borderColor: `${accent}30`, color: accent }}>
                      {c.header}
                    </th>
                  ))}
                  <th className="px-2 py-2.5 border-b-2 sticky left-0 bg-inherit" style={{ width: 110, borderColor: `${accent}30` }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={cols.length + 1} className="text-center py-8 text-slate-500">⏳ جاري التحميل…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={cols.length + 1} className="text-center py-8 text-slate-400">
                    <div className="text-3xl mb-1">📭</div>
                    لا توجد سجلات تطابق البحث.
                  </td></tr>
                ) : filtered.map((row, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                    {cols.map((c) => (
                      <td key={c.letter} className="px-3 py-2 whitespace-pre-wrap align-top">{row.display[c.letter] || <span className="text-slate-300">—</span>}</td>
                    ))}
                    <td className="px-2 py-2">
                      <div className="flex gap-1 justify-end">
                        {perms.edit && (
                          <button
                            onClick={() => openEdit(row.snapshot)}
                            className="w-8 h-8 rounded-lg grid place-items-center text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                            title="تعديل"
                          >✏️</button>
                        )}
                        {perms.delete && (
                          <button
                            onClick={() => remove(row.snapshot)}
                            disabled={busy}
                            className="w-8 h-8 rounded-lg grid place-items-center text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-40"
                            title="حذف"
                          >🗑️</button>
                        )}
                        {!perms.edit && !perms.delete && (
                          <span className="text-[10px] text-slate-400">— عرض فقط —</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150"
          dir="rtl"
          onClick={() => !busy && setEditing(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <header
              className="px-5 py-4 flex items-center justify-between gap-3"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: 'white' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-white/20 grid place-items-center text-2xl">
                  {editing.mode === 'add' ? '➕' : '✏️'}
                </div>
                <div>
                  <h3 className="text-base font-black">{editing.mode === 'add' ? 'إضافة سجل جديد' : 'تعديل السجل'}</h3>
                  <p className="text-[11px] opacity-90">{def.title}</p>
                </div>
              </div>
              <button
                className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 text-xl transition-colors"
                onClick={() => !busy && setEditing(null)}
              >✕</button>
            </header>

            {/* Form */}
            <div className="px-5 py-4 overflow-auto flex-1 bg-slate-50/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cols.map((c) => {
                  const v = editing.values[c.letter] || '';
                  const onChange = (val: string) => setEditing({ ...editing, values: { ...editing.values, [c.letter]: val } });
                  const lockTeacher = def.require_teacher_auth && teacherCol === c.letter && !!teacherName;
                  const baseInput = "w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm bg-white focus:outline-none focus:border-slate-400 transition-colors";

                  if (c.type === 'readonly' || lockTeacher) {
                    return (
                      <div key={c.letter}>
                        <label className="block text-xs font-black mb-1.5 text-slate-700">
                          {c.header} <span className="text-[10px] text-slate-400 font-normal">(قراءة فقط)</span>
                        </label>
                        <input className={`${baseInput} bg-slate-100 text-slate-500`} value={v} disabled />
                      </div>
                    );
                  }

                  const datalistId = `dl-${def.id}-${c.letter}`;
                  return (
                    <div key={c.letter}>
                      <label className="block text-xs font-black mb-1.5 text-slate-700">
                        {c.header}
                        {c.type === 'select' && c.source === 'column' && (
                          <span className="text-[10px] text-slate-400 font-normal mr-1">(من قيم العمود)</span>
                        )}
                        {c.type === 'select' && c.allowCustom && (
                          <span className="text-[10px] text-emerald-600 font-bold mr-1">+ مخصّص</span>
                        )}
                      </label>

                      {c.type === 'select' ? (
                        c.allowCustom ? (
                          <>
                            <input
                              list={datalistId}
                              className={baseInput}
                              value={v}
                              onChange={(e) => onChange(e.target.value)}
                              placeholder="اختر من القائمة أو اكتب قيمة جديدة..."
                            />
                            <datalist id={datalistId}>
                              {c.options.map((o) => <option key={o} value={o} />)}
                            </datalist>
                          </>
                        ) : (
                          <select className={baseInput} value={v} onChange={(e) => onChange(e.target.value)}>
                            <option value="">— اختر —</option>
                            {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        )
                      ) : c.type === 'date' ? (
                        <input type="date" className={baseInput} value={v} onChange={(e) => onChange(e.target.value)} />
                      ) : c.type === 'number' ? (
                        <input type="number" className={baseInput} value={v} onChange={(e) => onChange(e.target.value)} />
                      ) : (
                        <textarea className={baseInput} rows={2} value={v} onChange={(e) => onChange(e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal footer */}
            <footer className="px-5 py-3 border-t bg-white flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">🔐 يتطلب الحفظ كلمة مرور لوحة التحكم</span>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold hover:bg-slate-50"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                >إلغاء</button>
                <button
                  className="px-5 py-2 rounded-lg text-sm font-black text-white shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                  style={{ background: accent }}
                  onClick={submit}
                  disabled={busy}
                >
                  {busy ? '⏳ جاري الحفظ...' : '💾 حفظ'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrudPanel;
