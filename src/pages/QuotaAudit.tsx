import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { cacheQuotaAuditData, fetchQuotaAuditData, getCachedQuotaAuditData, type QuotaAuditData } from '@/data/quotaAuditData';
import type { SystemConfig } from '@/data/scheduleData';

interface CachedLiveQuotaData {
  quota?: QuotaAuditData['rows'];
  quotaHeaders?: string[];
}

const QUOTA_HIDDEN_HEADERS = ['ت', 'اسم التدريسي'];
const QUOTA_AUDIT_SYSTEM: SystemConfig = {
  id: 'quotaAudit',
  title: 'تدقيق استيفاء النصاب',
  appTitle: 'تدقيق استيفاء النصاب',
  universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
  hint: 'نظام مختص لعرض ملخص لساعات الاستاذ الاسبوعية وتوضيح استيفاء النصاب حسب نوع التعيين. حدّد الفصل الدراسي لعرض البيانات.',
  icon: '⚖️',
  headers: [],
  filters: [
    { label: 'الفصل الدراسي', key: 'الفصل الدراسي', control: 'select' },
    { label: 'القسم', key: 'القسم', control: 'select' },
    { label: 'نوع التعيين', key: 'نوع التعيين', control: 'select' },
    { label: 'تدقيق استيفاء النصاب حسب نوع التعيين', key: 'تدقيق استيفاء النصاب حسب نوع التعيين', control: 'select' },
    { label: 'اسم التدريسي', key: 'اسم التدريسي', control: 'combo' },
  ],
  rows: [],
  requiredFilters: ['الفصل الدراسي'],
};

const QuotaAuditPage = () => {
  const queryClient = useQueryClient();
  const initialQuotaData = useMemo<QuotaAuditData | undefined>(() => {
    const liveData = queryClient.getQueryData<CachedLiveQuotaData>(['live-schedule-data']);
    if (liveData?.quota?.length) {
      const fromLive = { rows: liveData.quota, headers: liveData.quotaHeaders || [] };
      cacheQuotaAuditData(fromLive);
      return fromLive;
    }
    return queryClient.getQueryData<QuotaAuditData>(['quota-audit-data']) || getCachedQuotaAuditData();
  }, [queryClient]);

  const { data, error, isLoading } = useQuery({
    queryKey: ['quota-audit-data'],
    queryFn: async () => {
      const freshData = await fetchQuotaAuditData();
      if (!freshData.rows.length || !freshData.headers.length) {
        const fallback = queryClient.getQueryData<QuotaAuditData>(['quota-audit-data']) || getCachedQuotaAuditData();
        if (fallback?.rows.length) return fallback;
        throw new Error('تعذر تحميل بيانات تدقيق النصاب حالياً');
      }
      cacheQuotaAuditData(freshData);
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
    if (!data) return undefined;
    const headers = (data.headers || []).filter((h) => !QUOTA_HIDDEN_HEADERS.includes((h || '').trim()));
    return [{ ...QUOTA_AUDIT_SYSTEM, rows: data.rows, headers: headers.length > 0 ? headers : QUOTA_AUDIT_SYSTEM.headers }];
  }, [data]);

  if (isLoading && !data) {
    return <LiveLoadingShell />;
  }

  if (!systemsOverride) {
    return <LiveLoadingShell error={error} />;
  }

  return <SingleSystemPage systemIds={['quotaAudit']} systemsOverride={systemsOverride} />;
};

export default QuotaAuditPage;
