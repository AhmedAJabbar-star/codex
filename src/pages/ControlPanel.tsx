import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SYSTEMS_REGISTRY, getRules, setRules, syncRulesFromRemote,
  getGroups, MANAGER_PASSWORD_ID, DEFAULT_MANAGER_PASSWORD,
  type SystemAccessRule, type SystemGroup,
} from '@/lib/systemAccess';
import { listCustomSystems, type CustomSystemDef } from '@/data/customSystemsRegistry';
import SystemBuilderDialog from '@/components/control-panel/SystemBuilderDialog';

const PRESET_ICONS = ['📦','📚','🗂️','📊','🛡️','🎯','🧭','⚙️','📋','🧪','🎓','📁','🏛️','📈','🧰','🔖'];
const PRESET_COLORS = ['#475569','#0891b2','#16a34a','#dc2626','#7c3aed','#d97706','#0ea5e9','#e11d48','#059669','#a16207'];

const newId = () => `g-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const ControlPanel = () => {
  const [rules, setLocalRules] = useState<Record<string, SystemAccessRule>>(() => getRules());
  const [groups, setGroupsState] = useState<SystemGroup[]>(() => getGroups());
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitial, setBuilderInitial] = useState<CustomSystemDef | null>(null);
  const navigate = useNavigate();

  const { data: customSystems = [], refetch: refetchCustom } = useQuery({
    queryKey: ['custom-systems-list'],
    queryFn: () => listCustomSystems(),
    staleTime: 30_000,
  });

  useEffect(() => {
    void syncRulesFromRemote().then((remoteRules) => {
      setLocalRules(remoteRules);
      setGroupsState(getGroups());
    });
  }, []);

  const systems = useMemo(
    () => SYSTEMS_REGISTRY.filter((s) => s.id !== 'controlPanel' && s.id !== MANAGER_PASSWORD_ID),
    [],
  );
  const managerPw = rules[MANAGER_PASSWORD_ID]?.password ?? DEFAULT_MANAGER_PASSWORD;
  const cpRule = rules.controlPanel || { visible: true, protected: true, password: '2021' };

  const update = (id: string, patch: Partial<SystemAccessRule>) => {
    setLocalRules((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const addGroup = () => {
    setGroupsState((prev) => [
      ...prev,
      { id: newId(), title: 'مجموعة جديدة', description: '', icon: '📦', color: '#475569', systemIds: [] },
    ]);
    toast.info('تمت إضافة مجموعة جديدة. حدد الأنظمة ثم اضغط "حفظ المجموعة".');
  };

  const updateGroup = (id: string, patch: Partial<SystemGroup>) => {
    setGroupsState((prev) => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  };

  const persistAll = async (nextGroups: SystemGroup[], successMsg: string): Promise<boolean> => {
    const password = window.prompt('أدخل كلمة مرور لوحة التحكم لتأكيد العملية:');
    if (password === null) return false;
    setSaving(true);
    try {
      await setRules(rules, password, nextGroups);
      setGroupsState(nextGroups);
      toast.success(successMsg);
      return true;
    } catch (error) {
      toast.error((error as Error).message || 'فشل حفظ الإعدادات');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveGroup = async (id: string) => {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    if (!g.title.trim()) { toast.error('يرجى إدخال اسم المجموعة'); return; }
    if (g.systemIds.length === 0) { toast.error('حدد نظاماً واحداً على الأقل قبل الحفظ'); return; }
    const cleaned = groups
      .map(x => ({ ...x, title: x.title.trim() || 'بدون اسم' }))
      .filter(x => x.systemIds.length > 0);
    await persistAll(cleaned, 'تم حفظ المجموعة وستظهر في الواجهة الرئيسية');
  };

  const deleteGroup = async (id: string) => {
    const g = groups.find(x => x.id === id);
    if (!g) return;
    if (!confirm(`حذف المجموعة "${g.title}"؟ ستعود أنظمتها للظهور بشكل منفرد في الواجهة الرئيسية.`)) return;
    // If the group was never saved (empty), remove locally without server roundtrip.
    if (g.systemIds.length === 0) {
      setGroupsState(prev => prev.filter(x => x.id !== id));
      toast.success('تم حذف المجموعة');
      return;
    }
    const next = groups.filter(x => x.id !== id);
    await persistAll(next, 'تم حذف المجموعة وأعيدت أنظمتها للواجهة');
  };

  const toggleSystemInGroup = (groupId: string, sysId: string) => {
    setGroupsState((prev) => prev.map(g => {
      if (g.id !== groupId) return g;
      const has = g.systemIds.includes(sysId);
      return { ...g, systemIds: has ? g.systemIds.filter(x => x !== sysId) : [...g.systemIds, sysId] };
    }));
  };

  const save = async () => {
    const cleaned = groups
      .map(g => ({ ...g, title: g.title.trim() || 'بدون اسم', systemIds: g.systemIds.filter(Boolean) }))
      .filter(g => g.systemIds.length > 0);
    await persistAll(cleaned, 'تم حفظ الإعدادات بنجاح');
  };

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-5xl mx-auto my-6 px-4">
        <div className="schedule-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl font-black">لوحة التحكم</h1>
            <button className="schedule-btn" onClick={() => navigate('/')}>🏠 الرئيسية</button>
          </div>
          <p className="text-sm font-semibold text-[var(--schedule-muted)] mb-6">إظهار/إخفاء الأنظمة، التحكم بكلمات المرور، وتجميع الأنظمة في مجموعات.</p>

          {/* Control panel password */}
          <div className="border-2 border-amber-400 rounded-xl p-4 bg-amber-50/60 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <strong>🔐 كلمة مرور لوحة التحكم</strong>
              <span className="text-xs text-[var(--schedule-muted)]">تستخدم للدخول إلى لوحة التحكم وتأكيد الحفظ</span>
            </div>
            <input
              className="schedule-select w-full"
              type="text"
              placeholder="كلمة المرور"
              value={cpRule.password}
              onChange={(e) => update('controlPanel', { password: e.target.value, visible: true, protected: true })}
            />
            <p className="text-xs text-[var(--schedule-muted)] mt-2">⚠️ سيتم طلب كلمة المرور الحالية عند الحفظ.</p>
          </div>

          {/* Manager password */}
          <div className="border-2 border-[var(--schedule-primary,#0f4c81)] rounded-xl p-4 bg-blue-50/60 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <strong>🛡️ كلمة مرور المدير (التكليفات الفردية)</strong>
              <span className="text-xs text-[var(--schedule-muted)]">تستخدم لدخول لوحة المدير في صفحة التكليفات الفردية</span>
            </div>
            <input
              className="schedule-select w-full"
              type="text"
              placeholder={`الافتراضي: ${DEFAULT_MANAGER_PASSWORD}`}
              value={managerPw}
              onChange={(e) => update(MANAGER_PASSWORD_ID, { password: e.target.value, visible: true, protected: false })}
            />
          </div>

          {/* Groups manager */}
          <div className="border-2 border-purple-300 rounded-xl p-4 bg-purple-50/40 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <strong>📦 مجموعات الأنظمة</strong>
              <button className="schedule-btn schedule-btn-primary" onClick={addGroup} style={{ minHeight: 36, padding: '6px 14px' }}>
                ➕ إضافة مجموعة
              </button>
            </div>
            <p className="text-xs text-[var(--schedule-muted)] mb-3">
              عند إنشاء مجموعة وإضافة أنظمة إليها، ستظهر في الصفحة الرئيسية كبطاقة واحدة بدل البطاقات المنفردة (مثل أنظمة التدقيق).
            </p>

            {groups.length === 0 && (
              <div className="text-center py-6 text-sm text-[var(--schedule-muted)] font-bold">لا توجد مجموعات حالياً</div>
            )}

            <div className="space-y-4">
              {groups.map(g => (
                <div key={g.id} className="border rounded-xl p-4 bg-white">
                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="schedule-filter-label mb-1">اسم المجموعة</label>
                      <input className="schedule-select w-full" type="text" value={g.title} onChange={e => updateGroup(g.id, { title: e.target.value })} />
                    </div>
                    <div>
                      <label className="schedule-filter-label mb-1">الوصف</label>
                      <input className="schedule-select w-full" type="text" value={g.description} onChange={e => updateGroup(g.id, { description: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="schedule-filter-label mb-1">الأيقونة</label>
                      <div className="flex flex-wrap gap-1">
                        {PRESET_ICONS.map(ic => (
                          <button key={ic} onClick={() => updateGroup(g.id, { icon: ic })}
                            className="w-10 h-10 rounded-lg border text-xl"
                            style={{
                              borderColor: g.icon === ic ? g.color : 'var(--schedule-border)',
                              background: g.icon === ic ? `${g.color}20` : 'white',
                            }}
                          >{ic}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="schedule-filter-label mb-1">اللون</label>
                      <div className="flex flex-wrap gap-1">
                        {PRESET_COLORS.map(c => (
                          <button key={c} onClick={() => updateGroup(g.id, { color: c })}
                            className="w-8 h-8 rounded-full border-2"
                            style={{ background: c, borderColor: g.color === c ? '#111' : 'transparent' }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="schedule-filter-label mb-1">الأنظمة المضمنة ({g.systemIds.length})</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-auto p-2 border rounded-lg bg-slate-50/60">
                      {systems.map(s => {
                        const checked = g.systemIds.includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-xs font-bold cursor-pointer p-1.5 rounded hover:bg-white">
                            <input type="checkbox" checked={checked} onChange={() => toggleSystemInGroup(g.id, s.id)} />
                            <span className="truncate">{s.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button className="schedule-btn schedule-btn-primary" disabled={saving} onClick={() => saveGroup(g.id)} style={{ minHeight: 32, padding: '4px 14px' }}>
                      💾 حفظ المجموعة
                    </button>
                    <button className="schedule-btn" disabled={saving} onClick={() => deleteGroup(g.id)} style={{ minHeight: 32, padding: '4px 12px', color: '#b91c1c' }}>
                      🗑️ حذف المجموعة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Systems Builder */}
          <div className="border-2 border-cyan-300 rounded-xl p-4 bg-cyan-50/40 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <strong>🧩 منشئ الأنظمة (بدون كود)</strong>
              <button
                className="schedule-btn schedule-btn-primary"
                onClick={() => { setBuilderInitial(null); setBuilderOpen(true); }}
                style={{ minHeight: 36, padding: '6px 14px' }}
              >➕ نظام جديد</button>
            </div>
            <p className="text-xs text-[var(--schedule-muted)] mb-3">
              أنشئ نظاماً جديداً بتحديد ورقة المصدر (GID)، أعمدة العرض، فلاتر القوائم، وشروط تصفية الصفوف — يظهر تلقائياً في الواجهة الرئيسية.
            </p>
            {customSystems.length === 0 ? (
              <div className="text-center py-6 text-sm text-[var(--schedule-muted)] font-bold">لا توجد أنظمة مخصّصة بعد</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {customSystems.map((cs) => (
                  <button key={cs.id}
                    onClick={() => { setBuilderInitial(cs); setBuilderOpen(true); }}
                    className="text-right border rounded-lg p-3 bg-white hover:shadow-md transition flex items-center gap-3"
                    style={{ borderColor: `${cs.color}66` }}
                  >
                    <div className="text-2xl">{cs.icon || '📋'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-sm truncate">{cs.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">GID: {cs.sheet_gid} · {cs.columns_range}</div>
                    </div>
                    {cs.enabled === false && <span className="text-[10px] font-black text-amber-600">معطّل</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Per-system visibility/passwords */}
          <div className="space-y-4">
            {systems.map((s) => {
              const r = rules[s.id] as any;
              return (
                <div key={s.id} className="border rounded-xl p-4 bg-white/70">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong>{r.title || s.title}</strong>
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
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-black text-[var(--schedule-accent-blue)]">
                      🎨 تخصيص عرض البطاقة (العنوان/الوصف/الأيقونة/اللون/الترتيب)
                    </summary>
                    <div className="mt-3 grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="schedule-filter-label mb-1">العنوان المعروض</label>
                        <input className="schedule-select w-full" type="text"
                          placeholder={s.title}
                          value={r.title || ''}
                          onChange={(e) => update(s.id, { title: e.target.value } as any)} />
                      </div>
                      <div>
                        <label className="schedule-filter-label mb-1">الوصف</label>
                        <input className="schedule-select w-full" type="text"
                          value={r.description || ''}
                          onChange={(e) => update(s.id, { description: e.target.value } as any)} />
                      </div>
                      <div>
                        <label className="schedule-filter-label mb-1">الأيقونة (إيموجي)</label>
                        <input className="schedule-select w-full" type="text"
                          placeholder="مثل: 📋"
                          value={r.icon || ''}
                          onChange={(e) => update(s.id, { icon: e.target.value } as any)} />
                      </div>
                      <div>
                        <label className="schedule-filter-label mb-1">اللون (Hex)</label>
                        <div className="flex items-center gap-2">
                          <input type="color"
                            value={(r.color && /^#[0-9a-fA-F]{6}$/.test(r.color)) ? r.color : '#475569'}
                            onChange={(e) => update(s.id, { color: e.target.value } as any)}
                            className="w-12 h-10 rounded border" />
                          <input className="schedule-select flex-1" type="text" placeholder="#475569"
                            value={r.color || ''}
                            onChange={(e) => update(s.id, { color: e.target.value } as any)} />
                        </div>
                      </div>
                      <div>
                        <label className="schedule-filter-label mb-1">ترتيب الظهور (1 = الأول)</label>
                        <input className="schedule-select w-full" type="number" min={1}
                          placeholder="100"
                          value={typeof r.sort_order === 'number' ? r.sort_order : ''}
                          onChange={(e) => update(s.id, { sort_order: e.target.value === '' ? undefined : Number(e.target.value) } as any)} />
                      </div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <button className="schedule-btn schedule-btn-primary" onClick={save} disabled={saving}>
              {saving ? '⏳ جاري الحفظ...' : '💾 حفظ الإعدادات'}
            </button>
          </div>
        </div>
      </div>
      {builderOpen && (
        <SystemBuilderDialog
          initial={builderInitial}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => { void refetchCustom(); }}
        />
      )}
    </div>
  );
};

export default ControlPanel;
