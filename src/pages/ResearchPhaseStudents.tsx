import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { POSTGRADUATE_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const ResearchPhaseStudents = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows } = slice(sheet, 0, 3); // A..D
    const colA = sheet.headers[0] || 'A';
    const colD = sheet.headers[3] || 'D';

    return {
      id: 'researchPhaseStudents',
      title: 'طلبة الدراسات العليا في مرحلة البحث',
      appTitle: 'طلبة الدراسات العليا في مرحلة البحث',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'يعرض طلبة الدراسات العليا كافة الذين هم في مرحلة البحث.',
      icon: '🎓',
      headers,
      filters: [
        { label: 'القسم', key: colD, control: 'select' },
        { label: 'اسم الطالب', key: colA, control: 'select' },
      ],
      rows,
    };
  }, []);

  return <SupervisionBasePage queryKey="postgraduate-research" gid={POSTGRADUATE_GID} build={build} />;
};

export default ResearchPhaseStudents;
