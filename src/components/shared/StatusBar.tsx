import { useEffect, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * شريط حالة عام: يعرض حالة الاتصال + عدّاد تنازلي للتحديث القادم + آخر تحديث + زر تحديث.
 * يثبَّت في أسفل الشاشة على كل الصفحات.
 */
const REFRESH_INTERVAL_SEC = 60;

const StatusBar = () => {
  const queryClient = useQueryClient();
  const online = useNetworkStatus();
  const fetching = useIsFetching({ queryKey: ['live-schedule-data'] });
  const fetchingAssignments = useIsFetching({ queryKey: ['individual-assignments'] });
  const isFetching = fetching + fetchingAssignments > 0;

  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_INTERVAL_SEC);

  // عند انتهاء الجلب نضبط آخر تحديث ونعيد العداد
  useEffect(() => {
    if (!isFetching && fetching === 0) {
      // فقط عندما ينتهي جلب جديد
      const data = queryClient.getQueryState(['live-schedule-data']);
      if (data?.dataUpdatedAt) {
        setLastUpdate(new Date(data.dataUpdatedAt));
        setSecondsLeft(REFRESH_INTERVAL_SEC);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching]);

  // العداد التنازلي
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? REFRESH_INTERVAL_SEC : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const lastLabel = lastUpdate
    ? lastUpdate.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : '—';

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['live-schedule-data'], refetchType: 'active' });
    queryClient.invalidateQueries({ queryKey: ['individual-assignments'], refetchType: 'active' });
  };

  return (
    <div
      dir="rtl"
      className="fixed bottom-0 inset-x-0 z-40 print:hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,.85), rgba(248,251,255,.95))',
        borderTop: '1px solid var(--schedule-border)',
        backdropFilter: 'blur(14px)',
        boxShadow: '0 -6px 18px rgba(15,23,42,.06)',
      }}
    >
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5 py-1.5 flex items-center justify-between gap-3 text-[12px] font-extrabold">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
            style={{
              background: online ? 'rgba(34,197,94,.12)' : 'rgba(220,38,38,.12)',
              color: online ? '#15803d' : '#b91c1c',
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: online ? '#22c55e' : '#ef4444' }}
            />
            {online ? 'متصل' : 'غير متصل'}
          </span>

          {isFetching ? (
            <span className="inline-flex items-center gap-1.5 text-[var(--schedule-accent-blue)]">
              <span className="inline-block animate-spin">🔄</span>
              جارٍ جلب البيانات...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[var(--schedule-muted)]">
              ⏱️ التحديث التلقائي خلال{' '}
              <span className="text-[var(--schedule-accent-blue)] font-black">{secondsLeft}s</span>
            </span>
          )}

          <span className="hidden sm:inline text-[var(--schedule-muted)]">
            • آخر تحديث: <span className="text-[var(--schedule-text)]">{lastLabel}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-[var(--schedule-muted-2)]">
            ⌘ <kbd className="px-1 py-0.5 rounded border border-[var(--schedule-border)]">Ctrl</kbd>+
            <kbd className="px-1 py-0.5 rounded border border-[var(--schedule-border)]">K</kbd> بحث
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="px-3 py-1 rounded-full text-white font-black"
            style={{
              background: isFetching
                ? '#94a3b8'
                : 'linear-gradient(135deg,#059669 0%,#047857 100%)',
              cursor: isFetching ? 'wait' : 'pointer',
              fontSize: 11,
            }}
            title="تحديث الآن (Ctrl+R)"
          >
            🔄 تحديث
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
