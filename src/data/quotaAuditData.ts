import type { ScheduleRow } from '@/data/scheduleData';

const PUB_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';
const QUOTA_GID = '457825033';

export interface QuotaAuditData {
  rows: ScheduleRow[];
  headers: string[];
}

const CACHE_KEY = 'quota-audit:last-good-data';
let memoryCache: QuotaAuditData | undefined;

const isValidQuotaData = (data: unknown): data is QuotaAuditData => {
  const d = data as QuotaAuditData;
  return Array.isArray(d?.rows) && Array.isArray(d?.headers) && d.rows.length > 0 && d.headers.length > 0;
};

export const getCachedQuotaAuditData = (): QuotaAuditData | undefined => {
  if (memoryCache) return memoryCache;
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!isValidQuotaData(parsed)) return undefined;
    memoryCache = parsed;
    return parsed;
  } catch {
    return undefined;
  }
};

export const cacheQuotaAuditData = (data: QuotaAuditData) => {
  if (!isValidQuotaData(data)) return;
  memoryCache = data;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // تجاهل امتلاء التخزين المحلي؛ آخر نسخة في الذاكرة تبقى متاحة أثناء الجلسة.
  }
};

const fetchWithTimeout = (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => globalThis.clearTimeout(timeout));
};

const compactText = (value: string) => {
  const lines = value.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map((p) => p.trim()).filter(Boolean);
  return lines.join('\n');
};
const compactHeader = (value: string) =>
  value.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map((p) => p.trim()).filter(Boolean).join(' ').trim();

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i += 1; } else inQuotes = false;
      } else value += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (char !== '\r') value += char;
  }
  if (value.length > 0 || row.length > 0) { row.push(value); rows.push(row); }
  return rows;
};

export async function fetchQuotaAuditData(): Promise<QuotaAuditData> {
  const cached = getCachedQuotaAuditData();
  try {
    const response = await fetchWithTimeout(`${PUB_BASE}?gid=${QUOTA_GID}&single=true&output=csv`, cached ? 2500 : 6000);
    if (!response.ok) throw new Error(`تعذر جلب بيانات تدقيق النصاب (HTTP ${response.status})`);
    const [headerRow = [], ...dataRows] = parseCsv((await response.text()).replace(/^\uFEFF/, ''));
    const headers = headerRow.map(compactText).filter(Boolean);
    const rows = dataRows
      .filter((cells) => cells.some((cell) => compactText(cell).length > 0))
      .map((cells) => Object.fromEntries(headers.map((header, index) => [header, compactText(cells[index] ?? '')])) as ScheduleRow);
    const fresh = { rows, headers };
    cacheQuotaAuditData(fresh);
    return fresh;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}