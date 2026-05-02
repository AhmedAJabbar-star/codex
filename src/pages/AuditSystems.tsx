import { useState } from 'react';
import { toast } from 'sonner';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { useLiveSystems } from '@/hooks/useLiveSchedule';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';

const AUDIT_PASSWORD = '2021';

const AuditSystemsPage = () => {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const auditIds = ['report', 'hours', 'lectureTypeAudit', 'assignmentsAudit'];
  const { systemsOverride, error, isLoading } = useLiveSystems(auditIds);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === AUDIT_PASSWORD) {
      setAuthenticated(true);
      toast.success('تم الدخول بنجاح');
    } else {
      toast.error('كلمة المرور غير صحيحة');
      setPassword('');
    }
  };

  if (!authenticated) {
    return (
      <div className="schedule-body flex items-center justify-center min-h-screen" dir="rtl">
        <div className="schedule-card" style={{ maxWidth: 420, width: '90%', padding: '32px' }}>
          <form onSubmit={handleLogin} className="flex flex-col items-center gap-5 text-center">
            <div className="text-5xl">🔒</div>
            <h2 className="text-xl font-black text-[var(--schedule-text)]">أنظمة التدقيق</h2>
            <p className="text-sm font-semibold text-[var(--schedule-muted)]">يرجى إدخال كلمة المرور للدخول</p>
            <input
              type="password"
              className="schedule-select w-full text-center"
              style={{ minHeight: 52, fontSize: 16, letterSpacing: 4 }}
              placeholder="كلمة المرور"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            <button type="submit" className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 48 }}>
              🔓 دخول
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading && !systemsOverride) return <LiveLoadingShell />;
  if (error || !systemsOverride) return <LiveLoadingShell error={error} />;

  return <SingleSystemPage systemIds={auditIds} systemsOverride={systemsOverride} />;
};

export default AuditSystemsPage;
