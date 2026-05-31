// Condition evaluator for dynamic custom systems.
// Each condition references a column by Excel letter (A, B, ..., Z, AA, ...).

export type ConditionOp =
  | 'eq' | 'neq'
  | 'contains' | 'contains_any' | 'not_contains'
  | 'eq_number' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'is_empty' | 'is_not_empty'
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

/** Parse a range like "F:N" or "F,G,I,K" into array of 0-based indexes */
export function parseColumnsRange(range: string): number[] {
  const r = (range || '').trim();
  if (!r) return [];
  if (r.includes(':')) {
    const [a, b] = r.split(':').map((x) => x.trim());
    const ia = colLetterToIndex(a);
    const ib = colLetterToIndex(b);
    if (ia < 0 || ib < 0 || ib < ia) return [];
    const out: number[] = [];
    for (let i = ia; i <= ib; i += 1) out.push(i);
    return out;
  }
  return r.split(/[,\s]+/).filter(Boolean).map(colLetterToIndex).filter((x) => x >= 0);
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

export function evaluateCondition(
  cond: Condition,
  row: Record<string, string>,
  headers: string[],
): boolean {
  const raw = getCellByLetter(row, headers, cond.column);
  const t = raw.trim();
  switch (cond.op) {
    case 'eq': return t === String(cond.value ?? '');
    case 'neq': return t !== String(cond.value ?? '');
    case 'contains': return normalizeAr(t).includes(normalizeAr(String(cond.value ?? '')));
    case 'not_contains': return !normalizeAr(t).includes(normalizeAr(String(cond.value ?? '')));
    case 'contains_any': {
      const list = (cond.values || []).map((v) => normalizeAr(String(v)));
      const nt = normalizeAr(t);
      return list.some((v) => v && nt.includes(v));
    }
    case 'is_empty': return t === '';
    case 'is_not_empty': return t !== '';
    case 'eq_number': {
      const n = toNumber(t);
      const target = Number(cond.value);
      if (isNaN(target)) return false;
      // Treat empty as zero when target is 0
      if (n === null) return target === 0;
      return n === target;
    }
    case 'gt': { const n = toNumber(t); return n !== null && n > Number(cond.value); }
    case 'lt': { const n = toNumber(t); return n !== null && n < Number(cond.value); }
    case 'gte': { const n = toNumber(t); return n !== null && n >= Number(cond.value); }
    case 'lte': { const n = toNumber(t); return n !== null && n <= Number(cond.value); }
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

export const OP_LABELS: Record<ConditionOp, string> = {
  eq: 'يساوي',
  neq: 'لا يساوي',
  contains: 'يحتوي على',
  not_contains: 'لا يحتوي على',
  contains_any: 'يحتوي أحد القيم',
  eq_number: 'يساوي رقماً',
  gt: 'أكبر من',
  lt: 'أصغر من',
  gte: 'أكبر أو يساوي',
  lte: 'أصغر أو يساوي',
  is_empty: 'فارغ',
  is_not_empty: 'غير فارغ',
  regex: 'تعبير نمطي',
};
