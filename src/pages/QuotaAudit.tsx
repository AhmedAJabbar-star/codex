import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const QuotaAuditPage = () => {
  const { systemsOverride, error, isLoading } = useLiveSystems(['quotaAudit']);
  if (!systemsOverride) {
    if (isLoading) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }
  return <SingleSystemPage systemIds={['quotaAudit']} systemsOverride={systemsOverride} />;
};
export default QuotaAuditPage;
