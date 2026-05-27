import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { fetchSheetByGid, type SheetFetchResult } from '@/data/supervisionData';
import type { SystemConfig, ScheduleRow } from '@/data/scheduleData';

interface Props {
  queryKey: string;
  gid: string;
  /** Build the SystemConfig given the fetched sheet. Return rows to display (already filtered if needed). */
  build: (sheet: SheetFetchResult) => SystemConfig;
}

const SupervisionBasePage = ({ queryKey, gid, build }: Props) => {
  const { data, error, isLoading } = useQuery({
    queryKey: [queryKey, gid],
    queryFn: () => fetchSheetByGid(gid),
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
    return [build(data)];
  }, [data, build]);

  if (isLoading && !data) return <LiveLoadingShell />;
  if (!systemsOverride) return <LiveLoadingShell error={error} />;

  return <SingleSystemPage systemIds={[systemsOverride[0].id]} systemsOverride={systemsOverride} />;
};

export default SupervisionBasePage;

/** Helper to slice headers + rebuild rows keyed only on displayed headers */
export function slice(sheet: SheetFetchResult, fromIdx: number, toIdxInclusive: number): { headers: string[]; rows: ScheduleRow[] } {
  const headers = sheet.headers.slice(fromIdx, toIdxInclusive + 1);
  const rows = sheet.rows.map((r) => {
    const out: ScheduleRow = {};
    headers.forEach((h) => { out[h] = r[h] || ''; });
    return out;
  });
  return { headers, rows };
}
