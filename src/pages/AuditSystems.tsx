import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const AuditSystemsPage = () => {
  const auditIds = ['report', 'hours', 'lectureTypeAudit', 'assignmentsAudit'];
  const { systemsOverride, error, isLoading } = useLiveSystems(auditIds);

  if (!systemsOverride) {
    if (isLoading) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }

  return <SingleSystemPage systemIds={auditIds} systemsOverride={systemsOverride} />;
};

export default AuditSystemsPage;
