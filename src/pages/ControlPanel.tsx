import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SYSTEMS_REGISTRY, getRules, setRules, syncRulesFromRemote, type SystemAccessRule } from '@/lib/systemAccess';

const ControlPanel = () => {
  const [rules, setLocalRules] = useState<Record<string, SystemAccessRule>>(() => getRules());
  const [isSaving, setIsSaving] = useState(false);
  const saving = isSaving;
  const navigate = useNavigate();

  useEffect(() => {
    void syncRulesFromRemote().then((remoteRules) => setLocalRules(remoteRules));
  }, []);

  const systems = useMemo(() => SYSTEMS_REGISTRY.filter((s) => s.id !== 'controlPanel'), []);

  const update = (id: string, patch: Partial<SystemAccessRule>) => {
    setLocalRules((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await setRules(rules);
      toast.success('تم حفظ إعدادات لوحة التحكم بنجاح وتطبيقها على جميع المستخدمين');
    } catch (error) {
      toast.error((error as Error).message || 'فشل حفظ الإعدادات على الخادم');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-5xl mx-auto my-6 px-4">
        <div className="schedule-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl font-black">لوحة التحكم</h1>
            <button className="schedule-btn" onClick={() => navigate('/')}>🏠 الرئيسية</button>
          </div>
          <p className="text-sm font-semibold text-[var(--schedule-muted)] mb-6">إظهار/إخفاء الأنظمة والتحكم بكلمة المرور لكل نظام.</p>
          <div className="space-y-4">
            {systems.map((s) => {
              const r = rules[s.id];
              return (
                <div key={s.id} className="border rounded-xl p-4 bg-white/70">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{s.title}</strong>
                    <span className="text-xs text-[var(--schedule-muted)]">{s.path}</span>
                  </div>
                  <div className="mt-3 grid md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={r.visible} onChange={(e) => update(s.id, { visible: e.target.checked })} /> إظهار النظام
                    </label>
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={r.protected} onChange={(e) => update(s.id, { protected: e.target.checked })} /> حماية بكلمة سر
                    </label>
                    <input
                      className="schedule-select w-full"
                      type="text"
                      placeholder="كلمة المرور"
                      value={r.password}
                      onChange={(e) => update(s.id, { password: e.target.value })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <button className="schedule-btn schedule-btn-primary" onClick={save} disabled={saving}>{saving ? '⏳ جاري الحفظ...' : '💾 حفظ الإعدادات'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
