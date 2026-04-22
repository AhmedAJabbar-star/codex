import type { ScheduleRow } from '@/data/scheduleData';
import {
  ALL_ROOMS,
  ROOM_CAPACITY,
  TIME_SLOTS,
  DAYS,
} from '@/data/scheduleData';

const PUB_BASE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS3U9uiqk1zc5lk0Gae_FKYIb_wg1OAV1JoBx868uSTw4TwHdiH9Fc_XxQlsYy4pmIApYZqVKWDmDOC/pub';

export const SHEET_GIDS = {
  teacher: '0',                  // Schedule
  student: '1765483005',         // الجدول حسب القسم واليوم
  report: '587741649',           // Schedulereport
  hours: '1878774467',           // الساعات
  assignmentsAudit: '1416068353', // التكليفات
} as const;

// أعمدة يجب استبعادها من تقرير "تدقيق تكليفات القسم"
const ASSIGNMENTS_AUDIT_EXCLUDED = [
  'المواليد',
  'العمر',
  'المنصب',
  'عضوية اللجان الامتحانية',
  'عضضضوية اللجان الامتحانية',
];

// نص يحل محل قيمة "نوع المحاضرة" الفارغة في تقرير تدقيق نوع المحاضرة
export const LECTURE_TYPE_PLACEHOLDER =
  'لن يظهر في التكليفات لعدم تحديد نوع الدرس نظري او عملي';

export type SheetKey = keyof typeof SHEET_GIDS;

function buildCsvUrl(gid: string): string {
  return `${PUB_BASE}?gid=${gid}&single=true&output=csv`;
}

/* ----------------------------- CSV parsing ----------------------------- */

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

function normalizeRow(row: ScheduleRow): ScheduleRow {
  const normalized: ScheduleRow = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      key === 'المادة' ? compactText(value, ' / ') : compactText(value),
    ]),
  );
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
      return normalizeRow(row);
    });
}

async function fetchSheet(gid: string): Promise<ScheduleRow[]> {
  const response = await fetch(buildCsvUrl(gid), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`تعذر جلب البيانات من Google Sheets (HTTP ${response.status})`);
  }
  const csvText = (await response.text()).replace(/^\uFEFF/, '');
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const headers = headerRow.map((h) => compactText(h));
  if (headers.length === 0) {
    throw new Error('تعذر قراءة ترويسات ورقة Google Sheets');
  }
  return mapRows(headers, dataRows);
}

/* ----------------------------- Time helpers ----------------------------- */

function parseMin(t: string): number | null {
  if (!t) return null;
  const m1 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return parseInt(m1[1]) * 60 + parseInt(m1[2]);
  const m2 = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)/i);
  if (!m2) return null;
  let h = parseInt(m2[1]);
  const min = parseInt(m2[2]);
  const p = m2[4].toUpperCase();
  if ((p === 'PM' || p === 'م') && h !== 12) h += 12;
  if ((p === 'AM' || p === 'ص') && h === 12) h = 0;
  return h * 60 + min;
}

function to12hFormat(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr);
  const m = parseInt(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')}:00 ${period}`;
}

function normalizeTimeCell(value: string): string {
  if (!value) return '';
  const m1 = value.match(/^(\d{1,2}):(\d{2})$/);
  if (m1) return to12hFormat(value);
  return value;
}

/* ------------------------ Per-sheet post-processing ------------------------ */

function computeDuration(startStr: string, endStr: string): string {
  const s = parseMin(startStr);
  const e = parseMin(endStr);
  if (s === null || e === null) return '';
  const diff = (e - s) / 60;
  return diff > 0 ? diff.toString() : '';
}

function postProcessTeacher(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((r) => {
    const start = normalizeTimeCell(r['بدء المحاضرة'] || '');
    const end = normalizeTimeCell(r['نهاية المحاضرة'] || '');
    const out: ScheduleRow = {
      ...r,
      'بدء المحاضرة': start,
      'نهاية المحاضرة': end,
    };
    if (!out['مدة المحاضرة']) {
      out['مدة المحاضرة'] = computeDuration(start, end);
    }
    if (!out['القسم الذي تنتمي اليه']) {
      out['القسم الذي تنتمي اليه'] = out['القسم'] || '';
    }
    if (!out['الكلية التي تنتمي اليها']) {
      out['الكلية التي تنتمي اليها'] = out['الكلية'] || '';
    }
    return out;
  });
}

function postProcessStudent(rows: ScheduleRow[]): ScheduleRow[] {
  return rows.map((r) => ({
    ...r,
    'بدء المحاضرة': normalizeTimeCell(r['بدء المحاضرة'] || ''),
    'نهاية المحاضرة': normalizeTimeCell(r['نهاية المحاضرة'] || ''),
  }));
}

function generateEmptyRoomsFromStudent(studentRows: ScheduleRow[]): ScheduleRow[] {
  const semesters = ['الاول', 'الثاني'];
  const result: ScheduleRow[] = [];

  semesters.forEach((semester) => {
    const srcRows = studentRows.filter((r) => r['الفصل الدراسي'] === semester);
    const occupied = new Set<string>();

    srcRows.forEach((r) => {
      const room = r['القاعة أو المختبر'];
      const day = r['اليوم'];
      if (!room || !day) return;
      const lectStart = parseMin(r['بدء المحاضرة'] || '');
      const lectEnd = parseMin(r['نهاية المحاضرة'] || '');
      if (lectStart === null || lectEnd === null) return;
      TIME_SLOTS.forEach((slot) => {
        const slotStart = parseMin(slot.from)!;
        const slotEnd = parseMin(slot.to)!;
        if (lectStart < slotEnd && lectEnd > slotStart) {
          occupied.add(`${room}|${day}|${slot.from}|${slot.to}`);
        }
      });
    });

    ALL_ROOMS.forEach((room) => {
      DAYS.forEach((day) => {
        TIME_SLOTS.forEach((slot) => {
          const key = `${room}|${day}|${slot.from}|${slot.to}`;
          if (!occupied.has(key)) {
            result.push({
              'القاعة': room,
              'الطاقة الاستيعابية': ROOM_CAPACITY[room] || '',
              'اليوم': day,
              'الفترة الشاغرة من': to12hFormat(slot.from),
              'الفترة الشاغرة الى': to12hFormat(slot.to),
              'الفصل الدراسي': semester,
            });
          }
        });
      });
    });
  });

  return result;
}

/* ------------------------------- Public API ------------------------------- */

export interface LiveScheduleData {
  teacher: ScheduleRow[];
  student: ScheduleRow[];
  report: ScheduleRow[];
  hours: ScheduleRow[];
  tracking: ScheduleRow[];
  emptyRooms: ScheduleRow[];
  lectureTypeAudit: ScheduleRow[];
  assignmentsAudit: ScheduleRow[];
  assignmentsAuditHeaders: string[];
}

function buildLectureTypeAudit(studentRows: ScheduleRow[]): ScheduleRow[] {
  return studentRows
    .filter((r) => {
      const dept = (r['القسم'] || '').trim();
      const type = (r['نوع المحاضرة'] || '').trim();
      return dept !== '' && type === '';
    })
    .map((r) => ({
      ...r,
      'نوع المحاضرة': LECTURE_TYPE_PLACEHOLDER,
    }));
}

async function fetchAssignmentsAuditSheet(): Promise<{
  rows: ScheduleRow[];
  headers: string[];
}> {
  const response = await fetch(buildCsvUrl(SHEET_GIDS.assignmentsAudit), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`تعذر جلب بيانات ورقة التكليفات (HTTP ${response.status})`);
  }
  const csvText = (await response.text()).replace(/^\uFEFF/, '');
  const [headerRow = [], ...dataRows] = parseCsv(csvText);
  const rawHeaders = headerRow.map((h) => compactText(h));
  const headers = rawHeaders.filter((h) => h && !ASSIGNMENTS_AUDIT_EXCLUDED.includes(h));
  const rows = mapRows(rawHeaders, dataRows);
  return { rows, headers };
}

export async function fetchLiveScheduleData(): Promise<LiveScheduleData> {
  const [teacherRaw, studentRaw, reportRaw, hoursRaw, assignmentsAuditData] = await Promise.all([
    fetchSheet(SHEET_GIDS.teacher),
    fetchSheet(SHEET_GIDS.student),
    fetchSheet(SHEET_GIDS.report),
    fetchSheet(SHEET_GIDS.hours),
    fetchAssignmentsAuditSheet(),
  ]);

  const teacher = postProcessTeacher(teacherRaw);
  const student = postProcessStudent(studentRaw);
  const emptyRooms = generateEmptyRoomsFromStudent(student);
  const lectureTypeAudit = buildLectureTypeAudit(student);

  return {
    teacher,
    student,
    report: reportRaw,
    hours: hoursRaw,
    tracking: student,
    emptyRooms,
    lectureTypeAudit,
    assignmentsAudit: assignmentsAuditData.rows,
    assignmentsAuditHeaders: assignmentsAuditData.headers,
  };
}

export async function fetchSheetByKey(key: SheetKey): Promise<ScheduleRow[]> {
  const rows = await fetchSheet(SHEET_GIDS[key]);
  if (key === 'teacher') return postProcessTeacher(rows);
  if (key === 'student') return postProcessStudent(rows);
  return rows;
}
