import { useCallback } from 'react';
import SupervisionBasePage, { slice } from '@/components/shared/SupervisionBasePage';
import { PROJECT_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const PROJECT_SIGNATURES = [
  { label: 'رئيس لجنة المشاريع' },
  { label: 'مقرر القسم' },
  { label: 'رئيس القسم' },
];

const findHeader = (headers: string[], needles: string[], fallbackIdx: number) => {
  for (const n of needles) {
    const m = headers.find(h => (h || '').includes(n));
    if (m) return m;
  }
  return headers[fallbackIdx] || `col${fallbackIdx}`;
};

const Projects = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const { headers, rows } = slice(sheet, 0, 4); // A..E
    const deptKey = findHeader(headers, ['قسم الطالب', 'القسم'], 0);
    const studyKey = headers[2] || 'C';

    return {
      id: 'projects',
      title: 'المشاريع',
      appTitle: 'المشاريع',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'التدريسيون المكلفون بالاشراف على مشاريع طلبة المرحلة الرابعة.',
      icon: '📁',
      headers,
      filters: [
        { label: 'قسم الطالب', key: deptKey, control: 'select' },
        { label: 'نوع الدراسة', key: studyKey, control: 'select' },
      ],
      rows,
      customSignatures: PROJECT_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="projects-sheet" gid={PROJECT_GID} build={build} />;
};

export default Projects;
