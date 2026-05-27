import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { SUPERVISION_GID, parseSheetDate, currentAcademicCutoff } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SUPERVISION_SIGNATURES = [
  { label: 'مدير الدراسات العليا' },
  { label: 'معاون العميد للشؤون العلمية والدراسات العليا' },
  { label: 'مصادقة العميد' },
];

const ExpiredSupervision = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers } = slice(sheet, 0, 7); // A..H
    const colE = sheet.headers[4] || 'E';
    const cutoff = currentAcademicCutoff();
    const cutoffMs = cutoff.getTime();

    const rows = sheet.rows
      .filter((r) => {
        const d = parseSheetDate(r[colE] || '');
        return d !== null && d.getTime() <= cutoffMs;
      })
      .map((r) => {
        const out: Record<string, string> = {};
        headers.forEach((h) => { out[h] = r[h] || ''; });
        return out;
      });

    const cutoffStr = cutoff.toLocaleDateString('ar-IQ');
    return {
      id: 'expiredSupervision',
      title: 'حالات الاشراف المنتهية قبل بدء العام الدراسي',
      appTitle: 'حالات الاشراف المنتهية قبل بدء العام الدراسي',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: `يعرض حالات الاشراف التي تاريخ انهاء تكليفها يسبق أو يساوي ${cutoffStr} (بداية العام الدراسي الحالي).`,
      icon: '⏳',
      headers,
      filters: [],
      rows,
      customSignatures: SUPERVISION_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="supervision-expired" gid={SUPERVISION_GID} build={build} />;
};

export default ExpiredSupervision;
