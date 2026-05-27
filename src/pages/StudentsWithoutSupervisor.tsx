import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { POSTGRADUATE_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SUPERVISION_SIGNATURES = [
  { label: 'مدير الدراسات العليا' },
  { label: 'معاون العميد للشؤون العلمية والدراسات العليا' },
  { label: 'مصادقة العميد' },
];

const StudentsWithoutSupervisor = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers } = slice(sheet, 0, 3); // A..D
    const colI = sheet.headers[8] || 'I';

    const rows = sheet.rows
      .filter((r) => (r[colI] || '').trim() === '0')
      .map((r) => {
        const out: Record<string, string> = {};
        headers.forEach((h) => { out[h] = r[h] || ''; });
        return out;
      });

    return {
      id: 'studentsWithoutSupervisor',
      title: 'طلبة من دون مشرف',
      appTitle: 'طلبة من دون مشرف',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'يعرض أسماء الطلبة كافة الذين هم في مرحلة البحث ولم يثبت لديهم تدريسي مكلف بالاشراف عليهم.',
      icon: '🧑‍🎓',
      headers,
      filters: [],
      rows,
      customSignatures: SUPERVISION_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="postgraduate-no-supervisor" gid={POSTGRADUATE_GID} build={build} />;
};

export default StudentsWithoutSupervisor;
