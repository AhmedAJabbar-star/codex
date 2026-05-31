import { useCallback, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { listCustomSystems, type CustomSystemDef } from '@/data/customSystemsRegistry';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';
import {
  parseColumnsRange, colLetterToIndex, colIndexToLetter,
  evaluateAll, applyDerivedColumns,
} from '@/lib/conditionEngine';

export function buildConfigFromDef(def: CustomSystemDef, sheet: SheetFetchResult): SystemConfig {
  const colIdxs = parseColumnsRange(def.columns_range);
  const visibleHeaders = colIdxs
    .map((i) => sheet.headers[i])
    .filter((h): h is string => !!h);

  // derived column names also act as table headers
  const derivedNames = (def.derived_columns || []).map((d) => d.name);
  const allHeaders = [...visibleHeaders, ...derivedNames];

  // Build filter list from comma-separated letters
  const filterLetters = (def.filter_columns || '').split(/[,\s]+/).filter(Boolean);
  const filters = filterLetters
    .map((letter) => {
      const i = colLetterToIndex(letter);
      if (i < 0 || !sheet.headers[i]) return null;
      const key = sheet.headers[i];
      return { label: key, key, control: 'select' as const };
    })
    .filter((f): f is { label: string; key: string; control: 'select' } => !!f);

  // Add a synthetic filter for each derived column
  (def.derived_columns || []).forEach((d) => {
    const options = Array.from(new Set(Object.values(d.from_columns).map(String)));
    filters.push({ label: d.name, key: d.name, control: 'select' as any, fixedOptions: options } as any);
  });

  // Apply conditions, then expand derived rows, and project onto visible headers
  const rows: Record<string, string>[] = [];
  sheet.rows.forEach((r) => {
    if (!evaluateAll(def.conditions || [], r, sheet.headers)) return;
    const projected: Record<string, string> = {};
    visibleHeaders.forEach((h) => { projected[h] = r[h] || ''; });
    const expanded = applyDerivedColumns(def.derived_columns || [], { ...r, ...projected }, sheet.headers);
    expanded.forEach((row) => {
      const out: Record<string, string> = {};
      allHeaders.forEach((h) => { out[h] = row[h] || ''; });
      rows.push(out);
    });
  });

  return {
    id: `custom_${def.id}`,
    title: def.title,
    appTitle: def.title,
    universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
    hint: def.hint || def.description || '',
    icon: def.icon || '📋',
    headers: allHeaders,
    filters,
    rows,
  };
}

const PUB_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';

function compactText(v: string, joiner = '\n') {
  return v.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map((p) => p.trim()).filter(Boolean).join(joiner).trim();
}
function compactHeader(v: string) {
  return v.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map((p) => p.trim()).filter(Boolean).join(' ').trim();
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let v = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { v += '"'; i += 1; } else q = false; } else v += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(v); v = ''; }
    else if (c === '\n') { row.push(v); rows.push(row); row = []; v = ''; }
    else if (c !== '\r') v += c;
  }
  if (v.length > 0 || row.length > 0) { row.push(v); rows.push(row); }
  return rows;
}
async function fetchSheetByGid(gid: string): Promise<SheetFetchResult> {
  const bust = Math.floor(Date.now() / 30000);
  const url = `${PUB_BASE}?gid=${gid}&single=true&output=csv&_=${bust}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`تعذر جلب الورقة (HTTP ${res.status})`);
  const text = (await res.text()).replace(/^\uFEFF/, '');
  const [head = [], ...data] = parseCsv(text);
  const headers = head.map(compactHeader);
  const rows = data
    .filter((cells) => cells.some((c) => compactText(c).length > 0))
    .map((cells) => {
      const r: Record<string, string> = {};
      headers.forEach((h, i) => { r[h] = compactText(cells[i] ?? ''); });
      return r;
    });
  return { headers, rows };
}

const GenericSystem = () => {
  const { id = '' } = useParams<{ id: string }>();

  const { data: systems, isLoading: loadingSystems } = useQuery({
    queryKey: ['custom-systems-list'],
    queryFn: () => listCustomSystems(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const def = useMemo(() => (systems || []).find((s) => s.id === id), [systems, id]);

  const build = useCallback(
    (sheet: SheetFetchResult) => buildConfigFromDef(def!, sheet),
    [def],
  );

  if (loadingSystems) return <LiveLoadingShell />;
  if (!def) return <Navigate to="/" replace />;
  if (!def.sheet_gid) return <LiveLoadingShell error={new Error('لم يتم تحديد GID للورقة المصدر')} />;

  return <SupervisionBasePage queryKey={`custom-${def.id}`} gid={def.sheet_gid} build={build} />;
};

export default GenericSystem;
