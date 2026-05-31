import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { CHECKALLHR_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const UnassignedSupervisors = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const cKey = sheet.headers[2] || 'C';
    const eKey = sheet.headers[4] || 'E';
    const fKey = sheet.headers[5] || 'F';
    const gKey = sheet.headers[6] || 'G';
    const nKey = sheet.headers[13] || 'N';
    const { headers } = slice(sheet, 5, 7); // F..H

    const rows = sheet.rows
      .filter((r) => {
        const e = (r[eKey] || '').trim();
        const c = (r[cKey] || '').trim();
        const nNum = parseFloat((r[nKey] || '').replace(/[^\d.\-]/g, ''));
        return e.includes('استاذ') && c !== 'مجاز' && !isNaN(nNum) && nNum === 0;
      })
      .map((r) => {
        const out: Record<string, string> = {};
        headers.forEach((h) => { out[h] = r[h] || ''; });
        return out;
      });

    return {
      id: 'unassignedSupervisors',
      title: 'التدريسيون غير المكلفين بالاشراف',
      appTitle: 'التدريسيون غير المكلفين بالاشراف',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'التدريسيون المؤهلون للاشراف من حيث اللقب العلمي وليس لديهم تكليفات بالاشراف على طلبة الدراسات العليا.',
      icon: '🧑‍🏫',
      headers,
      filters: [
        { label: gKey, key: gKey, control: 'select' },
        { label: fKey, key: fKey, control: 'combo' },
      ],
      rows,
    };
  }, []);

  return <SupervisionBasePage queryKey="unassigned-supervisors" gid={CHECKALLHR_GID} build={build} />;
};

export default UnassignedSupervisors;
