/**
 * محرك التقارير المدمجة (Join Engine)
 * -----------------------------------
 * يدمج بيانات نظامين (ورقتين) بالاستناد إلى عمود مُعرِّف مشترك، ويشتق قيمة كل عمود
 * من الجهة الأخرى وفق طريقة الاشتقاق المختارة (أول/آخر/مجموع/متوسط/عدد/أصغر/أكبر/دمج نصي).
 */
import type { JoinedReportCfg, JoinAgg } from '@/data/customSystemsRegistry';
import type { SheetFetchResult } from '@/data/supervisionData';
import { colLetterToIndex } from '@/lib/conditionEngine';

const norm = (v: unknown) => String(v ?? '').replace(/[\u200f\u200e]/g, '').trim();
const numOf = (v: unknown) => {
  const n = parseFloat(norm(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** يطبّق طريقة الاشتقاق على مجموعة قيم قادمة من الصفوف المطابقة. */
export function aggregate(values: string[], agg: JoinAgg | undefined): string {
  const vals = values.filter((v) => norm(v) !== '');
  switch (agg) {
    case 'last':
      return vals.length ? vals[vals.length - 1] : '';
    case 'count':
      return String(vals.length);
    case 'concat':
      return Array.from(new Set(vals)).join(' | ');
    case 'sum':
    case 'avg':
    case 'min':
    case 'max': {
      const nums = vals.map(numOf).filter((n): n is number => n !== null);
      if (nums.length === 0) return '';
      if (agg === 'sum') return String(nums.reduce((a, b) => a + b, 0));
      if (agg === 'avg') return String(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100);
      if (agg === 'min') return String(Math.min(...nums));
      return String(Math.max(...nums));
    }
    case 'first':
    default:
      return vals.length ? vals[0] : '';
  }
}

export interface JoinResult {
  headers: string[];
  rows: Record<string, string>[];
  /** أعمدة رقمية بالكامل — تُستخدم لذيل المجاميع. */
  numericHeaders: string[];
}

/** يبني الجدول المدمج من ورقتَي النظامين وفق الإعداد. */
export function buildJoinedTable(cfg: JoinedReportCfg, left: SheetFetchResult, right: SheetFetchResult): JoinResult {
  const lh = (letter: string) => left.headers[colLetterToIndex(letter)] || '';
  const rh = (letter: string) => right.headers[colLetterToIndex(letter)] || '';
  const leftKeyHeader = lh(cfg.left_key || 'A');
  const rightKeyHeader = rh(cfg.right_key || 'A');

  // فهرسة صفوف الجهة اليمنى بحسب المُعرِّف المشترك
  const index = new Map<string, Record<string, string>[]>();
  right.rows.forEach((r) => {
    const k = norm((r as Record<string, string>)[rightKeyHeader]);
    if (!k) return;
    const arr = index.get(k) || [];
    arr.push(r as Record<string, string>);
    index.set(k, arr);
  });

  const cols = (cfg.columns || []).filter((c) => c && c.column);
  const headers = cols.map((c, i) => {
    const src = c.side === 'right' ? right.headers : left.headers;
    const auto = src[colLetterToIndex(c.column)] || `${c.side === 'right' ? 'ب' : 'أ'}-${c.column}`;
    return (c.label || '').trim() || `${auto}${cols.filter((x, j) => j < i && ((x.label || '').trim() || '') === ((c.label || '').trim() || '')).length ? ' ' : ''}`.trim() || auto;
  });
  // ضمان تفرّد العناوين (مطلوب لأن الصفوف كائنات بمفاتيح العناوين)
  const seen = new Map<string, number>();
  const uniqueHeaders = headers.map((h) => {
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows: Record<string, string>[] = [];
  left.rows.forEach((lr) => {
    const arr = lr as Record<string, string>;
    const key = norm(arr[leftKeyHeader]);
    const matches = key ? (index.get(key) || []) : [];
    if ((cfg.join_type || 'left') === 'inner' && matches.length === 0) return;
    const out: Record<string, string> = {};
    cols.forEach((c, i) => {
      const h = uniqueHeaders[i];
      if (c.side === 'left') {
        out[h] = norm(arr[lh(c.column)]);
      } else {
        const vals = matches.map((m) => norm(m[rh(c.column)]));
        out[h] = aggregate(vals, c.agg);
      }
    });
    rows.push(out);
  });

  const numericHeaders = uniqueHeaders.filter((h) => {
    const vals = rows.map((r) => r[h]).filter((v) => norm(v) !== '');
    return vals.length > 0 && vals.every((v) => numOf(v) !== null);
  });

  return { headers: uniqueHeaders, rows, numericHeaders };
}
