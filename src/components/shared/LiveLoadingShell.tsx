interface Props {
  error?: unknown;
}

export const LiveLoadingShell = ({ error }: Props) => {
  const isError = !!error;
  const message = isError
    ? error instanceof Error
      ? error.message
      : 'تعذر تحميل البيانات من Google Sheets'
    : 'جاري التحميل...';

  return (
    <div className="schedule-body min-h-screen flex items-center justify-center px-4" dir="rtl">
      <div className="schedule-card max-w-xl w-full text-center" style={{ padding: 32 }}>
        <div className="text-4xl mb-4">{isError ? '⚠️' : '⏳'}</div>
        <p className="text-lg font-extrabold text-[var(--schedule-text)]">{message}</p>
      </div>
    </div>
  );
};
