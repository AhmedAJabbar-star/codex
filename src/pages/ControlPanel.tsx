import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  SYSTEMS_REGISTRY, getRules, setRules, syncRulesFromRemote,
  getGroups, getBranding, MANAGER_PASSWORD_ID, KEEP_PASSWORD,
  type SystemAccessRule, type SystemGroup, type Branding,
} from '@/lib/systemAccess';

import { listCustomSystems, type CustomSystemDef } from '@/data/customSystemsRegistry';
import SystemBuilderDialog from '@/components/control-panel/SystemBuilderDialog';
import UsersAdminSection from '@/components/control-panel/UsersAdminSection';
import { UI_THEMES, useUiTheme } from '@/lib/uiTheme';
import { useDarkMode } from '@/lib/darkMode';
import { use3DEnabled } from '@/lib/threeD';
import { uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { Users, Palette, ShieldCheck, Boxes, Blocks, LayoutGrid, Image as ImageIcon } from 'lucide-react';

const PRESET_ICONS = ['📦','📚','🗂️','📊','🛡️','🎯','🧭','⚙️','📋','🧪','🎓','📁','🏛️','📈','🧰','🔖','📝','📌','🔔','🗓️','🕒','👨‍🏫','👥','🏫','🧮','🔍','✅','⚠️','🚦','💡','🧾','📑','🗒️','📐','🧱','🔧'];
const PRESET_COLORS = ['#475569','#0891b2','#16a34a','#dc2626','#7c3aed','#d97706','#0ea5e9','#e11d48','#059669','#a16207','#1d4ed8','#9333ea','#0d9488','#be185d','#ea580c','#65a30d'];

const newId = () => `g-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

/** Stored passwords are never sent to the browser; the server returns a sentinel. */
const PW_PLACEHOLDER = '•••••• محفوظة — اكتب كلمة جديدة لتغييرها';
const pwValue = (v?: string) => (v === KEEP_PASSWORD ? '' : (v || ''));


const ControlPanel = () => {
  const [rules, setLocalRules] = useState<Record<string, SystemAccessRule>>(() => getRules());
  const [groups, setGroupsState] = useState<SystemGroup[]>(() => getGroups());
  const [saving, setSaving] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderInitial, setBuilderInitial] = useState<CustomSystemDef | null>(null);
  const [uiTheme, setUi] = useUiTheme();
  const [isDark, setIsDark] = useDarkMode();
  const [is3D, setIs3D] = use3DEnabled();
  const [activeSection, setActiveSection] = useState<'users' | 'appearance' | 'branding' | 'security' | 'groups' | 'builder' | 'systems'>('users');
  const [branding, setBrandingState] = useState<Branding>(() => getBranding());
  const queryClient = useQueryClient();
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
      setBrandingState(getBranding());
    });
  }, []);

  const systems = useMemo(
    () => SYSTEMS_REGISTRY.filter((s) => s.id !== 'controlPanel' && s.id !== MANAGER_PASSWORD_ID),
    [],
  );
  const managerPw = rules[MANAGER_PASSWORD_ID]?.password ?? '';
  const cpRule = rules.controlPanel || { visible: true, protected: true, password: '' };


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
    const password = await uiPrompt({ title: 'تأكيد العملية', message: 'أدخل كلمة مرور لوحة التحكم للمتابعة.', icon: '🔐', password: true, placeholder: 'كلمة المرور', confirmText: 'متابعة' });
    if (password === null) return false;
    setSaving(true);
    try {
      await setRules(rules, password, nextGroups, branding);
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
    if (!(await uiConfirm({ title: 'حذف المجموعة', message: `سيتم حذف المجموعة "${g.title}"، وستعود أنظمتها للظهور بشكل منفرد في الواجهة الرئيسية.`, tone: 'danger', confirmText: 'حذف المجموعة' }))) return;
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
      <div className="relative z-[1] w-full max-w-7xl mx-auto my-6 px-4">
        <div className="schedule-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl font-black">لوحة التحكم</h1>
            <div className="flex flex-wrap gap-2">
              <a
                href="/control-panel-guide.html"
                target="_blank"
                rel="noopener noreferrer"
                className="schedule-btn"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0b2545', fontWeight: 900, border: 0 }}
                title="افتح الدليل في تبويب جديد — يمكنك حفظه PDF أو مشاركة الرابط"
              >📘 دليل لوحة التحكم (PDF / مشاركة)</a>
              <button className="schedule-btn" onClick={() => navigate('/')}>🏠 الرئيسية</button>
            </div>
          </div>
          <p className="text-sm font-semibold text-[var(--schedule-muted)] mb-6">إظهار/إخفاء الأنظمة، التحكم بكلمات المرور، وتجميع الأنظمة في مجموعات.</p>

          <div className="grid lg:grid-cols-[230px_minmax(0,1fr)] gap-5 items-start">
            <nav className="lg:sticky lg:top-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2 rounded-lg border bg-[var(--schedule-card)] p-2" aria-label="أقسام لوحة التحكم">
              {([
                ['users', 'المستخدمون والصلاحيات', Users],
                ['appearance', 'الثيمات والمظهر', Palette],
                ['branding', 'هوية الواجهة (الشعار والاسم)', ImageIcon],
                ['security', 'الأمان وكلمات المرور', ShieldCheck],
                ['groups', 'مجموعات الأنظمة', Boxes],
                ['builder', 'منشئ الأنظمة', Blocks],
                ['systems', 'إدارة الأنظمة', LayoutGrid],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setActiveSection(id)}
                  className={`schedule-btn justify-start gap-2 text-right ${activeSection === id ? 'schedule-btn-primary' : ''}`}>
                  <Icon className="h-4 w-4 shrink-0" /> <span>{label}</span>
                </button>
              ))}
            </nav>
            <main className="min-w-0">

          {activeSection === 'users' && <UsersAdminSection />}

          {/* 🖼️ Global branding */}
          {activeSection === 'branding' && (
          <div className="border-2 border-sky-300 rounded-xl p-4 bg-sky-50/40 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <strong>🖼️ هوية الواجهة — الشعار واسم النظام والبانر</strong>
              <button className="schedule-btn schedule-btn-primary" disabled={saving} onClick={() => void save()} style={{ minHeight: 36, padding: '6px 14px' }}>
                {saving ? '⏳ جاري الحفظ...' : '💾 حفظ هوية الواجهة'}
              </button>
            </div>
            <p className="text-xs text-[var(--schedule-muted)] mb-3">
              تُطبَّق هذه الإعدادات على الواجهة الرئيسية وصفحات المجموعات وصفحات الأنظمة (ما لم يُخصَّص النظام من داخل بطاقته في منشئ الأنظمة).
            </p>

            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="schedule-filter-label mb-1">🏷️ اسم النظام المعروض</label>
                <input className="schedule-select w-full" type="text" value={branding.app_title}
                  placeholder="مثال: الأنظمة الملحقة بنظام الإدارة الاكاديمية"
                  onChange={e => setBrandingState(b => ({ ...b, app_title: e.target.value }))} />
              </div>
              <div>
                <label className="schedule-filter-label mb-1">🏛️ سطر الكلية / الجامعة</label>
                <input className="schedule-select w-full" type="text" value={branding.university_line}
                  placeholder="مثال: كلية الهندسة المدنية - الجامعة التكنولوجية"
                  onChange={e => setBrandingState(b => ({ ...b, university_line: e.target.value }))} />
              </div>
            </div>

            <div className="grid md:grid-cols-[minmax(0,1fr)_160px] gap-3 mb-3">
              <div>
                <label className="schedule-filter-label mb-1">🖼️ رابط الشعار (اتركه فارغاً لاستخدام الشعار الأصلي)</label>
                <input className="schedule-select w-full" type="text" value={branding.logo_url}
                  placeholder="https://.../logo.png"
                  onChange={e => setBrandingState(b => ({ ...b, logo_url: e.target.value }))} />
              </div>
              <div>
                <label className="schedule-filter-label mb-1">📐 حجم الشعار (بكسل)</label>
                <input className="schedule-select w-full" type="number" min={64} max={220} value={branding.logo_size}
                  onChange={e => setBrandingState(b => ({ ...b, logo_size: Math.max(64, Math.min(220, Number(e.target.value) || 112)) }))} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {([
                ['show_banner', '📢 إظهار البانر بالكامل'],
                ['show_logo', '🖼️ إظهار الشعار'],
                ['show_title', '🏷️ إظهار اسم النظام'],
                ['show_university_line', '🏛️ إظهار سطر الكلية'],
              ] as const).map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => setBrandingState(b => ({ ...b, [key]: !b[key] }))}
                  className="rounded-lg px-3 py-2 text-xs font-black border-2 transition-all"
                  style={{
                    background: branding[key] ? 'linear-gradient(135deg,#0f4c81,#1e3a5f)' : '#e2e8f0',
                    color: branding[key] ? '#fff' : '#0f172a',
                    borderColor: branding[key] ? '#0b2545' : '#94a3b8',
                  }}>
                  {branding[key] ? '✓ ' : '✗ '}{label}
                </button>
              ))}
            </div>

            <div className="rounded-xl border-2 border-dashed p-4 bg-white text-center">
              <div className="text-[11px] font-black text-[var(--schedule-muted)] mb-2">معاينة</div>
              {branding.show_banner ? (
                <div className="flex flex-col items-center gap-2">
                  {branding.show_logo && (
                    <img src={branding.logo_url.trim() || '/icon-192.png'} alt="معاينة الشعار"
                      className="object-contain rounded-2xl shadow"
                      style={{ width: branding.logo_size, height: branding.logo_size }} />
                  )}
                  {branding.show_university_line && <p className="font-extrabold text-[13px] text-[var(--schedule-accent-blue)] m-0">{branding.university_line}</p>}
                  {branding.show_title && <h2 className="m-0 text-xl font-black">{branding.app_title}</h2>}
                </div>
              ) : (
                <div className="text-sm font-bold text-[var(--schedule-muted)]">البانر مخفي — ستبدأ الصفحة بالبطاقات مباشرة</div>
              )}
            </div>
          </div>
          )}

          {/* UI Theme picker */}
          {activeSection === 'appearance' && (
          <div className="border-2 border-indigo-300 rounded-xl p-4 bg-indigo-50/40 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <strong>🎨 نمط تصميم الواجهة (10 ثيمات احترافية بمستوى جامعي رسمي)</strong>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setIs3D(!is3D); toast.success(is3D ? 'تم إطفاء التأثير ثلاثي الأبعاد' : 'تم تفعيل التأثير ثلاثي الأبعاد'); }}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black border-2 transition-all hover:scale-105"
                  style={{
                    background: is3D ? 'linear-gradient(135deg,#0b2545,#1e3a5f)' : 'linear-gradient(135deg,#e2e8f0,#cbd5e1)',
                    color: is3D ? '#f7e6b0' : '#0f172a',
                    borderColor: is3D ? '#0b2545' : '#94a3b8',
                  }}
                  title="تشغيل/إطفاء التأثير ثلاثي الأبعاد على جميع البطاقات"
                >
                  {is3D ? '🟢 3D مُفعَّل' : '⚪ 3D مطفأ'}
                </button>
                <button
                  onClick={() => { setIsDark(!isDark); toast.success(isDark ? 'تم تفعيل الوضع النهاري' : 'تم تفعيل الوضع الليلي'); }}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black border-2 transition-all hover:scale-105"
                  style={{
                    background: isDark ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : 'linear-gradient(135deg,#1e293b,#334155)',
                    color: isDark ? '#1e293b' : '#fff',
                    borderColor: isDark ? '#d97706' : '#0f172a',
                  }}
                >
                  {isDark ? '☀️ نهاري' : '🌙 ليلي'}
                </button>
              </div>
            </div>
            <p className="text-xs text-[var(--schedule-muted)] mb-2">ثيمات بألوان جامعية رسمية. الوضع الليلي وزر الـ 3D يعملان مع جميع الثيمات.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {UI_THEMES.map(t => {
                const active = uiTheme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setUi(t.id); toast.success(`تم تفعيل: ${t.label}`); }}
                    className="text-right p-4 rounded-xl border-2 transition-all hover:scale-[1.01]"
                    style={{
                      borderColor: active ? '#4f46e5' : 'var(--schedule-border)',
                      background: active ? 'rgba(79,70,229,.08)' : 'white',
                      boxShadow: active ? '0 8px 22px -10px rgba(79,70,229,.4)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 rounded-lg flex-shrink-0" style={{ background: t.swatch }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm">{t.label}</div>
                        {active && <div className="text-[10px] font-bold text-indigo-700 mt-0.5">✓ مُفعَّل حالياً</div>}
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-[var(--schedule-muted)] leading-relaxed m-0">{t.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
          )}




          {/* Control panel password */}
          {activeSection === 'security' && <>
          <div className="border-2 border-amber-400 rounded-xl p-4 bg-amber-50/60 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <strong>🔐 كلمة مرور لوحة التحكم</strong>
              <span className="text-xs text-[var(--schedule-muted)]">تستخدم للدخول إلى لوحة التحكم وتأكيد الحفظ</span>
            </div>
            <input
              className="schedule-select w-full"
              type="text"
              placeholder={PW_PLACEHOLDER}
              value={pwValue(cpRule.password)}
              onChange={(e) => update('controlPanel', { password: e.target.value, visible: true, protected: true })}
            />
            <p className="text-xs text-[var(--schedule-muted)] mt-2">⚠️ سيتم طلب كلمة المرور الحالية عند الحفظ. لا تُعرض كلمات المرور المحفوظة لأسباب أمنية.</p>
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
              placeholder={PW_PLACEHOLDER}
              value={pwValue(managerPw)}
              onChange={(e) => update(MANAGER_PASSWORD_ID, { password: e.target.value, visible: true, protected: false })}
            />
          </div>
          </>}


          {/* Groups manager */}
          {activeSection === 'groups' && (
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
          )}

          {/* Custom Systems Builder */}
          {activeSection === 'builder' && (
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
                  <div key={cs.id}
                    className="text-right border rounded-lg p-3 bg-white hover:shadow-md transition flex items-center gap-2"
                    style={{ borderColor: `${cs.color}66` }}
                  >
                    <button
                      onClick={() => { setBuilderInitial(cs); setBuilderOpen(true); }}
                      className="flex-1 flex items-center gap-3 text-right min-w-0"
                    >
                      <div className="text-2xl">{cs.icon || '📋'}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm truncate">{cs.title}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          GID: {cs.sheet_gid} · {cs.columns_range}
                          {cs.sheet_source === 'external' ? ' · 🌐 خارجي' : ''}
                          {cs.require_teacher_auth ? ' · 🔐 تدريسي' : ''}
                        </div>
                      </div>
                      {cs.enabled === false && <span className="text-[10px] font-black text-amber-600">معطّل</span>}
                    </button>
                    <button
                      onClick={() => {
                        const copy: CustomSystemDef = { ...cs, id: '', title: `${cs.title} (نسخة)` };
                        setBuilderInitial(copy);
                        setBuilderOpen(true);
                        toast.info('تم تجهيز نسخة من النظام — عدّل العنوان ثم احفظ كنظام جديد.');
                      }}
                      title="إنشاء نسخة من هذا النظام"
                      className="text-lg px-2 py-1 rounded border hover:bg-slate-100"
                    >📄</button>
                  </div>
                ))}
              </div>

            )}
          </div>
          )}

          {/* Per-system visibility/passwords */}
          {activeSection === 'systems' && <>
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
                      placeholder={PW_PLACEHOLDER}
                      value={pwValue(r.password)}
                      onChange={(e) => update(s.id, { password: e.target.value })}
                    />

                  </div>
                  <label className="mt-3 flex items-start gap-2 text-sm font-bold border-2 border-amber-300 rounded-lg p-2 bg-amber-50/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!r.require_teacher_auth}
                      onChange={(e) => update(s.id, { require_teacher_auth: e.target.checked } as any)}
                    />
                    <span>
                      🔐 اشتراط دخول التدريسي (كما في «التكليفات الفردية»)
                      <span className="block text-[11px] font-normal text-slate-600 mt-1">
                        عند التفعيل: يجب على التدريسي اختيار اسمه وكتابة كلمة مروره من التكليفات الفردية للوصول إلى هذا النظام.
                      </span>
                    </span>
                  </label>

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
                        <label className="schedule-filter-label mb-1">الأيقونة</label>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {PRESET_ICONS.map(ic => (
                            <button key={ic} type="button" onClick={() => update(s.id, { icon: ic } as any)}
                              className="w-10 h-10 rounded-lg border text-xl"
                              style={{
                                borderColor: r.icon === ic ? (r.color || '#475569') : 'var(--schedule-border)',
                                background: r.icon === ic ? `${r.color || '#475569'}20` : 'white',
                              }}
                            >{ic}</button>
                          ))}
                        </div>
                        <input className="schedule-select w-full" type="text"
                          placeholder="أو أدخل إيموجي مخصّص"
                          value={r.icon || ''}
                          onChange={(e) => update(s.id, { icon: e.target.value } as any)} />
                      </div>
                      <div>
                        <label className="schedule-filter-label mb-1">اللون</label>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {PRESET_COLORS.map(c => (
                            <button key={c} type="button" onClick={() => update(s.id, { color: c } as any)}
                              className="w-8 h-8 rounded-full border-2"
                              style={{ background: c, borderColor: r.color === c ? '#111' : 'transparent' }}
                              title={c}
                            />
                          ))}
                        </div>
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
          </>}
            </main>
          </div>
        </div>
      </div>
      {builderOpen && (
        <SystemBuilderDialog
          initial={builderInitial}
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ['custom-systems-list'] });
            void refetchCustom();
          }}
        />
      )}
    </div>
  );
};

export default ControlPanel;
