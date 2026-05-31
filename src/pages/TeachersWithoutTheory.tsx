import { useCallback } from 'react';
import SupervisionBasePage from '@/components/shared/SupervisionBasePage';
import { CHECKALLHR_GID } from '@/data/supervisionData';
import type { SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig } from '@/data/scheduleData';

const SEMESTER_KEY = 'الفصل الدراسي';

const TeachersWithoutTheory = () => {
  const build = useCallback((sheet: SheetFetchResult): SystemConfig => {
    const cKey = sheet.headers[2] || 'C';
    const eKey = sheet.headers[4] || 'E';
    const fKey = sheet.headers[5] || 'F';
    const gKey = sheet.headers[6] || 'G';
    const sKey = sheet.headers[18] || 'S';
    const tKey = sheet.headers[19] || 'T';
    const oToT = sheet.headers.slice(14, 20); // O..T

    const visibleHeaders = [gKey, fKey, ...oToT, SEMESTER_KEY];

    const isZero = (v: string) => {
      const t = (v || '').trim();
      if (!t) return false;
      const n = parseFloat(t.replace(/[^\d.\-]/g, ''));
      return !isNaN(n) && n === 0;
    };
    const eq = (v: string, target: string) => (v || '').trim() === target;

    const rows: Record<string, string>[] = [];
    sheet.rows.forEach((r) => {
      if (eq(r[cKey] || '', 'مجاز')) return;
      if (eq(r[eKey] || '', 'مدرس مساعد')) return;
      const base: Record<string, string> = {};
      visibleHeaders.forEach((h) => { if (h !== SEMESTER_KEY) base[h] = r[h] || ''; });
      if (isZero(r[sKey] || '')) rows.push({ ...base, [SEMESTER_KEY]: 'الاول' });
      if (isZero(r[tKey] || '')) rows.push({ ...base, [SEMESTER_KEY]: 'الثاني' });
    });

    return {
      id: 'teachersWithoutTheory',
      title: 'التدريسيون الذين ليس لديهم ساعات نظرية',
      appTitle: 'التدريسيون الذين ليس لديهم ساعات نظرية',
      universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
      hint: 'التدريسيون المطالبون بتدريس مادة نظرية على الاقل وليس لديهم تكليف نظري في الفصل المحدد.',
      icon: '📚',
      headers: visibleHeaders,
      filters: [
        { label: gKey, key: gKey, control: 'select' },
        { label: fKey, key: fKey, control: 'combo' },
        { label: 'الفصل الدراسي', key: SEMESTER_KEY, control: 'select', fixedOptions: ['الاول', 'الثاني'] },
      ],
      rows,
    };
  }, []);

  return <SupervisionBasePage queryKey="teachers-without-theory" gid={CHECKALLHR_GID} build={build} />;
};

export default TeachersWithoutTheory;
