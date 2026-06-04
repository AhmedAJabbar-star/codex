import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

interface Props {
  systemId: string;
  title: string;
}

const AuditSingle = ({ systemId }: Props) => {
  const { systemsOverride, error, isLoading } = useLiveSystems([systemId]);

  if (!systemsOverride) {
    if (isLoading) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }

  return <SingleSystemPage systemIds={[systemId]} systemsOverride={systemsOverride} />;
};

export default AuditSingle;
