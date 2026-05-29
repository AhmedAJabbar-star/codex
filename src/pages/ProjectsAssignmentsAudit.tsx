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

const ProjectsAssignmentsAudit = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const allHeaders = sheet.headers;
    const colI = allHeaders[8] || 'I';
    const visibleHeaders = allHeaders.slice(0, 8); // A..H

    // Keep only rows where column I != "سليم"
    const filteredRows = sheet.rows
      .filter(r => (r[colI] || '').trim() !== '' && (r[colI] || '').trim() !== 'سليم')
      .map(r => {
        const out: Record<string, string> = {};
        visibleHeaders.forEach(h => { out[h] = r[h] || ''; });
        // expose column I as a synthetic header for the violations filter
        out['__violation'] = (r[colI] || '').trim();
        return out;
      });

    const deptKey = visibleHeaders[4] || 'E';
    const studyKey = visibleHeaders[3] || 'D';
    const violationOptions = [...new Set(filteredRows.map(r => r['__violation']).filter(Boolean))].sort();

    return {
      id: 'projectsAssignmentsAudit',
      title: 'تدقيق تكليفات المشاريع',
      appTitle: 'تدقيق تكليفات المشاريع',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'يعرض حالات تكليفات مشاريع التخرج التي تحتوي على مخالفات (غير سليمة).',
      icon: '⚠️',
      headers: visibleHeaders,
      filters: [
        { label: 'القسم', key: deptKey, control: 'select' },
        { label: 'الدراسة', key: studyKey, control: 'select' },
        { label: 'المخالفات', key: '__violation', control: 'select', fixedOptions: violationOptions },
      ],
      rows: filteredRows,
      customSignatures: PROJECT_SIGNATURES,
    };
  }, []);

  return <SupervisionBasePage queryKey="projects-assignments-audit" gid={STUDENTS_GID} build={build} />;
};

export default ProjectsAssignmentsAudit;
