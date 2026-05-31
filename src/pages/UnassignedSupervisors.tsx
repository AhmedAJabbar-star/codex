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

    const normalizeAr = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
    const rows = sheet.rows
      .filter((r) => {
        const e = normalizeAr(r[eKey] || '');
        const c = (r[cKey] || '').trim();
        const nRaw = (r[nKey] || '').trim();
        const nNum = parseFloat(nRaw.replace(/[^\d.\-]/g, ''));
        const nIsZero = nRaw === '' || nRaw === '0' || (!isNaN(nNum) && nNum === 0);
        return e.includes('استاذ') && c !== 'مجاز' && nIsZero;
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
