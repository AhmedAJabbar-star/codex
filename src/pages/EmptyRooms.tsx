import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const EmptyRoomsPage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['emptyRooms']);
  if (isLoading && !systemsOverride) return <LiveLoadingShell />;
  if (error || !systemsOverride) return <LiveLoadingShell error={error} />;
  return <SingleSystemPage systemIds={['emptyRooms']} systemsOverride={systemsOverride} />;
};
export default EmptyRoomsPage;
