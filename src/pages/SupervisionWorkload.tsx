import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { CHECKALLHR_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SupervisionWorkload = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows } = slice(sheet, 5, 13); // F..N
    const fKey = sheet.headers[5] || 'F';
    const eKey = sheet.headers[4] || 'E';
    const gKey = sheet.headers[6] || 'G';
    // E is not in displayed range; expose it via row map so the filter can read it
    const rowsWithE = sheet.rows.map((r) => {
      const out: Record<string, string> = {};
      headers.forEach((h) => { out[h] = r[h] || ''; });
      out[eKey] = r[eKey] || '';
      return out;
    });

    return {
      id: 'supervisionWorkload',
      title: 'عبء المشاريع والاشراف',
      appTitle: 'عبء المشاريع والاشراف',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'نظام إحصائي سريع لإعطاء نظرة عن عبء الإشراف على المشاريع وطلبة الدراسات العليا.',
      icon: '📊',
      headers,
      filters: [
        { label: gKey, key: gKey, control: 'select' },
        { label: eKey, key: eKey, control: 'select' },
        { label: fKey, key: fKey, control: 'combo' },
      ],
      rows: rowsWithE,
      customSignatures: [],
    };
  }, []);

  return <SupervisionBasePage queryKey="supervision-workload" gid={CHECKALLHR_GID} build={build} />;
};

export default SupervisionWorkload;
