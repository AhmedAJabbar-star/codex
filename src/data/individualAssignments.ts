import type { ScheduleRow } from '@/data/scheduleData';

const INDIVIDUAL_ASSIGNMENTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub?gid=1147039908&single=true&output=csv';
const CACHE_KEY = 'individual-assignments:last-good-data:v2';
let memoryCache: ScheduleRow[] | undefined;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentValue += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentValue);
      currentValue = '';
    } else if (char === '\n') {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = '';
    } else if (char !== '\r') {
      currentValue += char;
    }
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function compactText(value: string, joiner = ' '): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(joiner)
    .trim();
}

function normalizeAssignmentRow(row: ScheduleRow): ScheduleRow {
  const normalized: ScheduleRow = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key === 'المادة' ? compactText(value, ' / ') : compactText(value),
    ]),
  );

  if (!normalized['القسم الذي تنتمي اليه']) {
    normalized['القسم الذي تنتمي اليه'] = normalized['القسم'] || '';
  }

  if (!normalized['الكلية التي تنتمي اليها']) {
    normalized['الكلية التي تنتمي اليها'] = normalized['الكلية'] || '';
  }

  return normalized;
}


function toExcelColumn(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function mapRows(headers: string[], rawRows: string[][]): ScheduleRow[] {
  return rawRows
    .filter((cells) => cells.some((cell) => compactText(cell).length > 0))
    .map((cells) => {
      const row: ScheduleRow = {};

      headers.forEach((header, index) => {
        const value = cells[index] ?? '';
        row[header] = value;
        row[toExcelColumn(index)] = value;
      });

      return normalizeAssignmentRow(row);
    });
}

function isBadRows(rows: ScheduleRow[]): boolean {
  if (rows.length < 100) return true;
  return rows.slice(0, 5).some((row) => Object.values(row).some((v) => /^#(N\/A|VALUE!|REF!|ERROR!)/i.test((v || '').trim())));
}

function getCachedRows(): ScheduleRow[] | undefined {
  if (memoryCache?.length) return memoryCache;
  if (typeof window === 'undefined') return undefined;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(parsed) && parsed.length) {
      memoryCache = parsed;
      return parsed;
    }
  } catch { /* ignore */ }
  return undefined;
}

function cacheRows(rows: ScheduleRow[]) {
  memoryCache = rows;
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
}

export async function fetchIndividualAssignmentRows(): Promise<ScheduleRow[]> {
  const cached = getCachedRows();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${INDIVIDUAL_ASSIGNMENTS_CSV_URL}&_=${Date.now() + attempt}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('تعذر جلب بيانات تكليفات التدريسي من Google Sheets');
      const csvText = (await response.text()).replace(/^\uFEFF/, '');
      const [headerRow = [], ...dataRows] = parseCsv(csvText);
      const headers = headerRow.map((header) => compactText(header));
      if (headers.length === 0) throw new Error('تعذر قراءة ترويسات ورقة Individualassignments');
      const rows = mapRows(headers, dataRows);
      if (isBadRows(rows)) throw new Error('بيانات التكليفات غير مكتملة مؤقتاً');
      cacheRows(rows);
      return rows;
    } catch (error) {
      if (attempt === 2) {
        if (cached?.length) return cached;
        throw error;
      }
    }
  }
  return cached || [];
}