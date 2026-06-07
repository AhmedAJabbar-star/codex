import { useCallback, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import CrudPanel from '@/components/custom-systems/CrudPanel';
import { listCustomSystems, type CustomSystemDef } from '@/data/customSystemsRegistry';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';
import { getSession } from '@/lib/teacherAuth';
import {
  parseColumnsRange, colLetterToIndex, colIndexToLetter,
  evaluateAll, evaluateCondition, applyDerivedColumns,
} from '@/lib/conditionEngine';

export function buildConfigFromDef(def: CustomSystemDef, sheet: SheetFetchResult): SystemConfig {
  const colIdxs = parseColumnsRange(def.columns_range);
  const labelMap = def.header_labels || {};

  // Source headers (real names in sheet) and display labels (renamed)
  const sourceHeaders: string[] = [];
  const displayHeaders: string[] = [];
  colIdxs.forEach((i) => {
    const real = sheet.headers[i];
    if (!real) return;
    sourceHeaders.push(real);
    const letter = colIndexToLetter(i);
    const override = (labelMap[letter] || labelMap[letter.toLowerCase()] || '').trim();
    displayHeaders.push(override || real);
  });

  const derivedNames = (def.derived_columns || []).map((d) => d.name);
  const allHeaders = [...displayHeaders, ...derivedNames];

  // Build filters: prefer filters_config when provided; fall back to filter_columns
  const builtFilters: SystemConfig['filters'] = [];
  type RuleFilter = {
    synthKey: string;
    column: string;
    rules: NonNullable<import('@/data/customSystemsRegistry').FilterConfigItem['rules']>;
    includeValues: boolean;
  };
  const ruleFilters: RuleFilter[] = [];
  const configList = (def.filters_config && def.filters_config.length > 0)
    ? def.filters_config
    : (def.filter_columns || '').split(/[,\s]+/).filter(Boolean).map((c) => ({ column: c } as any));
  configList.forEach((fc: any, fIdx: number) => {
    const i = colLetterToIndex(fc.column);
    if (i < 0 || !sheet.headers[i]) return;
    const realKey = sheet.headers[i];
    const letter = (fc.column || '').toUpperCase();
    const displayLabel = (fc.label && String(fc.label).trim()) || labelMap[letter] || realKey;
    const visibleIdx = sourceHeaders.indexOf(realKey);
    const outKey = visibleIdx >= 0 ? displayHeaders[visibleIdx] : realKey;

    if (Array.isArray(fc.rules) && fc.rules.length > 0) {
      // Rule-based filter. If include_values is set, mix in the column's individual values too.
      const synthKey = `__rule_${fIdx}_${letter}`;
      const includeValues = !!fc.include_values;
      ruleFilters.push({ synthKey, column: letter, rules: fc.rules, includeValues });
      const ruleLabels = fc.rules.map((r: any) => String(r.label || '')).filter(Boolean);
      let options = ruleLabels;
      if (includeValues) {
        const vals = new Set<string>();
        sheet.rows.forEach((r) => {
          const cell = r[realKey] || '';
          cell.split('\n').forEach((t) => { const v = t.trim(); if (v) vals.add(v); });
        });
        options = [...ruleLabels, ...Array.from(vals).sort()];
      }
      builtFilters.push({
        label: displayLabel,
        key: synthKey,
        control: (fc.control || 'select') as any,
        fixedOptions: options,
        matchMode: 'token',
        searchPlaceholder: fc.search_placeholder,
      } as any);
    } else {
      builtFilters.push({
        label: displayLabel,
        key: outKey,
        control: (fc.control || 'select') as any,
        searchPlaceholder: fc.search_placeholder,
      } as any);
    }
  });

  (def.derived_columns || []).forEach((d) => {
    const options = Array.from(new Set(Object.values(d.from_columns).map(String)));
    builtFilters.push({ label: d.name, key: d.name, control: 'select' as any, fixedOptions: options } as any);
  });

  // Apply conditions (AND or OR), expand derived rows, and project onto display headers
  const logic = def.conditions_logic || 'AND';
  const conds = def.conditions || [];
  const passes = (r: Record<string, string>) => {
    if (conds.length === 0) return true;
    return logic === 'OR'
      ? conds.some((c) => evaluateCondition(c, r, sheet.headers))
      : evaluateAll(conds, r, sheet.headers);
  };

  // Teacher row-filter: when require_teacher_auth + teacher_column are set, restrict to the logged-in teacher's rows.
  let teacherFilter: ((r: Record<string, string>) => boolean) | null = null;
  if (def.require_teacher_auth && def.teacher_column) {
    try {
      const session = getSession();
      const name = (session?.user?.full_name || '').trim();
      if (name) {
        const ti = colLetterToIndex(def.teacher_column);
        if (ti >= 0) {
          const realKey = sheet.headers[ti];
          teacherFilter = (r) => ((r[realKey] || '').trim() === name);
        }
      }
    } catch { /* ignore */ }
  }

  const rows: Record<string, string>[] = [];
  sheet.rows.forEach((r) => {
    if (!passes(r)) return;
    if (teacherFilter && !teacherFilter(r)) return;
    const expanded = applyDerivedColumns(def.derived_columns || [], r, sheet.headers);
    expanded.forEach((row) => {
      const out: Record<string, string> = {};
      sourceHeaders.forEach((real, idx) => { out[displayHeaders[idx]] = row[real] || ''; });
      derivedNames.forEach((dn) => { out[dn] = row[dn] || ''; });
      // Populate rule-filter synthetic keys (use raw sheet row + headers so evaluateCondition resolves by Excel letter)
      ruleFilters.forEach((rf) => {
        const tokens: string[] = [];
        rf.rules.forEach((rule) => {
          if (evaluateCondition({ column: rf.column, op: rule.op, value: rule.value, values: rule.values } as any, r, sheet.headers)) {
            tokens.push(String(rule.label || ''));
          }
        });
        if (rf.includeValues) {
          const cellIdx = colLetterToIndex(rf.column);
          const cell = (cellIdx >= 0 ? r[sheet.headers[cellIdx]] : '') || '';
          cell.split('\n').forEach((t) => { const v = t.trim(); if (v) tokens.push(v); });
        }
        out[rf.synthKey] = tokens.join('\n');
      });
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
    filters: builtFilters,
    rows,
    customSignatures: (def.signatures && def.signatures.length > 0) ? def.signatures : undefined,
  };
}

// Sheet fetching is centralized in `@/data/supervisionData`. This file no longer needs
// its own CSV fetcher — `SupervisionBasePage` calls `fetchSheetByGid(gid, externalUrl?)`.


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

  const externalUrl = def.sheet_source === 'external' ? def.sheet_url : undefined;
  if (def.crud_enabled) {
    return (
      <div>
        <div className="px-4 pt-4" dir="rtl"><CrudPanel def={def} /></div>
        <SupervisionBasePage queryKey={`custom-${def.id}`} gid={def.sheet_gid} externalUrl={externalUrl} build={build} />
      </div>
    );
  }
  return <SupervisionBasePage queryKey={`custom-${def.id}`} gid={def.sheet_gid} externalUrl={externalUrl} build={build} />;

};

export default GenericSystem;
