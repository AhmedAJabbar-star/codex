import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLiveScheduleData, type LiveScheduleData } from '@/data/liveScheduleData';
import { SYSTEMS, type SystemConfig, type ScheduleRow } from '@/data/scheduleData';
import { backgroundSyncTeachers, fetchTeacherList } from '@/lib/teacherAuth';

/**
 * Fetch all schedule sheets live from Google Sheets with auto-refresh.
 * Shared across all systems so a single network round-trip serves them all.
 *
 * Side effect: every refresh also (a) fires a background sync that appends any
 * new teacher names to the Google Sheets users sheet (existing rows / passwords
 * are never modified), and (b) prefetches the teachers dropdown so the
 * Individual Assignments login is instant when opened.
 */
export function useLiveScheduleData() {
  const qc = useQueryClient();
  return useQuery<LiveScheduleData>({
    queryKey: ['live-schedule-data'],
    queryFn: async () => {
      const data = await fetchLiveScheduleData();
      backgroundSyncTeachers();
      qc.prefetchQuery({ queryKey: ['teacher-users-list'], queryFn: fetchTeacherList })
        .catch(() => { /* ignore */ });
      return data;
    },
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/**
 * Build SystemConfig overrides for the requested system IDs using live data.
 * Falls back to the static config when live data is unavailable.
 */
export function useLiveSystems(systemIds: string[]) {
  const { data, error, isLoading, isFetching, refetch } = useLiveScheduleData();

  const systemsOverride = useMemo<SystemConfig[] | undefined>(() => {
    if (!data) return undefined;
    const liveMap: Record<string, ScheduleRow[]> = {
      teacher: data.teacher,
      student: data.student,
      report: data.report,
      hours: data.hours,
      tracking: data.tracking,
      emptyRooms: data.emptyRooms,
      lectureTypeAudit: data.lectureTypeAudit,
      assignmentsAudit: data.assignmentsAudit,
    };
    const headersMap: Record<string, string[]> = {
      assignmentsAudit: data.assignmentsAuditHeaders,
    };
    const result: SystemConfig[] = [];
    systemIds.forEach((id) => {
      const base = SYSTEMS.find((s) => s.id === id);
      if (!base) return;
      const liveRows = liveMap[id];
      const liveHeaders = headersMap[id];
      if (liveRows) {
        result.push({
          ...base,
          rows: liveRows,
          headers: liveHeaders && liveHeaders.length > 0 ? liveHeaders : base.headers,
        });
      } else {
        result.push(base);
      }
    });
    return result;
  }, [data, systemIds]);

  return { systemsOverride, error, isLoading, isFetching, refetch };
}
