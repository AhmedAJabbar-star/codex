import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { fetchQuotaAuditData, type LiveScheduleData, type QuotaAuditData } from '@/data/liveScheduleData';
import { SYSTEMS, type SystemConfig } from '@/data/scheduleData';

const QUOTA_HIDDEN_HEADERS = ['ت', 'اسم التدريسي'];
const QUOTA_AUDIT_CACHE_KEY = 'quota-audit:last-good-data';

const readCachedQuotaAudit = (): QuotaAuditData | undefined => {
  try {
    const raw = window.localStorage.getItem(QUOTA_AUDIT_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as QuotaAuditData;
    if (!Array.isArray(parsed.rows) || !Array.isArray(parsed.headers) || parsed.rows.length === 0) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
};

const cacheQuotaAudit = (data: QuotaAuditData) => {
  if (!data.rows.length || !data.headers.length) return;
  try {
    window.localStorage.setItem(QUOTA_AUDIT_CACHE_KEY, JSON.stringify(data));
  } catch {
    // تجاهل امتلاء التخزين المحلي؛ الجلب المباشر يبقى المصدر الأساسي.
  }
};

const QuotaAuditPage = () => {
  const queryClient = useQueryClient();
  const baseSystem = useMemo(() => SYSTEMS.find((system) => system.id === 'quotaAudit'), []);
  const initialQuotaData = useMemo<QuotaAuditData | undefined>(() => {
    const liveData = queryClient.getQueryData<LiveScheduleData>(['live-schedule-data']);
    if (liveData?.quota?.length) {
      return { rows: liveData.quota, headers: liveData.quotaHeaders || [] };
    }
    return queryClient.getQueryData<QuotaAuditData>(['quota-audit-data']) || readCachedQuotaAudit();
  }, [queryClient]);

  const { data, error, isLoading } = useQuery({
    queryKey: ['quota-audit-data'],
    queryFn: async () => {
      const freshData = await fetchQuotaAuditData();
      if (!freshData.rows.length || !freshData.headers.length) {
        const fallback = queryClient.getQueryData<QuotaAuditData>(['quota-audit-data']) || readCachedQuotaAudit();
        if (fallback?.rows.length) return fallback;
        throw new Error('تعذر تحميل بيانات تدقيق النصاب حالياً');
      }
      cacheQuotaAudit(freshData);
      return freshData;
    },
    initialData: initialQuotaData,
    placeholderData: (previousData) => previousData,
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

  if (!systemsOverride) {
    return <LiveLoadingShell error={error} />;
  }

  return <SingleSystemPage systemIds={['quotaAudit']} systemsOverride={systemsOverride} />;
};

export default QuotaAuditPage;
