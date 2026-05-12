import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const TeacherSchedulePage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['teacher']);
  if (!systemsOverride) {
    if (isLoading) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }
  return <SingleSystemPage systemIds={['teacher']} systemsOverride={systemsOverride} />;
};
export default TeacherSchedulePage;
