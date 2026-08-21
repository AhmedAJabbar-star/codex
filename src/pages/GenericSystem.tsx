import { useCallback, useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import TeacherSessionBar from '@/components/shared/TeacherSessionBar';
import { listCustomSystems, isCrudActive, type CustomSystemDef, type CrudColMeta, type CrudContext } from '@/data/customSystemsRegistry';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig, QuickFilterDef } from '@/data/scheduleData';
import { getSession } from '@/lib/teacherAuth';
import { getEffectivePerms } from '@/lib/permissions';
import { applyUiTheme, getUiTheme, type UiTheme } from '@/lib/uiTheme';
import {
  parseColumnsRange, colLetterToIndex, colIndexToLetter,
  evaluateAll, evaluateCondition, applyDerivedColumns,
  computeColumnValue, applyGroupStage, applyConflictDetection,
} from '@/lib/conditionEngine';

const CRUD_SNAPSHOT_KEY = '__crud_snapshot__';
const ROW_COLOR_KEY = '__row_color__';


export function buildConfigFromDef(
  def: CustomSystemDef,
  sheet: SheetFetchResult,
  user?: { role?: string; permissions?: any } | null,
  allSystems?: CustomSystemDef[],
): SystemConfig {

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

  // Per-column link buttons: map display header -> button label
  const linkLabelsByLetter = def.column_link_labels || {};
  const linkColumns: Record<string, string> = {};
  colIdxs.forEach((i) => {
    const letter = colIndexToLetter(i);
    const lbl = (linkLabelsByLetter[letter] || linkLabelsByLetter[letter.toLowerCase()] || '').trim();
    if (!lbl) return;
    const real = sheet.headers[i];
    if (!real) return;
    const visibleIdx = sourceHeaders.indexOf(real);
    if (visibleIdx < 0) return;
    linkColumns[displayHeaders[visibleIdx]] = lbl;
  });

  const derivedNames = (def.derived_columns || []).map((d) => d.name);
  const computedNames = (def.computed_columns || []).map((c) => c?.name).filter(Boolean) as string[];
  const groupAggNames = ((def.group_stage?.aggs) || []).map((a) => a.name).filter(Boolean);
  const flagColName = def.conflict_detector ? (def.conflict_detector.flag_column || '⚠️ تعارض') : '';
  const allHeaders = Array.from(new Set([
    ...displayHeaders, ...derivedNames, ...computedNames, ...groupAggNames,
    ...(flagColName ? [flagColName] : []),
  ]));

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

  // Identity row-filter (name / department / college) — only when require_teacher_auth is on.
  const session = getSession();
  const identity = {
    name: (session?.user?.full_name || '').trim(),
    department: (session?.user?.department || '').trim(),
    college: ((session?.user as any)?.college || '').trim(),
  };
  let teacherFilter: ((r: Record<string, string>) => boolean) | null = null;
  if (def.require_teacher_auth) {
    try {
      const keyOf = (letter?: string) => {
        const i = letter ? colLetterToIndex(letter) : -1;
        return i >= 0 ? (sheet.headers[i] || '') : '';
      };
      const nameKey = keyOf(def.teacher_column);
      const deptKey = keyOf(def.teacher_department_column);
      const collKey = keyOf(def.teacher_college_column);
      const eq = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
      const matchers: Record<string, ((r: Record<string, string>) => boolean) | null> = {
        name:       identity.name && nameKey ? (r) => eq(r[nameKey] || '', identity.name) : null,
        department: identity.department && deptKey ? (r) => eq(r[deptKey] || '', identity.department) : null,
        college:    identity.college && collKey ? (r) => eq(r[collKey] || '', identity.college) : null,
      };
      // New granular criteria take precedence; otherwise fall back to the legacy scope.
      let criteria = (def.teacher_scope_criteria || []).filter(Boolean) as string[];
      if (criteria.length === 0) {
        const scope = def.teacher_filter_scope || 'name';
        if (scope === 'name') criteria = ['name'];
        else if (scope === 'department') criteria = ['department'];
        else if (scope === 'name_or_department') criteria = ['name', 'department'];
        else criteria = []; // 'all'
      }
      const active = criteria.map((c) => matchers[c]).filter(Boolean) as ((r: Record<string, string>) => boolean)[];
      if (active.length > 0) {
        const logicAll = (def.teacher_scope_logic || 'any') === 'all';
        teacherFilter = (r) => (logicAll ? active.every((f) => f(r)) : active.some((f) => f(r)));
      }
    } catch { /* ignore */ }
  }

  // Pre-compute synthetic keys for quick-filter buttons.
  const quickFilterDefs: QuickFilterDef[] = (def.quick_filters || []).map((qf, idx) => ({
    key: `__qf_${idx}`,
    label: qf.label,
    icon: qf.icon,
    color: qf.color,
  }));

  // ⚙️ Raw-stage v2: conflict detection → computed columns → group stage (all on raw rows by Excel letter)
  let workingRows = sheet.rows.filter((r) => passes(r) && (!teacherFilter || teacherFilter(r)));
  if (def.conflict_detector && (def.conflict_detector.group_by || []).length > 0) {
    workingRows = applyConflictDetection(def.conflict_detector, workingRows, sheet.headers);
  }
  (def.computed_columns || []).forEach((cc) => {
    if (!cc?.name || cc.type === 'row_number') return;
    workingRows = workingRows.map((r) => ({ ...r, [cc.name]: computeColumnValue(cc, r, sheet.headers) }));
  });
  if (def.group_stage && (def.group_stage.keys || []).length > 0) {
    workingRows = applyGroupStage(def.group_stage, workingRows, sheet.headers);
  }
  // Row-number columns are assigned last (after every filter/group stage).
  const rowNumCols = (def.computed_columns || []).filter((c) => c?.name && c.type === 'row_number');
  if (rowNumCols.length > 0) {
    workingRows = workingRows.map((r, i) => {
      const nr = { ...r };
      rowNumCols.forEach((c) => { nr[c.name] = String(i + 1); });
      return nr;
    });
  }

  const rows: Record<string, string>[] = [];
  workingRows.forEach((r) => {
    const expanded = applyDerivedColumns(def.derived_columns || [], r, sheet.headers);
    expanded.forEach((row) => {
      const out: Record<string, string> = {};
      sourceHeaders.forEach((real, idx) => { out[displayHeaders[idx]] = row[real] || ''; });
      derivedNames.forEach((dn) => { out[dn] = row[dn] || ''; });
      computedNames.forEach((cn) => { out[cn] = row[cn] || ''; });
      groupAggNames.forEach((gn) => { out[gn] = row[gn] || ''; });
      if (flagColName) out[flagColName] = row[flagColName] || '';
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
      // Raw-sheet snapshot for CRUD (only the columns in columns_range).
      const snap: Record<string, string> = {};
      colIdxs.forEach((i) => {
        const letter = colIndexToLetter(i);
        const hk = sheet.headers[i];
        snap[letter] = (hk ? r[hk] : '') || '';
      });
      out[CRUD_SNAPSHOT_KEY] = JSON.stringify(snap);
      // Row-highlighting rules: first matching wins.
      const rr = def.row_rules || [];
      for (const rule of rr) {
        const conds = rule.conditions || [];
        if (conds.length === 0) continue;
        const ok = (rule.logic || 'AND') === 'OR'
          ? conds.some((c) => evaluateCondition(c, r, sheet.headers))
          : evaluateAll(conds, r, sheet.headers);
        if (ok) { out[ROW_COLOR_KEY] = rule.color || ''; break; }
      }
      rows.push(out);
    });
  });

  // Build CRUD context (cols meta + perms) when the system enables CRUD and user can view.
  let crudContext: CrudContext | undefined;
  if (isCrudActive(def)) {
    const perms = getEffectivePerms(def, user as any);
    if (perms.view) {
      const types = def.column_types || {};
      const manualOpts = def.column_options || {};
      const srcMap = def.column_select_source || {};
      const allowMap = def.column_select_allow_custom || {};
      const cols: CrudColMeta[] = colIdxs.map((i) => {
        const letter = colIndexToLetter(i);
        const realHeader = sheet.headers[i] || letter;
        const labelOverride = (def.header_labels || {})[letter];
        const type = ((types[letter] as any) || 'text') as CrudColMeta['type'];
        const source = ((srcMap[letter] || 'manual') as 'manual' | 'column');
        let options: string[] = [];
        if (type === 'select') {
          if (source === 'column') {
            const set = new Set<string>();
            sheet.rows.forEach((r) => {
              const raw = (r[realHeader] || '').trim();
              if (!raw) return;
              raw.split(/\r?\n/).forEach((v) => { const t = v.trim(); if (t) set.add(t); });
            });
            options = Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
          } else {
            options = (manualOpts[letter] || '')
              .split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean);
          }
        }
        const perColFolder = (def.column_drive_folders || {})[letter];
        const driveFolder = type === 'file' ? (perColFolder || def.drive_folder_id || '') : undefined;
        return {
          letter,
          header: labelOverride || realHeader,
          type,
          options,
          allowCustom: !!allowMap[letter],
          source,
          driveFolder,
        };
      });
      const teacherName = (user as any)?.full_name || identity.name || '';

      // 🎯 Capacity counters for select options (computed on the FULL sheet, not the filtered view).
      const optionCounts: Record<string, Record<string, number>> = {};
      Object.keys(def.option_limits || {}).forEach((letter) => {
        const i = colLetterToIndex(letter);
        const hk = i >= 0 ? sheet.headers[i] : '';
        if (!hk) return;
        const counts: Record<string, number> = {};
        sheet.rows.forEach((r) => {
          const v = (r[hk] || '').trim();
          if (!v) return;
          counts[v] = (counts[v] || 0) + 1;
        });
        optionCounts[letter.toUpperCase()] = counts;
      });

      // 🔒 One response per user
      let myRecordsCount = 0;
      let myRecordSnapshot: Record<string, string> | null = null;
      if (def.single_response_enabled) {
        const letter = (def.single_response_column || def.teacher_column || '').toUpperCase();
        const i = letter ? colLetterToIndex(letter) : -1;
        const hk = i >= 0 ? sheet.headers[i] : '';
        const me = teacherName.replace(/\s+/g, ' ').trim();
        if (hk && me) {
          sheet.rows.forEach((r) => {
            if ((r[hk] || '').replace(/\s+/g, ' ').trim() !== me) return;
            myRecordsCount++;
            if (!myRecordSnapshot) {
              const snap: Record<string, string> = {};
              colIdxs.forEach((ci) => {
                const L = colIndexToLetter(ci);
                const k = sheet.headers[ci];
                snap[L] = (k ? r[k] : '') || '';
              });
              myRecordSnapshot = snap;
            }
          });
        }
      }

      // 🔗 Linked systems (resolved titles)
      const linked = (def.linked_systems || [])
        .map((ls) => {
          const target = (allSystems || []).find((s) => s.id === ls.target_id);
          if (!target || target.enabled === false) return null;
          return {
            id: target.id,
            title: target.title,
            icon: target.icon,
            label: (ls.label || '').trim() || `الانتقال إلى ${target.title}`,
            map: ls.map || {},
          };
        })
        .filter(Boolean) as NonNullable<CrudContext['linked']>;

      // Values handed over from a previous system.
      let prefill: Record<string, string> | undefined;
      try {
        const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(`crud-prefill-${def.id}`) : null;
        if (raw) prefill = JSON.parse(raw);
      } catch { /* ignore */ }

      crudContext = {
        def,
        externalUrl: def.sheet_source === 'external' ? def.sheet_url : undefined,
        cols,
        perms,
        teacherCol: def.require_teacher_auth ? (def.teacher_column || '').toUpperCase() : undefined,
        teacherName: def.require_teacher_auth ? teacherName : undefined,
        snapshotKey: CRUD_SNAPSHOT_KEY,
        refetchQueryKeys: [[`custom-${def.id}`]],
        identity,
        optionCounts,
        myRecordsCount,
        myRecordSnapshot,
        linked,
        prefill,
        auditLetters: def.audit_enabled
          ? [def.audit_created_by_column, def.audit_created_at_column, def.audit_updated_by_column, def.audit_updated_at_column]
              .map((x) => (x || '').toUpperCase()).filter(Boolean)
          : [],
      };
    }
  }

  // Translate aggregations from Excel letters to display headers.
  const aggregations = (def.aggregations || [])
    .map((a) => {
      const i = colLetterToIndex(a.column);
      const real = i >= 0 ? sheet.headers[i] : '';
      const vIdx = real ? sourceHeaders.indexOf(real) : -1;
      const header = vIdx >= 0 ? displayHeaders[vIdx] : '';
      return header ? { header, op: a.op, label: a.label } : null;
    })
    .filter(Boolean) as { header: string; op: any; label?: string }[];

  const hasRowColors = (def.row_rules || []).length > 0;

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
    linkColumns: Object.keys(linkColumns).length > 0 ? linkColumns : undefined,
    crudContext,
    rowColorKey: hasRowColors ? ROW_COLOR_KEY : undefined,
    aggregations: aggregations.length > 0 ? aggregations : undefined,
    globalSearch: !!def.global_search,
  };
}


const GenericSystem = () => {
  const { id = '' } = useParams<{ id: string }>();

  const { data: systems, isLoading: loadingSystems } = useQuery({
    queryKey: ['custom-systems-list'],
    queryFn: () => listCustomSystems(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const def = useMemo(() => (systems || []).find((s) => s.id === id), [systems, id]);

  const session = getSession();

  const build = useCallback(
    (sheet: SheetFetchResult) => buildConfigFromDef(def!, sheet, session?.user as any, systems || []),
    [def, session?.user, systems],
  );

  // Apply per-system UI theme override on mount; restore global theme on unmount / def change.
  // NOTE: must be declared BEFORE any conditional early return to preserve hook order.
  const themeOverride = (def?.ui_theme || '').trim();
  useEffect(() => {
    if (!themeOverride) return;
    applyUiTheme(themeOverride as UiTheme);
    // Also mark <body> so per-system CSS scoped to this attribute can react.
    document.body.setAttribute('data-system-theme', themeOverride);
    return () => {
      applyUiTheme(getUiTheme());
      document.body.removeAttribute('data-system-theme');
    };
  }, [themeOverride]);

  if (loadingSystems) return <LiveLoadingShell />;
  if (!def) return <Navigate to="/" replace />;
  if (!def.sheet_gid) return <LiveLoadingShell error={new Error('لم يتم تحديد GID للورقة المصدر')} />;

  const externalUrl = def.sheet_source === 'external' ? def.sheet_url : undefined;
  const showSessionBar = !!(def.require_teacher_auth && session?.user);

  return (
    <div>
      {showSessionBar && <TeacherSessionBar user={session!.user} />}
      <SupervisionBasePage queryKey={`custom-${def.id}`} gid={def.sheet_gid} externalUrl={externalUrl} build={build} />
    </div>
  );
};


export default GenericSystem;
