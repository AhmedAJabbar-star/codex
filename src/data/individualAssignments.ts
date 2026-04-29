import type { ScheduleRow } from '@/data/scheduleData';

const INDIVIDUAL_ASSIGNMENTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub?gid=1147039908&single=true&output=csv';

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

function mapRows(headers: string[], rawRows: string[][]): ScheduleRow[] {
  return rawRows
    .filter((cells) => cells.some((cell) => compactText(cell).length > 0))
    .map((cells) => {
      const row: ScheduleRow = {};

      headers.forEach((header, index) => {
        row[header] = cells[index] ?? '';
      });

      return normalizeAssignmentRow(row);
    });
}

export async function fetchIndividualAssignmentRows(forceRefresh = false): Promise<ScheduleRow[]> {
  const isCacheValid = cachedRows && Date.now() - lastFetchedAt < CACHE_TTL_MS;

  if (!forceRefresh && isCacheValid) {
    return cachedRows;
  }

  const response = await fetch(INDIVIDUAL_ASSIGNMENTS_CSV_URL);

  if (!response.ok) {
    throw new Error('تعذر جلب بيانات تكليفات التدريسي من Google Sheets');
  }

  const csvText = (await response.text()).replace(/^\uFEFF/, '');
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((header) => compactText(header));

  if (headers.length === 0) {
    throw new Error('تعذر قراءة ترويسات ورقة Individualassignments');
  }

  const rows = mapRows(headers, dataRows);
  cachedRows = rows;
  lastFetchedAt = Date.now();

  return rows;
}