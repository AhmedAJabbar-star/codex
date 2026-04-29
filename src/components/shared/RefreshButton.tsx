import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  /** مفاتيح إضافية لإبطالها بجانب live-schedule-data */
  extraKeys?: string[][];
  className?: string;
  compact?: boolean;
}

/**
 * زر «تحديث الآن» — يجبر React Query على إبطال جميع استعلامات البيانات الحية
 * وإعادة جلبها فوراً من Google Sheets.
 */
const RefreshButton = ({ extraKeys = [], className = '', compact = false }: Props) => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const keys = [
        ['live-schedule-data'],
        ['individual-assignments'],
        ...extraKeys,
      ];
      // إبطال + إعادة جلب فوري لجميع المفاتيح المعنية
      await Promise.all(
        keys.map((k) =>
          queryClient.invalidateQueries({ queryKey: k, refetchType: 'active' }),
        ),
      );
      setLastRefresh(new Date());
      toast.success('تم تحديث البيانات من Google Sheets', { duration: 2000 });
    } catch (err) {
      toast.error('تعذر تحديث البيانات، حاول مجدداً');
    } finally {
      setRefreshing(false);
    }
  };

  const timeLabel = lastRefresh
    ? lastRefresh.toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="schedule-btn"
        style={{
          minHeight: compact ? 36 : 40,
          padding: compact ? '6px 12px' : '8px 16px',
          borderRadius: 999,
          background: refreshing ? '#94a3b8' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          color: '#fff',
          fontWeight: 800,
          border: 'none',
          cursor: refreshing ? 'wait' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
        title="جلب أحدث البيانات من Google Sheets فوراً"
      >
        <span
          style={{
            display: 'inline-block',
            transition: 'transform 0.6s',
            transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)',
          }}
        >
          🔄
        </span>
        {refreshing ? 'جارٍ التحديث...' : 'تحديث الآن'}
      </button>
      {timeLabel && !refreshing && (
        <span className="text-[11px] font-bold text-[var(--schedule-muted)] hidden sm:inline">
          آخر تحديث: {timeLabel}
        </span>
      )}
    </div>
  );
};

export default RefreshButton;
