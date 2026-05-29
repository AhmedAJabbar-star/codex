import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { STUDENTS_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const PROJECT_SIGNATURES = [
  { label: 'رئيس لجنة المشاريع' },
  { label: 'مقرر القسم' },
  { label: 'رئيس القسم' },
];

const FourthStageStudents = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows } = slice(sheet, 0, 7); // A..H
    const deptKey = headers[4] || 'E';
    const studyKey = headers[3] || 'D';

    return {
      id: 'fourthStageStudents',
      title: 'طلبة المرحلة الرابعة',
      appTitle: 'طلبة المرحلة الرابعة',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'الطلبة كافة ممن هم في المرحلة الدراسية الرابعة والذين يفترض تكليفهم بمشاريع التخرج مع أسماء التدريسيين المكلفين بالاشراف عليهم.',
      icon: '🎓',
      headers,
      filters: [
        { label: 'القسم', key: deptKey, control: 'select' },
        { label: 'الدراسة', key: studyKey, control: 'select' },
      ],
      rows,
      customSignatures: PROJECT_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="fourth-stage-students" gid={STUDENTS_GID} build={build} />;
};

export default FourthStageStudents;
