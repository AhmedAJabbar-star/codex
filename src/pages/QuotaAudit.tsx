import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { fetchQuotaAuditData } from '@/data/liveScheduleData';
import { SYSTEMS, type SystemConfig } from '@/data/scheduleData';

const QUOTA_HIDDEN_HEADERS = ['ت', 'اسم التدريسي'];

const QuotaAuditPage = () => {
  const baseSystem = useMemo(() => SYSTEMS.find((system) => system.id === 'quotaAudit'), []);
  const { data, error, isLoading } = useQuery({
    queryKey: ['quota-audit-data'],
    queryFn: fetchQuotaAuditData,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const systemsOverride = useMemo<SystemConfig[] | undefined>(() => {
    if (!baseSystem || !data) return undefined;
    const headers = (data.headers || []).filter((h) => !QUOTA_HIDDEN_HEADERS.includes((h || '').trim()));
    return [{ ...baseSystem, rows: data.rows, headers: headers.length > 0 ? headers : baseSystem.headers }];
  }, [baseSystem, data]);

  if (!baseSystem) {
    return <LiveLoadingShell error={new Error('تعذر تهيئة صفحة تدقيق استيفاء النصاب.')} />;
  }

  if (isLoading && !data) {
    return <LiveLoadingShell />;
  }

  if (error || !systemsOverride) {
    return <LiveLoadingShell error={error} />;
  }

  return <SingleSystemPage systemIds={['quotaAudit']} systemsOverride={systemsOverride} />;
};

export default QuotaAuditPage;
