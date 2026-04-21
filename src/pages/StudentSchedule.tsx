import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const StudentSchedulePage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['student']);
  if (isLoading && !systemsOverride) return <LiveLoadingShell />;
  if (error || !systemsOverride) return <LiveLoadingShell error={error} />;
  return <SingleSystemPage systemIds={['student']} systemsOverride={systemsOverride} />;
};
export default StudentSchedulePage;
