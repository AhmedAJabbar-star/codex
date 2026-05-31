import { useCallback } from 'react';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { CHECKALLHR_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SIGS = [{ label: 'المدقق' }];

const ProjectSupervisionExceeded = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const fKey = sheet.headers[5] || 'F';
    const gKey = sheet.headers[6] || 'G';
    const iKey = sheet.headers[8] || 'I';
    const headers = [fKey, gKey, iKey];

    const rows = sheet.rows
      .filter((r) => {
        const n = parseFloat((r[iKey] || '').replace(/[^\d.\-]/g, ''));
        return !isNaN(n) && n > 4;
      })
      .map((r) => ({ [fKey]: r[fKey] || '', [gKey]: r[gKey] || '', [iKey]: r[iKey] || '' }));

    return {
      id: 'projectSupervisionExceeded',
      title: 'تجاوز الحد الاقصى للاشراف على المشاريع',
      appTitle: 'تجاوز الحد الاقصى للاشراف على المشاريع',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'حالات تجاوز سقف الاشراف على مشاريع التخرج لطلبة الدراسة الاولية (الإشراف على أكثر من 4).',
      icon: '🚨',
      headers,
      filters: [
        { label: gKey, key: gKey, control: 'select' },
        { label: fKey, key: fKey, control: 'combo' },
      ],
      rows,
      customSignatures: SIGS,
    };
  }, []);

  return <SupervisionBasePage queryKey="project-supervision-exceeded" gid={CHECKALLHR_GID} build={build} />;
};

export default ProjectSupervisionExceeded;
