import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { SUPERVISION_GID, parseSheetDate } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig, ScheduleRow } from '@/data/scheduleData';

const MONTH_KEY = '__شهر_انهاء_التكليف';
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1));

const SUPERVISION_SIGNATURES = [
  { label: 'مدير الدراسات العليا' },
  { label: 'معاون العميد للشؤون العلمية والدراسات العليا' },
  { label: 'مصادقة العميد' },
];

const SupervisionReport = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows: rawRows } = slice(sheet, 0, 7); // A..H
    const colA = sheet.headers[0] || 'A';
    const colC = sheet.headers[2] || 'C';
    const colE = sheet.headers[4] || 'E';
    const colF = sheet.headers[5] || 'F';
    const colG = sheet.headers[6] || 'G';

    // Augment rows with synthetic month-of-end key
    const rows: ScheduleRow[] = rawRows.map((r, i) => {
      const d = parseSheetDate(sheet.rows[i][colE] || '');
      return { ...r, [MONTH_KEY]: d ? String(d.getMonth() + 1) : '' };
    });

    return {
      id: 'supervisionReport',
      title: 'تقرير الاشراف',
      appTitle: 'تقرير الاشراف',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'يعرض هذا التقرير حالات الاشراف لتدريسيي الكلية والتدريسيين الخارجيين المكلفين بالاشراف ضمن السنة الدراسية الحالية.',
      icon: '🧑‍🏫',
      headers,
      filters: [
        { label: 'قسم الاستاذ', key: colG, control: 'select' },
        { label: 'قسم الطالب', key: colF, control: 'select' },
        { label: 'اسم التدريسي', key: colA, control: 'select' },
        { label: 'اسم الطالب', key: colC, control: 'select' },
        { label: 'المناقشات خلال الشهر', key: MONTH_KEY, control: 'select', fixedOptions: MONTH_OPTIONS },
      ],
      rows,
      customSignatures: SUPERVISION_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="supervision-sheet" gid={SUPERVISION_GID} build={build} />;
};

export default SupervisionReport;
