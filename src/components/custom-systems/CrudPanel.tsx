import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CustomSystemDef } from '@/data/customSystemsRegistry';
import { sheetWrite } from '@/data/customSystemsRegistry';
import { fetchSheetByGid } from '@/data/supervisionData';
import { parseColumnsRange, colIndexToLetter, colLetterToIndex } from '@/lib/conditionEngine';
import { getSession } from '@/lib/teacherAuth';

interface Props {
  def: CustomSystemDef;
}

type ColType = 'text' | 'number' | 'date' | 'select' | 'readonly';

interface ColMeta { letter: string; header: string; type: ColType; options: string[] }

const CrudPanel = ({ def }: Props) => {
  const qc = useQueryClient();
  const externalUrl = def.sheet_source === 'external' ? def.sheet_url : undefined;
  const session = getSession();
  const teacherCol = (def.teacher_column || '').toUpperCase();
  const teacherName = session?.user?.full_name || '';

  const { data: sheet, isLoading, refetch } = useQuery({
    queryKey: ['custom-crud', def.id, def.sheet_gid, externalUrl || ''],
    queryFn: () => fetchSheetByGid(def.sheet_gid, externalUrl),
    staleTime: 0,
  });

  const cols: ColMeta[] = useMemo(() => {
    if (!sheet) return [];
    const idxs = parseColumnsRange(def.columns_range);
    const types = def.column_types || {};
    const opts = def.column_options || {};
    return idxs.map((i) => {
      const letter = colIndexToLetter(i);
      const header = sheet.headers[i] || letter;
      const labelOverride = (def.header_labels || {})[letter];
      return {
        letter,
        header: labelOverride || header,
        type: (types[letter] as ColType) || 'text',
        options: (opts[letter] || '').split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean),
      };
    });
  }, [sheet, def]);

  // Build editable rows (filter by teacher if required)
  const rows = useMemo(() => {
    if (!sheet) return [] as Array<{ raw: Record<string, string>; snapshot: Record<string, string>; display: Record<string, string> }>;
    const out: Array<{ raw: Record<string, string>; snapshot: Record<string, string>; display: Record<string, string> }> = [];
    sheet.rows.forEach((r) => {
      // Teacher filter for non-admin views
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

  const openAdd = () => {
    const init: Record<string, string> = {};
    cols.forEach((c) => { init[c.letter] = ''; });
    // Pre-fill teacher column when teacher is logged in
    if (def.require_teacher_auth && teacherCol && teacherName) init[teacherCol] = teacherName;
    setEditing({ mode: 'add', values: init });
  };

  const openEdit = (snapshot: Record<string, string>) => {
    setEditing({ mode: 'edit', values: { ...snapshot }, snapshot });
  };

  const askPassword = () => window.prompt('أدخل كلمة مرور لوحة التحكم لتأكيد العملية:') || '';

  const submit = async () => {
    if (!editing) return;
    const password = askPassword();
    if (!password) return;
    setBusy(true);
    try {
      // Strip readonly columns from values sent
      const payloadValues: Record<string, string> = {};
      cols.forEach((c) => {
        if (c.type !== 'readonly') payloadValues[c.letter] = editing.values[c.letter] || '';
      });
      if (editing.mode === 'add') {
        await sheetWrite({ op: 'append', gid: def.sheet_gid, sheet_url: externalUrl, values: payloadValues, password });
        toast.success('تمت إضافة السجل');
      } else {
        await sheetWrite({
          op: 'update', gid: def.sheet_gid, sheet_url: externalUrl,
          values: payloadValues, match: editing.snapshot, password,
        });
        toast.success('تم تحديث السجل');
      }
      setEditing(null);
      await refetch();
      qc.invalidateQueries({ queryKey: [`custom-${def.id}`] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const remove = async (snapshot: Record<string, string>) => {
    if (!confirm('حذف هذا السجل من ورقة Google Sheets نهائياً؟')) return;
    const password = askPassword();
    if (!password) return;
    setBusy(true);
    try {
      await sheetWrite({ op: 'delete', gid: def.sheet_gid, sheet_url: externalUrl, match: snapshot, password });
      toast.success('تم حذف السجل');
      await refetch();
      qc.invalidateQueries({ queryKey: [`custom-${def.id}`] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  if (!def.crud_enabled) return null;

  return (
    <details className="schedule-card mb-3" style={{ padding: 16 }}>
      <summary className="cursor-pointer font-black text-sm flex items-center justify-between gap-3">
        <span>✏️ إدارة البيانات ({filtered.length})</span>
        <span className="text-xs font-normal text-slate-500">إضافة/تعديل/حذف على ورقة Google Sheets</span>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="schedule-btn schedule-btn-primary" onClick={openAdd} disabled={isLoading || busy} style={{ minHeight: 38 }}>
          ➕ إضافة سجل
        </button>
        <input
          className="schedule-select flex-1"
          placeholder="🔍 بحث سريع..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 200, minHeight: 38 }}
        />
        <button className="schedule-btn" onClick={() => refetch()} disabled={isLoading} style={{ minHeight: 38 }}>🔄 تحديث</button>
      </div>

      {def.require_teacher_auth && teacherCol && (
        <div className="text-[11px] text-slate-500 mt-2">
          🔐 يتم عرض سجلات التدريسي «{teacherName}» فقط (مطابقة العمود {teacherCol}).
        </div>
      )}

      <div className="mt-3 overflow-auto border rounded-lg bg-white" style={{ maxHeight: 360 }}>
        <table className="w-full text-xs">
          <thead className="bg-slate-100 sticky top-0">
            <tr>
              {cols.map((c) => <th key={c.letter} className="px-2 py-2 text-right font-black border-b">{c.header}</th>)}
              <th className="px-2 py-2 border-b" style={{ width: 100 }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={cols.length + 1} className="text-center py-4 text-slate-500">⏳ جاري التحميل…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={cols.length + 1} className="text-center py-4 text-slate-400">لا توجد سجلات.</td></tr>
            ) : filtered.map((row, i) => (
              <tr key={i} className="border-b hover:bg-slate-50">
                {cols.map((c) => (
                  <td key={c.letter} className="px-2 py-1.5 whitespace-pre-wrap">{row.display[c.letter]}</td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex gap-1 justify-end">
                    <button className="text-blue-600 font-black text-base" title="تعديل" onClick={() => openEdit(row.snapshot)}>✏️</button>
                    <button className="text-red-600 font-black text-base" title="حذف" onClick={() => remove(row.snapshot)} disabled={busy}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3" dir="rtl" onClick={() => !busy && setEditing(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black">{editing.mode === 'add' ? '➕ إضافة سجل' : '✏️ تعديل سجل'}</h3>
              <button className="text-2xl text-slate-500" onClick={() => !busy && setEditing(null)}>✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cols.map((c) => {
                const v = editing.values[c.letter] || '';
                const onChange = (val: string) => setEditing({ ...editing, values: { ...editing.values, [c.letter]: val } });
                const lockTeacher = def.require_teacher_auth && teacherCol === c.letter && !!teacherName;
                if (c.type === 'readonly' || lockTeacher) {
                  return (
                    <div key={c.letter}>
                      <label className="block text-xs font-black mb-1">{c.header} <span className="text-[10px] text-slate-400">(قراءة فقط)</span></label>
                      <input className="schedule-select w-full bg-slate-100" value={v} disabled />
                    </div>
                  );
                }
                return (
                  <div key={c.letter}>
                    <label className="block text-xs font-black mb-1">{c.header}</label>
                    {c.type === 'select' ? (
                      <select className="schedule-select w-full" value={v} onChange={(e) => onChange(e.target.value)}>
                        <option value="">— اختر —</option>
                        {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : c.type === 'date' ? (
                      <input type="date" className="schedule-select w-full" value={v} onChange={(e) => onChange(e.target.value)} />
                    ) : c.type === 'number' ? (
                      <input type="number" className="schedule-select w-full" value={v} onChange={(e) => onChange(e.target.value)} />
                    ) : (
                      <textarea className="schedule-select w-full" rows={2} value={v} onChange={(e) => onChange(e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button className="schedule-btn" onClick={() => setEditing(null)} disabled={busy}>إلغاء</button>
              <button className="schedule-btn schedule-btn-primary" onClick={submit} disabled={busy}>
                {busy ? '⏳ جاري الحفظ...' : '💾 حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </details>
  );
};

export default CrudPanel;
