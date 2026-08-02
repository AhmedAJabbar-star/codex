import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { sheetWrite, type CrudContext } from '@/data/customSystemsRegistry';
import { uiConfirm } from '@/lib/ui-dialog';

interface Props {
  crudCtx: CrudContext;
  /** Returns the admin password (may prompt). Null = cancelled. */
  getPassword: () => Promise<string | null>;
  onClose: () => void;
  onDone: () => void;
}

const norm = (s: string) =>
  (s || '').toString().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim().toLowerCase();

/** 📤 Bulk import of records from an Excel / CSV file into the system's Google Sheet. */
export default function ExcelImportPanel({ crudCtx, getPassword, onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({}); // system column letter -> file column index
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const def = crudCtx.def as any;
  const dedupeCols: string[] = def.dedupe_columns || [];
  const dedupeOn = !!def.dedupe_enabled && dedupeCols.length > 0;
  const sep: string = def.dedupe_separator || '|';

  const editableCols = useMemo(
    () => crudCtx.cols.filter((c) => c.type !== 'readonly'),
    [crudCtx.cols],
  );

  const readFile = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: '' }) as any[][];
      const clean = matrix.map((r) => (r || []).map((c) => String(c ?? '').trim()));
      const firstIdx = clean.findIndex((r) => r.some((c) => c !== ''));
      if (firstIdx < 0) { toast.error('الملف فارغ'); return; }
      const hdr = clean[firstIdx];
      const body = clean.slice(firstIdx + 1).filter((r) => r.some((c) => c !== ''));
      setFileName(file.name);
      setHeaders(hdr);
      setRows(body);
      // Auto-match by header text
      const auto: Record<string, number> = {};
      editableCols.forEach((c) => {
        const i = hdr.findIndex((h) => norm(h) === norm(c.header));
        if (i >= 0) auto[c.letter] = i;
      });
      setMap(auto);
      toast.success(`تم قراءة ${body.length.toLocaleString('en-US')} صفاً من الملف`);
    } catch (e) {
      toast.error('تعذّر قراءة الملف: ' + (e as Error).message);
    }
  }, [editableCols]);

  const mappedCount = Object.values(map).filter((v) => v >= 0).length;

  const buildRows = useCallback((): Record<string, string>[] => {
    return rows.map((r) => {
      const o: Record<string, string> = {};
      Object.entries(map).forEach(([letter, idx]) => {
        if (idx >= 0) o[letter] = String(r[idx] ?? '').trim();
      });
      if (crudCtx.teacherCol && crudCtx.teacherName) o[crudCtx.teacherCol] = crudCtx.teacherName;
      return o;
    }).filter((o) => Object.values(o).some((v) => v !== ''));
  }, [rows, map, crudCtx]);

  const doImport = useCallback(async () => {
    if (mappedCount === 0) { toast.error('اربط عموداً واحداً على الأقل'); return; }
    const payloadRows = buildRows();
    if (payloadRows.length === 0) { toast.error('لا توجد صفوف صالحة'); return; }
    if (dedupeOn) {
      const missing = dedupeCols.filter((L) => map[L] === undefined || map[L] < 0);
      if (missing.length > 0) {
        toast.error(`منع التكرار مفعّل — يجب ربط أعمدة المفتاح: ${missing.join('، ')}`);
        return;
      }
    }
    const proceed = await uiConfirm({
      title: 'تأكيد الاستيراد',
      message: `سيتم إضافة ${payloadRows.length.toLocaleString('en-US')} سجلاً إلى الورقة المصدر.`,
      icon: '📤',
      confirmText: 'ابدأ الاستيراد',
    });
    if (!proceed) return;
    const password = await getPassword();
    if (!password) return;
    setBusy(true); setProgress(0);
    try {
      const CHUNK = 1000;
      let inserted = 0, skippedExisting = 0, skippedInFile = 0;
      for (let i = 0; i < payloadRows.length; i += CHUNK) {
        const slice = payloadRows.slice(i, i + CHUNK);
        const res = await sheetWrite({
          op: 'bulk_append',
          gid: crudCtx.def.sheet_gid,
          sheet_url: crudCtx.externalUrl,
          rows: slice,
          password,
        });
        inserted += res.inserted ?? slice.length;
        skippedExisting += res.skipped_existing ?? 0;
        skippedInFile += res.skipped_in_file ?? 0;
        setProgress(Math.min(100, Math.round(((i + slice.length) / payloadRows.length) * 100)));
      }
      const skipped = skippedExisting + skippedInFile;
      toast.success(
        `✅ تمت إضافة ${inserted.toLocaleString('en-US')} سجلاً` +
        (skipped > 0 ? ` — وتم تجاهل ${skipped.toLocaleString('en-US')} سجلاً مكرراً` : ''),
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message || 'فشل الاستيراد');
    } finally { setBusy(false); setProgress(0); }
  }, [buildRows, mappedCount, dedupeOn, dedupeCols, map, getPassword, crudCtx, onDone, onClose]);

  return (
    <div className="mx-3 mb-3 rounded-2xl border-2 shadow-sm bg-white overflow-hidden" style={{ borderColor: '#4f46e540' }} dir="rtl">
      <header className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: 'linear-gradient(135deg, #4f46e5, #4338ca)', color: 'white' }}>
        <div className="flex items-center gap-2">
          <span className="text-xl">📤</span>
          <h3 className="text-sm font-black">استيراد سجلات من ملف Excel / CSV</h3>
        </div>
        <button className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-lg" onClick={() => !busy && onClose()} aria-label="إغلاق">✕</button>
      </header>

      <div className="p-4 bg-slate-50/50 space-y-4">
        {/* Step 1 — file */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }}
          />
          <button
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-60"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >📁 اختر ملف (.xlsx / .xls / .csv)</button>
          {fileName && (
            <span className="text-xs font-bold text-slate-700">
              {fileName} — <strong>{rows.length.toLocaleString('en-US')}</strong> صف، {headers.length} عمود
            </span>
          )}
        </div>

        {dedupeOn && (
          <div className="text-[12px] bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-rose-800 font-bold">
            🚫 منع التكرار مفعّل — المفتاح الفريد: {dedupeCols.join(` ${sep} `)} — أي صف مطابق لسجل موجود (أو مكرر داخل الملف) سيُتجاهل تلقائياً.
          </div>
        )}

        {/* Step 2 — mapping */}
        {headers.length > 0 && (
          <>
            <div>
              <h4 className="text-xs font-black mb-2 text-slate-700">🔗 ربط أعمدة الملف بأعمدة النظام ({mappedCount}/{editableCols.length})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {editableCols.map((c) => {
                  const isKey = dedupeCols.includes(c.letter);
                  return (
                    <div key={c.letter} className={`p-2 rounded-lg border-2 bg-white ${isKey ? 'border-rose-300' : 'border-slate-200'}`}>
                      <label className="block text-[11px] font-black mb-1 text-slate-700 truncate">
                        {isKey && '🔑 '}{c.header} <span className="text-slate-400">({c.letter})</span>
                      </label>
                      <select
                        className="w-full px-2 py-1.5 rounded-lg border-2 border-slate-200 text-xs bg-white"
                        value={map[c.letter] ?? -1}
                        onChange={(e) => setMap({ ...map, [c.letter]: Number(e.target.value) })}
                      >
                        <option value={-1}>— تجاهل —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `عمود ${i + 1}`}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 3 — preview */}
            <div className="overflow-auto border rounded-lg bg-white max-h-64">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>{editableCols.filter((c) => (map[c.letter] ?? -1) >= 0).map((c) => (
                    <th key={c.letter} className="px-2 py-1.5 font-black whitespace-nowrap">{c.header}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {editableCols.filter((c) => (map[c.letter] ?? -1) >= 0).map((c) => (
                        <td key={c.letter} className="px-2 py-1 whitespace-nowrap">{r[map[c.letter]] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && <div className="text-[11px] text-slate-500 p-2">… معاينة أول 10 صفوف من {rows.length.toLocaleString('en-US')}</div>}
            </div>

            {busy && (
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-60"
                onClick={doImport}
                disabled={busy}
              >{busy ? `⏳ جارٍ الاستيراد… ${progress}%` : `✅ استيراد ${rows.length.toLocaleString('en-US')} سجلاً`}</button>
              <button className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-sm font-bold" onClick={onClose} disabled={busy}>إلغاء</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
