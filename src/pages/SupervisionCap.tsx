import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { CHECK_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SUPERVISION_SIGNATURES = [
  { label: 'مدير الدراسات العليا' },
  { label: 'معاون العميد للشؤون العلمية والدراسات العليا' },
  { label: 'مصادقة العميد' },
];

const SupervisionCap = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows } = slice(sheet, 0, 10); // A..K
    const colA = sheet.headers[0] || 'A';
    const colJ = sheet.headers[9] || 'J';

    return {
      id: 'supervisionCap',
      title: 'سقف الاشراف',
      appTitle: 'سقف الاشراف',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'عرض حالات التجاوز في سقف الاشراف الاعتيادي والاستثنائي بالاضافة إلى إحصائيات لحالات الاشراف الحالي والكلي وحسب نوع الدراسة للطالب.',
      icon: '📐',
      headers,
      filters: [
        { label: 'اسم التدريسي', key: colA, control: 'select' },
        { label: 'سقف الاشراف', key: colJ, control: 'select' },
      ],
      rows,
      customSignatures: SUPERVISION_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="supervision-cap" gid={CHECK_GID} build={build} />;
};

export default SupervisionCap;
