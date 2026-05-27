import type { ScheduleRow } from '@/data/scheduleData';

const PUB_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';

export const SUPERVISION_GID = '567847712';
export const POSTGRADUATE_GID = '345813260';
export const CHECK_GID = '997769481';

function buildCsvUrl(gid: string): string {
  const bust = Math.floor(Date.now() / 30000);
  return `${PUB_BASE}?gid=${gid}&single=true&output=csv&_=${bust}`;
}

function compactText(value: string, joiner = '\n'): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(joiner)
    .trim();
}
const compactHeader = (v: string) =>
  v.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map((p) => p.trim()).filter(Boolean).join(' ').trim();

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let v = '';
  let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { v += '"'; i += 1; } else q = false;
      } else v += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(v); v = ''; }
    else if (c === '\n') { row.push(v); rows.push(row); row = []; v = ''; }
    else if (c !== '\r') v += c;
  }
  if (v.length > 0 || row.length > 0) { row.push(v); rows.push(row); }
  return rows;
}

export interface SheetFetchResult {
  /** all column headers, in original order */
  headers: string[];
  /** all rows keyed by header */
  rows: ScheduleRow[];
}

export async function fetchSheetByGid(gid: string): Promise<SheetFetchResult> {
  const response = await fetch(buildCsvUrl(gid), { cache: 'no-store' });
  if (!response.ok) throw new Error(`تعذر جلب بيانات Google Sheets (HTTP ${response.status})`);
  const text = (await response.text()).replace(/^\uFEFF/, '');
  const [headerRow = [], ...dataRows] = parseCsv(text);
  const headers = headerRow.map(compactHeader);
  const rows = dataRows
    .filter((cells) => cells.some((c) => compactText(c).length > 0))
    .map((cells) => {
      const r: ScheduleRow = {};
      headers.forEach((h, i) => { r[h] = compactText(cells[i] ?? ''); });
      return r;
    });
  return { headers, rows };
}

/* ───── Date parsing ───── */
export function parseSheetDate(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // ISO-like
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  // M/D/YYYY or D/M/YYYY  — Google Sheets default to M/D/YYYY for published CSV
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let a = parseInt(m[1]);
    let b = parseInt(m[2]);
    let y = parseInt(m[3]);
    if (y < 100) y += 2000;
    // If first part > 12, it must be day -> D/M/Y
    if (a > 12) return new Date(y, b - 1, a);
    // default to M/D/Y
    return new Date(y, a - 1, b);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Returns the Sept-1 cutoff date for "current academic year start" per the rule. */
export function currentAcademicCutoff(now = new Date()): Date {
  const month = now.getMonth() + 1; // 1..12
  const year = now.getFullYear();
  if (month >= 1 && month <= 9) return new Date(year - 1, 8, 1); // Sept = month index 8
  return new Date(year, 8, 1);
}
