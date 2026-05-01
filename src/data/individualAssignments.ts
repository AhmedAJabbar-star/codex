import type { ScheduleRow } from '@/data/scheduleData';

import { buildCsvUrl, getGoogleConfig } from '@/lib/googleConfig';

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

export async function fetchIndividualAssignmentRows(): Promise<ScheduleRow[]> {
  const cfg = getGoogleConfig();
  const response = await fetch(buildCsvUrl(cfg.assignmentsGid || 0), { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('تعذر جلب بيانات تكليفات التدريسي من Google Sheets');
  }

  const csvText = (await response.text()).replace(/^\uFEFF/, '');
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((header) => compactText(header));

  if (headers.length === 0) {
    throw new Error('تعذر قراءة ترويسات ورقة Individualassignments');
  }

  return mapRows(headers, dataRows);
}