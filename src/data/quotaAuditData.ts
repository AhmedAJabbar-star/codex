import type { ScheduleRow } from '@/data/scheduleData';

const PUB_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';
const QUOTA_GID = '457825033';

export interface QuotaAuditData {
  rows: ScheduleRow[];
  headers: string[];
}

const compactText = (value: string) =>
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
  const response = await fetch(`${PUB_BASE}?gid=${QUOTA_GID}&single=true&output=csv`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`تعذر جلب بيانات تدقيق النصاب (HTTP ${response.status})`);
  const [headerRow = [], ...dataRows] = parseCsv((await response.text()).replace(/^\uFEFF/, ''));
  const headers = headerRow.map(compactText).filter(Boolean);
  const rows = dataRows
    .filter((cells) => cells.some((cell) => compactText(cell).length > 0))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, compactText(cells[index] ?? '')])) as ScheduleRow);
  return { rows, headers };
}