interface Props {
  error?: unknown;
}

export const LiveLoadingShell = ({ error }: Props) => {
  const isError = !!error;
  const message = isError
    ? error instanceof Error
      ? error.message
      : 'تعذر تحميل البيانات'
    : 'جاري التحميل...';

  return (
    <div className="schedule-body min-h-screen flex items-center justify-center px-4" dir="rtl">
      <div className="loader-pro" role="status" aria-live="polite">
        {isError ? (
          <div className="loader-pro__error">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
        ) : (
          <div className="hourglass-pro" aria-hidden="true">
            <div className="hourglass-pro__frame">
              <span className="hourglass-pro__cap hourglass-pro__cap--top" />
              <span className="hourglass-pro__cap hourglass-pro__cap--bottom" />
              <span className="hourglass-pro__sand hourglass-pro__sand--top" />
              <span className="hourglass-pro__sand hourglass-pro__sand--bottom" />
              <span className="hourglass-pro__stream" />
            </div>
          </div>
        )}

        <p className="loader-pro__title">{message}</p>
        {!isError && (
          <div className="loader-pro__skeleton" aria-hidden="true">
            <span /><span /><span />
          </div>
        )}
      </div>
    </div>
  );
};
