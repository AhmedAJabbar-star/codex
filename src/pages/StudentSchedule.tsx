import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const StudentSchedulePage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['student']);
  if (!systemsOverride) {
    if (isLoading) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }
  return <SingleSystemPage systemIds={['student']} systemsOverride={systemsOverride} />;
};
export default StudentSchedulePage;
