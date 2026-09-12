import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { fetchSheetByGid, type SheetFetchResult } from '@/data/supervisionData';
import { readSheetCache, writeSheetCache } from '@/lib/sheetCache';
import type { SystemConfig, ScheduleRow } from '@/data/scheduleData';

interface Props {
  queryKey: string;
  gid: string;
  /** Optional external Google Sheets URL — when provided, data is fetched from that spreadsheet instead of the project's published sheet. */
  externalUrl?: string;
  /** Build the SystemConfig given the fetched sheet. Return rows to display (already filtered if needed). */
  build: (sheet: SheetFetchResult) => SystemConfig;
}

const SupervisionBasePage = ({ queryKey, gid, externalUrl, build }: Props) => {
  const cacheKey = `${queryKey}|${gid}|${externalUrl || ''}`;

  /** 📦 نسخة محفوظة محلياً تُعرض فوراً ريثما تصل البيانات المحدَّثة. */
  const [cached, setCached] = useState<SheetFetchResult | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    setCached(null);
    setCacheChecked(false);
    readSheetCache<SheetFetchResult>(cacheKey)
      .then((v) => { if (alive) { setCached(v && Array.isArray(v.headers) ? v : null); setCacheChecked(true); } })
      .catch(() => { if (alive) setCacheChecked(true); });
    return () => { alive = false; };
  }, [cacheKey]);

  const { data, error, isLoading } = useQuery({
    queryKey: [queryKey, gid, externalUrl || ''],
    queryFn: async () => {
      const sheet = await fetchSheetByGid(gid, externalUrl);
      void writeSheetCache(cacheKey, sheet);
      return sheet;
    },
    // البيانات تبقى صالحة دقيقتين — لا إعادة تنزيل عند كل فتح للصفحة.
    staleTime: 2 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
    placeholderData: (prev) => prev,
  });

  const sheet = data || cached;

  const systemsOverride = useMemo<SystemConfig[] | undefined>(() => {
    if (!sheet) return undefined;
    return [build(sheet)];
  }, [sheet, build]);

  if (!systemsOverride) {
    if (isLoading || !cacheChecked) return <LiveLoadingShell />;
    return <LiveLoadingShell error={error} />;
  }

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
