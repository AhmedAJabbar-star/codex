import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { SYSTEMS, type SystemConfig } from '@/data/scheduleData';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';

const loadingShell = (message: string) => (
  <div className="schedule-body min-h-screen flex items-center justify-center px-4" dir="rtl">
    <div className="schedule-card max-w-xl w-full text-center">
      <div className="text-4xl mb-4">📑</div>
      <p className="text-lg font-extrabold text-[var(--schedule-text)]">{message}</p>
    </div>
  </div>
);

const AssignmentsPage = () => {
  const baseSystem = useMemo(() => SYSTEMS.find((system) => system.id === 'assignments'), []);

  const { data: rows, error, isLoading } = useQuery({
    queryKey: ['individual-assignments'],
    queryFn: () => fetchIndividualAssignmentRows(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  const systemsOverride = useMemo<SystemConfig[] | undefined>(() => {
    if (!baseSystem || !rows) return undefined;
    return [{ ...baseSystem, rows }];
  }, [baseSystem, rows]);

  if (!baseSystem) {
    return loadingShell('تعذر تهيئة صفحة تكليفات التدريسي.');
  }

  if (isLoading && !rows) {
    return loadingShell('جاري جلب بيانات تكليفات التدريسي مباشرة من ورقة Individualassignments...');
  }

  if (error || !systemsOverride) {
    return loadingShell(
      error instanceof Error
        ? error.message
        : 'تعذر تحميل بيانات تكليفات التدريسي من Google Sheets.',
    );
  }

  return <SingleSystemPage systemIds={['assignments']} systemsOverride={systemsOverride} />;
};

export default AssignmentsPage;
