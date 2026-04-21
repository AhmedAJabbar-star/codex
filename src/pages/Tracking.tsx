import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const TrackingPage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['tracking']);
  if (isLoading && !systemsOverride) return <LiveLoadingShell />;
  if (error || !systemsOverride) return <LiveLoadingShell error={error} />;
  return <SingleSystemPage systemIds={['tracking']} systemsOverride={systemsOverride} />;
};
export default TrackingPage;
