import { useCallback, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import CrudPanel from '@/components/custom-systems/CrudPanel';
import TeacherSessionBar from '@/components/shared/TeacherSessionBar';
import { listCustomSystems, isCrudActive, type CustomSystemDef } from '@/data/customSystemsRegistry';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig, QuickFilterDef } from '@/data/scheduleData';
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
  /** key (in built filter) -> letter (Excel column) — needed to translate `required_filters` letters into row keys. */
  const filterKeyByLetter: Record<string, string> = {};
  const configList = (def.filters_config && def.filters_config.length > 0)
    ? def.filters_config
    : (def.filter_columns || '').split(/[,\s]+/).filter(Boolean).map((c) => ({ column: c } as any));
  const requiredFilterKeys: string[] = [];
  configList.forEach((fc: any, fIdx: number) => {
    const i = colLetterToIndex(fc.column);
    if (i < 0 || !sheet.headers[i]) return;
    const realKey = sheet.headers[i];
    const letter = (fc.column || '').toUpperCase();
    const displayLabel = (fc.label && String(fc.label).trim()) || labelMap[letter] || realKey;
    const visibleIdx = sourceHeaders.indexOf(realKey);
    const outKey = visibleIdx >= 0 ? displayHeaders[visibleIdx] : realKey;
    let registeredKey = outKey;

    if (Array.isArray(fc.rules) && fc.rules.length > 0) {
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
      registeredKey = synthKey;
    } else {
      builtFilters.push({
        label: displayLabel,
        key: outKey,
        control: (fc.control || 'select') as any,
        searchPlaceholder: fc.search_placeholder,
      } as any);
    }
    filterKeyByLetter[letter] = registeredKey;
    if (fc.required) requiredFilterKeys.push(registeredKey);
  });

  // Legacy `required_filters` list (Excel letters) for any filter that hasn't been flagged inline.
  ((def as any).required_filters as string[] | undefined)?.forEach?.((rawLetter) => {
    const L = (rawLetter || '').toUpperCase().trim();
    if (!L) return;
    const k = filterKeyByLetter[L];
    if (k && !requiredFilterKeys.includes(k)) requiredFilterKeys.push(k);
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

  // Teacher row-filter (name / department / both) — only when require_teacher_auth is on.
  let teacherFilter: ((r: Record<string, string>) => boolean) | null = null;
  if (def.require_teacher_auth) {
    try {
      const session = getSession();
      const name = (session?.user?.full_name || '').trim();
      const dept = (session?.user?.department || '').trim();
      const scope = def.teacher_filter_scope || 'name';
      const ni = def.teacher_column ? colLetterToIndex(def.teacher_column) : -1;
      const di = def.teacher_department_column ? colLetterToIndex(def.teacher_department_column) : -1;
      const nameKey = ni >= 0 ? sheet.headers[ni] : '';
      const deptKey = di >= 0 ? sheet.headers[di] : '';
      const matchName = (r: Record<string, string>) => !!name && !!nameKey && (r[nameKey] || '').trim() === name;
      const matchDept = (r: Record<string, string>) => !!dept && !!deptKey && (r[deptKey] || '').trim() === dept;
      if (scope === 'name' && nameKey && name) teacherFilter = matchName;
      else if (scope === 'department' && deptKey && dept) teacherFilter = matchDept;
      else if (scope === 'name_or_department' && (nameKey || deptKey)) teacherFilter = (r) => matchName(r) || matchDept(r);
      // scope === 'all' → no filter
    } catch { /* ignore */ }
  }

  // Pre-compute synthetic keys for quick-filter buttons.
  const quickFilterDefs: QuickFilterDef[] = (def.quick_filters || []).map((qf, idx) => ({
    key: `__qf_${idx}`,
    label: qf.label,
    icon: qf.icon,
    color: qf.color,
  }));

  const rows: Record<string, string>[] = [];
  sheet.rows.forEach((r) => {
    if (!passes(r)) return;
    if (teacherFilter && !teacherFilter(r)) return;
    const expanded = applyDerivedColumns(def.derived_columns || [], r, sheet.headers);
    expanded.forEach((row) => {
      const out: Record<string, string> = {};
      sourceHeaders.forEach((real, idx) => { out[displayHeaders[idx]] = row[real] || ''; });
      derivedNames.forEach((dn) => { out[dn] = row[dn] || ''; });
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
      // Quick-filter synthetic flags (raw sheet row evaluated by Excel letter).
      (def.quick_filters || []).forEach((qf, idx) => {
        const ok = evaluateCondition(
          { column: qf.column, op: qf.op, value: qf.value, values: qf.values } as any,
          r,
          sheet.headers,
        );
        out[`__qf_${idx}`] = ok ? '1' : '';
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
    printPrefs: def.print_prefs && Object.keys(def.print_prefs).length > 0 ? def.print_prefs : undefined,
    requiredFilters: requiredFilterKeys.length > 0 ? requiredFilterKeys : undefined,
    quickFilters: quickFilterDefs.length > 0 ? quickFilterDefs : undefined,
  };
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

  const session = getSession();

  if (loadingSystems) return <LiveLoadingShell />;
  if (!def) return <Navigate to="/" replace />;
  if (!def.sheet_gid) return <LiveLoadingShell error={new Error('لم يتم تحديد GID للورقة المصدر')} />;

  const externalUrl = def.sheet_source === 'external' ? def.sheet_url : undefined;
  const crudOn = isCrudActive(def);
  const showSessionBar = !!(def.require_teacher_auth && session?.user);

  return (
    <div>
      {showSessionBar && <TeacherSessionBar user={session!.user} />}
      {crudOn && (
        <div className="px-4 pt-4" dir="rtl"><CrudPanel def={def} /></div>
      )}
      <SupervisionBasePage queryKey={`custom-${def.id}`} gid={def.sheet_gid} externalUrl={externalUrl} build={build} />
    </div>
  );
};

export default GenericSystem;
