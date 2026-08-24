// Condition evaluator for dynamic custom systems.
// Each condition references a column by Excel letter (A, B, ..., Z, AA, ...).

export type ConditionOp =
  | 'eq' | 'neq'
  | 'contains' | 'contains_any' | 'not_contains'
  | 'token_match' | 'not_token_match'
  | 'in_list' | 'not_in_list'
  | 'eq_number' | 'gt' | 'lt' | 'gte' | 'lte' | 'between'
  | 'is_empty' | 'is_not_empty'
  | 'date_before' | 'date_after' | 'date_equals' | 'date_older_than_days' | 'date_newer_than_days'
  | 'time_overlaps'
  | 'regex';

export interface Condition {
  column: string; // Excel letter like "E", "AA"
  op: ConditionOp;
  value?: string | number;
  values?: (string | number)[];
}

export interface DerivedColumn {
  name: string;
  /** Map: column letter -> label to assign when match is true */
  from_columns: Record<string, string>;
  /** Which test to use on the source cell */
  match: 'is_zero' | 'is_empty' | 'is_not_empty' | 'truthy';
}

/** 🧮 A computed column evaluated per-row from one or more source columns. */
export interface ComputedColumn {
  /** Display header of the new column. */
  name: string;
  type:
    | 'sum'            // sum numeric values of `columns`
    | 'duration'       // hours between two times: one range column "10:00 AM - 12:00 PM" OR columns=[from,to]
    | 'expr'           // arithmetic expression with {A} {B} column refs, e.g. "({A}+{B})*2"
    | 'concat'         // join `columns` values with `separator`
    | 'count_tokens'   // number of tokens (lines / ، , ; |) in one column
    | 'date_diff_days' // days from date column A to date column B (or to today when B omitted)
    | 'year_from_date' // extract the year of a date column
    | 'month_from_date' // extract the month number (1-12) of a date column
    | 'default_if_empty' // value of columns[0], or `fallback` text when the cell is empty
    | 'row_number';    // 1..n sequence in the final output
  columns?: string[];
  separator?: string;
  expr?: string;
  /** Fallback text used by `default_if_empty` when the source cell is empty. */
  fallback?: string;
  /** Decimal places for numeric results (default: trim trailing zeros). */
  round?: number;
}

/** 📊 Group stage: group filtered rows, compute aggregates, optionally filter groups (HAVING). */
export interface GroupAgg {
  name: string;
  op: 'count' | 'count_unique' | 'sum' | 'min' | 'max' | 'avg' | 'count_where';
  column?: string;               // Excel letter (not needed for count)
  conditions?: Condition[];      // for count_where
}

export interface GroupHaving {
  agg: string;                   // name of a GroupAgg
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
  value: number;
}

export interface GroupStage {
  /** Excel letters to group by. */
  keys: string[];
  aggs: GroupAgg[];
  /** Keep only groups satisfying these aggregate comparisons. */
  having?: GroupHaving[];
  /** 'groups' = emit one row per group (first row's cells + aggregates).
   *  'rows'   = keep original rows, aggregates attached as extra columns. */
  emit: 'groups' | 'rows';
  /** Sort emitted groups by this aggregate name ('' = group key). */
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

/** ⚠️ Pairwise time-conflict detector: flags rows whose time range overlaps another row in the same group. */
export interface ConflictCfg {
  /** Group rows by these letters (e.g. teacher + day, or room + day). */
  group_by: string[];
  /** One column holding "10:00 AM - 12:00 PM" ... */
  range_column?: string;
  /** ... or two separate from/to columns. */
  from_column?: string;
  to_column?: string;
  /** Extra letters whose values must ALSO match for a conflict (e.g. semester). Empty = ignore. */
  also_match?: string[];
  /** Label written into the flag column for conflicting rows. */
  flag: string;
  /** Name of the flag column (display header). Default «⚠️ تعارض». */
  flag_column?: string;
  /** When true, emit ONLY conflicting rows. Default true. */
  only_conflicts?: boolean;
}

export function colLetterToIndex(letter: string): number {
  const s = (letter || '').toString().trim().toUpperCase();
  if (!s) return -1;
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i) - 64;
    if (c < 1 || c > 26) return -1;
    n = n * 26 + c;
  }
  return n - 1;
}

export function colIndexToLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Parse "F:N", "F,G,I", or mixed "A:B,D:J,L" into array of 0-based indexes (de-duplicated, in order). */
export function parseColumnsRange(range: string): number[] {
  const r = (range || '').trim();
  if (!r) return [];
  const tokens = r.split(/[,\s;]+/).map((t) => t.trim()).filter(Boolean);
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (i: number) => { if (i >= 0 && !seen.has(i)) { seen.add(i); out.push(i); } };
  tokens.forEach((tok) => {
    if (tok.includes(':')) {
      const [a, b] = tok.split(':').map((x) => x.trim());
      const ia = colLetterToIndex(a);
      const ib = colLetterToIndex(b);
      if (ia < 0 || ib < 0 || ib < ia) return;
      for (let i = ia; i <= ib; i += 1) push(i);
    } else {
      push(colLetterToIndex(tok));
    }
  });
  return out;
}

function normalizeAr(s: string): string {
  return (s || '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
}

function getCellByLetter(row: Record<string, string>, headers: string[], letter: string): string {
  const i = colLetterToIndex(letter);
  if (i < 0 || i >= headers.length) return '';
  return row[headers[i]] || '';
}

function toNumber(v: string): number | null {
  const t = (v || '').trim();
  if (!t) return null;
  const n = parseFloat(t.replace(/[^\d.\-]/g, ''));
  return isNaN(n) ? null : n;
}

/** Split a cell on newlines / common separators so multi-value cells are checked per token. */
function splitCellTokens(raw: string): string[] {
  const t = (raw || '').trim();
  if (!t) return [''];
  const parts = t.split(/[\n\r،,;|]+/).map((x) => x.trim()).filter((x) => x.length > 0);
  return parts.length > 0 ? parts : [t];
}

/* ─────────────── Time helpers ─────────────── */

/** Parse "10:30 AM" / "2:15 PM" / "14:15" into minutes since midnight. Returns null when unparsable. */
export function parseTimeMinutes(raw: string): number | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*([AP]\.?M\.?|ص|م)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = (m[3] || '').replace(/\./g, '').toUpperCase();
  if (ap === 'PM' || ap === 'م') { if (h < 12) h += 12; }
  else if (ap === 'AM' || ap === 'ص') { if (h === 12) h = 0; }
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/** Extract the FIRST time range [startMin, endMin] from a cell like "10:00 AM - 12:00 PM". */
export function parseTimeRange(raw: string): [number, number] | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const times = s.match(/\d{1,2}\s*[:.]\s*\d{2}\s*(?:[AP]\.?M\.?|ص|م)?/gi) || [];
  if (times.length >= 2) {
    const a = parseTimeMinutes(times[0]);
    const b = parseTimeMinutes(times[1]);
    if (a !== null && b !== null) return [a, b];
  }
  return null;
}

export function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/* ─────────────── Date helpers ─────────────── */

/** Parse a sheet date cell (ISO, M/D/YYYY, D/M/YYYY) into a Date. */
export function parseCellDate(raw: string): Date | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = parseInt(m[1]);
    const b = parseInt(m[2]);
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    if (a > 12) return new Date(y, b - 1, a); // D/M/Y
    return new Date(y, a - 1, b);             // M/D/Y (Sheets default)
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Resolve a condition date value: ISO date, "today", "today+N", "today-N",
 *  or "academic_year_start" (Sept 1 of the current academic year, with optional ±N days). */
function resolveCondDate(value: string | number | undefined): Date | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const rel = s.match(/^today\s*(?:\(\s*\))?(?:\s*([+-])\s*(\d+))?$/i);
  if (rel) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    if (rel[2]) d.setDate(d.getDate() + (rel[1] === '-' ? -1 : 1) * parseInt(rel[2], 10));
    return d;
  }
  const acad = s.match(/^academic_year_start(?:\s*([+-])\s*(\d+))?$/i);
  if (acad) {
    const now = new Date();
    // Academic year starts Sept 1: Jan–Sep → Sept 1 of previous year; Oct–Dec → Sept 1 of current year.
    const y = now.getMonth() <= 8 ? now.getFullYear() - 1 : now.getFullYear();
    const d = new Date(y, 8, 1);
    if (acad[2]) d.setDate(d.getDate() + (acad[1] === '-' ? -1 : 1) * parseInt(acad[2], 10));
    return d;
  }
  return parseCellDate(s);
}

/* ─────────────── Conditions ─────────────── */

export function evaluateCondition(
  cond: Condition,
  row: Record<string, string>,
  headers: string[],
): boolean {
  const raw = getCellByLetter(row, headers, cond.column);
  const t = raw.trim();
  const tokens = splitCellTokens(raw);
  const target = String(cond.value ?? '').trim();
  switch (cond.op) {
    case 'eq': return tokens.some((x) => x === target);
    case 'neq': return !tokens.some((x) => x === target);
    case 'contains': return normalizeAr(t).includes(normalizeAr(target));
    case 'not_contains': return !normalizeAr(t).includes(normalizeAr(target));
    case 'token_match': {
      // Treat cell as a list of tokens separated by / , ، ; | whitespace; match exactly
      const parts = t.split(/[\s/،,;|]+/).map((x) => x.trim()).filter(Boolean);
      const nTarget = normalizeAr(target);
      return parts.some((x) => normalizeAr(x) === nTarget);
    }
    case 'not_token_match': {
      const parts = t.split(/[\s/،,;|]+/).map((x) => x.trim()).filter(Boolean);
      const nTarget = normalizeAr(target);
      return !parts.some((x) => normalizeAr(x) === nTarget);
    }
    case 'in_list': {
      const list = (cond.values || []).map((v) => normalizeAr(String(v)));
      return tokens.some((x) => list.includes(normalizeAr(x)));
    }
    case 'not_in_list': {
      const list = (cond.values || []).map((v) => normalizeAr(String(v)));
      return !tokens.some((x) => list.includes(normalizeAr(x)));
    }
    case 'contains_any': {
      const list = (cond.values || []).map((v) => normalizeAr(String(v)));
      const nt = normalizeAr(t);
      return list.some((v) => v && nt.includes(v));
    }
    case 'is_empty': return t === '';
    case 'is_not_empty': return t !== '';
    case 'eq_number': {
      const num = Number(cond.value);
      if (isNaN(num)) return false;
      if (t === '') return num === 0;
      return tokens.some((x) => {
        const n = toNumber(x);
        return n !== null && n === num;
      });
    }
    case 'gt': return tokens.some((x) => { const n = toNumber(x); return n !== null && n > Number(cond.value); });
    case 'lt': return tokens.some((x) => { const n = toNumber(x); return n !== null && n < Number(cond.value); });
    case 'gte': return tokens.some((x) => { const n = toNumber(x); return n !== null && n >= Number(cond.value); });
    case 'lte': return tokens.some((x) => { const n = toNumber(x); return n !== null && n <= Number(cond.value); });
    case 'between': {
      const [lo, hi] = (cond.values || []).map(Number);
      if (isNaN(lo) || isNaN(hi)) return false;
      return tokens.some((x) => { const n = toNumber(x); return n !== null && n >= lo && n <= hi; });
    }
    case 'date_before': {
      const cell = parseCellDate(t);
      const ref = resolveCondDate(cond.value);
      return !!cell && !!ref && cell.getTime() < ref.getTime();
    }
    case 'date_after': {
      const cell = parseCellDate(t);
      const ref = resolveCondDate(cond.value);
      return !!cell && !!ref && cell.getTime() > ref.getTime();
    }
    case 'date_equals': {
      const cell = parseCellDate(t);
      const ref = resolveCondDate(cond.value);
      if (!cell || !ref) return false;
      // مقارنة باليوم/الشهر/السنة فقط (تجاهل الوقت)
      return cell.getFullYear() === ref.getFullYear() && cell.getMonth() === ref.getMonth() && cell.getDate() === ref.getDate();
    }
    case 'date_older_than_days': {
      const cell = parseCellDate(t);
      const days = Number(cond.value);
      if (!cell || isNaN(days)) return false;
      return (Date.now() - cell.getTime()) / 86400000 > days;
    }
    case 'date_newer_than_days': {
      const cell = parseCellDate(t);
      const days = Number(cond.value);
      if (!cell || isNaN(days)) return false;
      return (Date.now() - cell.getTime()) / 86400000 <= days;
    }
    case 'time_overlaps': {
      const cellRange = parseTimeRange(t);
      const condRange = parseTimeRange(target);
      return !!cellRange && !!condRange && rangesOverlap(cellRange, condRange);
    }
    case 'regex': {
      try { return new RegExp(String(cond.value ?? ''), 'iu').test(t); } catch { return false; }
    }
    default: return true;
  }
}

export function evaluateAll(conditions: Condition[], row: Record<string, string>, headers: string[]): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, row, headers));
}

export function applyDerivedColumns(
  derived: DerivedColumn[],
  baseRow: Record<string, string>,
  headers: string[],
): Record<string, string>[] {
  if (!derived || derived.length === 0) return [baseRow];
  // For each derived column, branch rows where any source matches.
  let outRows: Record<string, string>[] = [baseRow];
  derived.forEach((dc) => {
    const next: Record<string, string>[] = [];
    outRows.forEach((row) => {
      Object.entries(dc.from_columns).forEach(([letter, label]) => {
        const cell = getCellByLetter(row, headers, letter);
        const t = cell.trim();
        let hit = false;
        switch (dc.match) {
          case 'is_zero': hit = t === '' || t === '0' || toNumber(t) === 0; break;
          case 'is_empty': hit = t === ''; break;
          case 'is_not_empty': hit = t !== ''; break;
          case 'truthy': hit = !!t && t !== '0' && t.toLowerCase() !== 'false'; break;
        }
        if (hit) next.push({ ...row, [dc.name]: label });
      });
    });
    outRows = next;
  });
  return outRows;
}

/* ─────────────── Computed columns ─────────────── */

const fmtNum = (n: number, round?: number): string => {
  if (!isFinite(n)) return '';
  if (typeof round === 'number') return n.toFixed(round);
  // Trim trailing zeros but keep up to 2 decimals.
  return String(Math.round(n * 100) / 100);
};

/** Safe arithmetic evaluator: supports + - * / ( ) numbers and {A} column refs. */
function evalExpr(expr: string, row: Record<string, string>, headers: string[]): number | null {
  const replaced = expr.replace(/\{([A-Za-z]{1,3})\}/g, (_, letter: string) => {
    const n = toNumber(getCellByLetter(row, headers, letter));
    return n === null ? '0' : String(n);
  });
  if (!/^[\d\s+\-*/.()]+$/.test(replaced)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = new Function(`return (${replaced});`)() as number;
    return typeof v === 'number' && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function computeColumnValue(
  cc: ComputedColumn,
  row: Record<string, string>,
  headers: string[],
  rowIndex?: number,
): string {
  const cols = cc.columns || [];
  const cellOf = (letter?: string) => (letter ? getCellByLetter(row, headers, letter) : '');
  switch (cc.type) {
    case 'sum': {
      let s = 0;
      let any = false;
      cols.forEach((L) => {
        const n = toNumber(cellOf(L));
        if (n !== null) { s += n; any = true; }
      });
      return any ? fmtNum(s, cc.round) : '';
    }
    case 'duration': {
      let range: [number, number] | null = null;
      if (cols.length >= 2) {
        const a = parseTimeMinutes(cellOf(cols[0]));
        const b = parseTimeMinutes(cellOf(cols[1]));
        if (a !== null && b !== null) range = [a, b];
      } else if (cols.length === 1) {
        range = parseTimeRange(cellOf(cols[0]));
      }
      if (!range) return '';
      return fmtNum((range[1] - range[0]) / 60, cc.round ?? 2);
    }
    case 'expr': {
      const v = evalExpr(cc.expr || '', row, headers);
      return v === null ? '' : fmtNum(v, cc.round);
    }
    case 'concat': {
      return cols.map((L) => cellOf(L).trim()).filter(Boolean).join(cc.separator ?? ' - ');
    }
    case 'count_tokens': {
      const t = cellOf(cols[0]);
      if (!t.trim()) return '0';
      return String(splitCellTokens(t).length);
    }
    case 'date_diff_days': {
      const a = parseCellDate(cellOf(cols[0]));
      if (!a) return '';
      const b = cols[1] ? parseCellDate(cellOf(cols[1])) : new Date();
      if (!b) return '';
      return String(Math.floor((b.getTime() - a.getTime()) / 86400000));
    }
    case 'year_from_date': {
      const d = parseCellDate(cellOf(cols[0]));
      return d ? String(d.getFullYear()) : '';
    }
    case 'month_from_date': {
      const d = parseCellDate(cellOf(cols[0]));
      return d ? String(d.getMonth() + 1) : '';
    }
    case 'default_if_empty': {
      const t = cellOf(cols[0]).trim();
      return t || String(cc.fallback ?? '');
    }
    case 'row_number': {
      return typeof rowIndex === 'number' ? String(rowIndex + 1) : '';
    }
    default: return '';
  }
}

/* ─────────────── Group stage ─────────────── */

export function applyGroupStage(
  stage: GroupStage,
  rows: Record<string, string>[],
  headers: string[],
): Record<string, string>[] {
  const keyOf = (r: Record<string, string>) =>
    stage.keys.map((L) => getCellByLetter(r, headers, L).replace(/\s+/g, ' ').trim()).join('¦');

  const groups = new Map<string, Record<string, string>[]>();
  rows.forEach((r) => {
    const k = keyOf(r);
    const arr = groups.get(k);
    if (arr) arr.push(r);
    else groups.set(k, [r]);
  });

  /** Resolve a value by Excel letter first, then fall back to a computed/agg column name. */
  const valOf = (m: Record<string, string>, ref?: string): string => {
    if (!ref) return '';
    const byLetter = getCellByLetter(m, headers, ref);
    if (byLetter !== '') return byLetter;
    return m[ref] || '';
  };

  const calcAgg = (agg: GroupAgg, members: Record<string, string>[]): number => {
    switch (agg.op) {
      case 'count': return members.length;
      case 'count_where': {
        const conds = agg.conditions || [];
        return members.filter((m) => evaluateAll(conds, m, headers)).length;
      }
      case 'count_unique': {
        const set = new Set<string>();
        members.forEach((m) => {
          const v = valOf(m, agg.column).trim();
          if (v) set.add(v);
        });
        return set.size;
      }
      case 'sum': {
        let s = 0;
        members.forEach((m) => { const n = toNumber(valOf(m, agg.column)); if (n !== null) s += n; });
        return s;
      }
      case 'min': {
        let best: number | null = null;
        members.forEach((m) => { const n = toNumber(valOf(m, agg.column)); if (n !== null && (best === null || n < best)) best = n; });
        return best ?? 0;
      }
      case 'max': {
        let best: number | null = null;
        members.forEach((m) => { const n = toNumber(valOf(m, agg.column)); if (n !== null && (best === null || n > best)) best = n; });
        return best ?? 0;
      }
      case 'avg': {
        let s = 0; let c = 0;
        members.forEach((m) => { const n = toNumber(valOf(m, agg.column)); if (n !== null) { s += n; c++; } });
        return c > 0 ? s / c : 0;
      }
      default: return 0;
    }
  };

  const passHaving = (vals: Record<string, number>): boolean => {
    return (stage.having || []).every((h) => {
      const v = vals[h.agg] ?? 0;
      switch (h.op) {
        case 'eq': return v === h.value;
        case 'neq': return v !== h.value;
        case 'gt': return v > h.value;
        case 'lt': return v < h.value;
        case 'gte': return v >= h.value;
        case 'lte': return v <= h.value;
        default: return true;
      }
    });
  };

  const out: Record<string, string>[] = [];
  groups.forEach((members) => {
    const vals: Record<string, number> = {};
    (stage.aggs || []).forEach((a) => { vals[a.name] = calcAgg(a, members); });
    if (!passHaving(vals)) return;
    if (stage.emit === 'groups') {
      const first = members[0];
      const row: Record<string, string> = { ...first };
      (stage.aggs || []).forEach((a) => {
        row[a.name] = String(Math.round((vals[a.name] ?? 0) * 100) / 100);
      });
      out.push(row);
    } else {
      members.forEach((m) => {
        const row: Record<string, string> = { ...m };
        (stage.aggs || []).forEach((a) => {
          row[a.name] = String(Math.round((vals[a.name] ?? 0) * 100) / 100);
        });
        out.push(row);
      });
    }
  });

  if (stage.sort_by !== undefined) {
    const dir = stage.sort_dir === 'desc' ? -1 : 1;
    const sb = stage.sort_by;
    out.sort((a, b) => {
      if (sb && Object.prototype.hasOwnProperty.call(a, sb)) {
        const na = toNumber(a[sb]); const nb = toNumber(b[sb]);
        if (na !== null && nb !== null) return (na - nb) * dir;
        return String(a[sb] || '').localeCompare(String(b[sb] || ''), 'ar') * dir;
      }
      return 0;
    });
  }
  return out;
}

/* ─────────────── Conflict detection ─────────────── */

/** Flag rows whose time range overlaps another row in the same group. Returns rows with `flagCol` set. */
export function applyConflictDetection(
  cfg: ConflictCfg,
  rows: Record<string, string>[],
  headers: string[],
): Record<string, string>[] {
  const flagCol = cfg.flag_column || '⚠️ تعارض';
  const rangeOf = (r: Record<string, string>): [number, number] | null => {
    if (cfg.range_column) return parseTimeRange(getCellByLetter(r, headers, cfg.range_column));
    if (cfg.from_column && cfg.to_column) {
      const a = parseTimeMinutes(getCellByLetter(r, headers, cfg.from_column));
      const b = parseTimeMinutes(getCellByLetter(r, headers, cfg.to_column));
      if (a !== null && b !== null) return [a, b];
    }
    return null;
  };
  const groupKey = (r: Record<string, string>) =>
    [...cfg.group_by, ...(cfg.also_match || [])]
      .map((L) => getCellByLetter(r, headers, L).replace(/\s+/g, ' ').trim())
      .join('¦');

  const groups = new Map<string, { row: Record<string, string>; range: [number, number] | null }[]>();
  rows.forEach((r) => {
    const k = groupKey(r);
    const entry = { row: r, range: rangeOf(r) };
    const arr = groups.get(k);
    if (arr) arr.push(entry);
    else groups.set(k, [entry]);
  });

  const conflicted = new Set<Record<string, string>>();
  groups.forEach((members) => {
    for (let i = 0; i < members.length; i += 1) {
      const ri = members[i].range;
      if (!ri) continue;
      for (let j = i + 1; j < members.length; j += 1) {
        const rj = members[j].range;
        if (!rj) continue;
        if (rangesOverlap(ri, rj)) {
          conflicted.add(members[i].row);
          conflicted.add(members[j].row);
        }
      }
    }
  });

  const out: Record<string, string>[] = [];
  rows.forEach((r) => {
    const isHit = conflicted.has(r);
    if (cfg.only_conflicts !== false && !isHit) return;
    out.push({ ...r, [flagCol]: isHit ? cfg.flag : '' });
  });
  return out;
}

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'يساوي',
  neq: 'لا يساوي',
  contains: 'يحتوي على',
  not_contains: 'لا يحتوي على',
  token_match: 'يطابق عنصراً (مفصول بـ / أو ،)',
  not_token_match: 'لا يطابق عنصراً (مفصول بـ / أو ،)',
  in_list: 'ضمن قائمة قيم',
  not_in_list: 'ليس ضمن قائمة قيم',
  contains_any: 'يحتوي أحد القيم',
  eq_number: 'يساوي رقماً',
  gt: 'أكبر من',
  lt: 'أصغر من',
  gte: 'أكبر أو يساوي',
  lte: 'أصغر أو يساوي',
  between: 'بين قيمتين (من-إلى)',
  date_before: 'تاريخ قبل',
  date_after: 'تاريخ بعد',
  date_equals: 'تاريخ يساوي',
  date_older_than_days: 'أقدم من (يوم)',
  date_newer_than_days: 'أحدث من (يوم)',
  time_overlaps: 'يتقاطع زمنياً مع فترة',
  is_empty: 'فارغ',
  is_not_empty: 'غير فارغ',
  regex: 'تعبير نمطي',
};

export const COMPUTED_TYPE_LABELS: Record<ComputedColumn['type'], string> = {
  sum: 'مجموع أعمدة',
  duration: 'مدة زمنية (ساعات)',
  expr: 'معادلة حسابية',
  concat: 'دمج نصوص',
  count_tokens: 'عدد العناصر',
  date_diff_days: 'فرق الأيام',
  year_from_date: 'سنة التاريخ',
  month_from_date: 'رقم الشهر',
  default_if_empty: 'قيمة بديلة عند الفراغ',
  row_number: 'رقم تسلسلي',
};
