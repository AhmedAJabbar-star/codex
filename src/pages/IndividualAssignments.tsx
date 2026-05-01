import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { SYSTEMS, type SystemConfig } from '@/data/scheduleData';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import {
  getSession, setSession, login, logout, refreshMe, changePassword,
  fetchTeacherList, adminListUsers, adminResetPassword, adminCreateUser,
  adminDeleteUser, adminSync, adminArchive,
  type TeacherUser, type AdminUser, type ArchiveEntry,
} from '@/lib/teacherAuth';
import { getGoogleConfig, saveGoogleConfig, type GoogleConfig } from '@/lib/googleConfig';

const Shell = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <div className="schedule-body min-h-screen flex items-center justify-center px-4 py-8" dir="rtl">
    <div className="schedule-card w-full" style={{ maxWidth: 520, padding: 32 }}>
      {title && <h2 className="text-xl font-black text-center mb-5 text-[var(--schedule-text)]">{title}</h2>}
      {children}
    </div>
  </div>
);

/* ---------------- Login Screen ---------------- */
const LoginScreen = ({ onLoggedIn }: { onLoggedIn: (u: TeacherUser) => void }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['teacher-users-list'],
    queryFn: fetchTeacherList,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return users;
    return users.filter((u) => u.includes(q));
  }, [users, query]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) { toast.error('يرجى إدخال الاسم وكلمة المرور'); return; }
    setSubmitting(true);
    try {
      const s = await login(name, password);
      toast.success('تم الدخول بنجاح');
      onLoggedIn(s.user);
    } catch (err) {
      toast.error((err as Error).message || 'فشل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell title="📑 التكليفات الفردية - دخول التدريسي">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="relative">
          <label className="block text-sm font-extrabold mb-2 text-[var(--schedule-text)]">اسم التدريسي</label>
          <input
            className="schedule-select w-full text-right"
            style={{ minHeight: 48 }}
            value={name}
            onChange={(e) => { setName(e.target.value); setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={isLoading ? 'جاري تحميل القائمة…' : 'اختر اسمك أو ابحث'}
            autoComplete="off"
          />
          {open && filtered.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-[var(--schedule-border)] rounded-xl shadow-lg max-h-72 overflow-y-auto">
              {filtered.slice(0, 100).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setName(u); setQuery(u); setOpen(false); }}
                  className="w-full text-right px-4 py-2 hover:bg-[var(--schedule-accent-blue)]/10 text-sm font-semibold border-b border-[var(--schedule-border)]/50 last:border-0"
                >
                  {u}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-extrabold mb-2 text-[var(--schedule-text)]">كلمة المرور</label>
          <input
            type="password"
            className="schedule-select w-full text-center"
            style={{ minHeight: 48, letterSpacing: 4 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="كلمة المرور"
          />
          <p className="text-xs font-semibold text-[var(--schedule-muted)] mt-2">
            كلمة المرور الافتراضية للجميع: <strong>123</strong> (عدا المدير)
          </p>
        </div>

        <button type="submit" disabled={submitting} className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 48 }}>
          {submitting ? '⏳ جاري الدخول…' : '🔓 دخول'}
        </button>
      </form>
    </Shell>
  );
};

/* ---------------- Force Change Password ---------------- */
const ForceChangePassword = ({ onDone, isInitial = true }: { onDone: () => void; isInitial?: boolean }) => {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 3) { toast.error('كلمة المرور قصيرة جداً (3 أحرف على الأقل)'); return; }
    if (newPw !== confirm) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    setSubmitting(true);
    try {
      await changePassword(oldPw, newPw);
      toast.success('تم تغيير كلمة المرور بنجاح');
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setSubmitting(false); }
  };

  return (
    <Shell title={isInitial ? '🔐 يرجى تغيير كلمة المرور الافتراضية' : '🔐 تغيير كلمة المرور'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-extrabold mb-2">كلمة المرور الحالية</label>
          <input type="password" className="schedule-select w-full text-center" style={{ minHeight: 44 }}
            value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-extrabold mb-2">كلمة المرور الجديدة</label>
          <input type="password" className="schedule-select w-full text-center" style={{ minHeight: 44 }}
            value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-extrabold mb-2">تأكيد كلمة المرور الجديدة</label>
          <input type="password" className="schedule-select w-full text-center" style={{ minHeight: 44 }}
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button type="submit" disabled={submitting} className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 46 }}>
          {submitting ? '⏳…' : '✓ حفظ'}
        </button>
      </form>
    </Shell>
  );
};

/* ---------------- Admin Panel ---------------- */
const AdminPanel = ({ admin, onLogout, onChangePw }: { admin: TeacherUser; onLogout: () => void; onChangePw: () => void }) => {
  const qc = useQueryClient();
  const { data: users = [], refetch: refetchUsers, isLoading: loadingUsers } =
    useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers });
  const { data: archive = [], refetch: refetchArchive } =
    useQuery({ queryKey: ['admin-archive'], queryFn: adminArchive });

  const [tab, setTab] = useState<'users' | 'archive' | 'add' | 'settings'>('users');
  const [googleCfg, setGoogleCfg] = useState<GoogleConfig>(() => getGoogleConfig());
  const [search, setSearch] = useState('');
  const [newU, setNewU] = useState({ full_name: '', department: '', college: '', role: 'user' as 'user' | 'admin', password: '' });

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return users;
    return users.filter((u) => u.full_name.includes(q) || (u.department || '').includes(q));
  }, [users, search]);

  const handleReset = async (u: AdminUser) => {
    if (!confirm(`إعادة تعيين كلمة مرور "${u.full_name}" إلى 123؟`)) return;
    try {
      await adminResetPassword(u.id);
      toast.success(`تم. كلمة المرور الجديدة: 123`);
      refetchArchive();
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleDelete = async (u: AdminUser) => {
    if (!confirm(`حذف المستخدم "${u.full_name}" نهائياً؟`)) return;
    try {
      await adminDeleteUser(u.id);
      toast.success('تم الحذف');
      refetchUsers();
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleSync = async () => {
    try {
      const r = await adminSync();
      toast.success(`تم. أُضيف ${r.added} مستخدم جديد. الإجمالي: ${r.total}`);
      refetchUsers(); refetchArchive();
      qc.invalidateQueries({ queryKey: ['teacher-users-list'] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newU.full_name.trim()) { toast.error('الاسم مطلوب'); return; }
    try {
      const r = await adminCreateUser({ ...newU, password: newU.password || '123' });
      toast.success(`تم إنشاء المستخدم. كلمة المرور: ${r.password}`);
      setNewU({ full_name: '', department: '', college: '', role: 'user', password: '' });
      refetchUsers(); refetchArchive();
      setTab('users');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-7xl mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card">
          <header className="schedule-header">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-black text-[var(--schedule-text)]">🛡️ لوحة المدير - التكليفات الفردية</h1>
                <p className="text-sm font-semibold text-[var(--schedule-muted)] mt-1">مرحباً، {admin.full_name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={handleSync} className="schedule-btn schedule-btn-primary">🔄 مزامنة من الشيت</button>
                <button onClick={onChangePw} className="schedule-btn">🔐 تغيير كلمة مروري</button>
                <button onClick={onLogout} className="schedule-btn">🚪 خروج</button>
              </div>
            </div>
          </header>

          <div className="px-4 sm:px-6 pt-2">
            <div className="flex gap-2 border-b border-[var(--schedule-border)] mb-4">
              {[
                { k: 'users', l: `👥 المستخدمون (${users.length})` },
                { k: 'add', l: '➕ إضافة مستخدم' },
                { k: 'archive', l: `📜 الأرشيف (${archive.length})` },
                { k: 'settings', l: '⚙️ إعدادات الربط' },
              ].map((t) => (
                <button key={t.k} onClick={() => setTab(t.k as any)}
                  className={`px-4 py-2 font-extrabold text-sm border-b-2 transition ${
                    tab === t.k ? 'border-[var(--schedule-accent-blue)] text-[var(--schedule-accent-blue)]' : 'border-transparent text-[var(--schedule-muted)]'
                  }`}>
                  {t.l}
                </button>
              ))}
            </div>

            {tab === 'users' && (
              <>
                <input
                  placeholder="🔍 بحث بالاسم أو القسم…"
                  className="schedule-select w-full mb-3" style={{ minHeight: 42 }}
                  value={search} onChange={(e) => setSearch(e.target.value)}
                />
                <div className="overflow-auto rounded-xl border border-[var(--schedule-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--schedule-accent-blue)]/10 sticky top-0">
                      <tr>
                        <th className="p-2 text-right font-black">الاسم</th>
                        <th className="p-2 text-right font-black">القسم</th>
                        <th className="p-2 text-right font-black">الكلية</th>
                        <th className="p-2 text-center font-black">الصلاحية</th>
                        <th className="p-2 text-center font-black">المصدر</th>
                        <th className="p-2 text-center font-black">حالة الباسورد</th>
                        <th className="p-2 text-center font-black">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingUsers ? (
                        <tr><td colSpan={7} className="text-center p-4">⏳ جاري التحميل…</td></tr>
                      ) : filtered.map((u) => (
                        <tr key={u.id} className="border-t border-[var(--schedule-border)]/40">
                          <td className="p-2 font-bold">{u.full_name}</td>
                          <td className="p-2">{u.department}</td>
                          <td className="p-2">{u.college}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {u.role === 'admin' ? 'مدير' : 'مستخدم'}
                            </span>
                          </td>
                          <td className="p-2 text-center text-xs">{u.is_manual ? 'يدوي' : 'من الشيت'}</td>
                          <td className="p-2 text-center text-xs">
                            {u.must_change_password ? <span className="text-amber-600 font-bold">⚠️ افتراضية</span> : <span className="text-green-700 font-bold">✓ مُغيّرة</span>}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => handleReset(u)} className="schedule-btn text-xs" title="إعادة التعيين إلى 123">🔄</button>
                              {u.full_name !== 'aa' && (
                                <button onClick={() => handleDelete(u)} className="schedule-btn text-xs" title="حذف">🗑️</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {tab === 'add' && (
              <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                <div>
                  <label className="block text-sm font-extrabold mb-1">الاسم الكامل *</label>
                  <input className="schedule-select w-full" value={newU.full_name}
                    onChange={(e) => setNewU({ ...newU, full_name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">القسم</label>
                  <input className="schedule-select w-full" value={newU.department}
                    onChange={(e) => setNewU({ ...newU, department: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">الكلية</label>
                  <input className="schedule-select w-full" value={newU.college}
                    onChange={(e) => setNewU({ ...newU, college: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">الصلاحية</label>
                  <select className="schedule-select w-full" value={newU.role}
                    onChange={(e) => setNewU({ ...newU, role: e.target.value as 'user' | 'admin' })}>
                    <option value="user">مستخدم</option>
                    <option value="admin">مدير</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-extrabold mb-1">كلمة المرور الأولية (اتركها فارغة للافتراضي 123)</label>
                  <input className="schedule-select w-full" value={newU.password}
                    onChange={(e) => setNewU({ ...newU, password: e.target.value })} placeholder="123" />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 44 }}>➕ إنشاء المستخدم</button>
                </div>
              </form>
            )}


            {tab === 'settings' && (
              <form className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl" onSubmit={(e) => { e.preventDefault(); saveGoogleConfig(googleCfg); toast.success('تم حفظ إعدادات الربط'); }}>
                <div className="md:col-span-2">
                  <label className="block text-sm font-extrabold mb-1">Google Sheet ID</label>
                  <input className="schedule-select w-full" value={googleCfg.sheetId} onChange={(e) => setGoogleCfg({ ...googleCfg, sheetId: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">GID التكليفات</label>
                  <input className="schedule-select w-full" value={googleCfg.assignmentsGid} onChange={(e) => setGoogleCfg({ ...googleCfg, assignmentsGid: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">GID users</label>
                  <input className="schedule-select w-full" value={googleCfg.usersGid} onChange={(e) => setGoogleCfg({ ...googleCfg, usersGid: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">GID archive</label>
                  <input className="schedule-select w-full" value={googleCfg.archiveGid} onChange={(e) => setGoogleCfg({ ...googleCfg, archiveGid: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-extrabold mb-1">Service Account Email</label>
                  <input className="schedule-select w-full" value={googleCfg.serviceAccountEmail} onChange={(e) => setGoogleCfg({ ...googleCfg, serviceAccountEmail: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-extrabold mb-1">OAuth Client ID</label>
                  <input className="schedule-select w-full" value={googleCfg.clientId} onChange={(e) => setGoogleCfg({ ...googleCfg, clientId: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <button type="submit" className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 44 }}>💾 حفظ إعدادات الربط</button>
                </div>
              </form>
            )}

            {tab === 'archive' && (
              <div className="overflow-auto rounded-xl border border-[var(--schedule-border)]">
                <table className="w-full text-sm">
                  <thead className="bg-[var(--schedule-accent-blue)]/10 sticky top-0">
                    <tr>
                      <th className="p-2 text-right font-black">التاريخ</th>
                      <th className="p-2 text-right font-black">المستخدم</th>
                      <th className="p-2 text-right font-black">الإجراء</th>
                      <th className="p-2 text-right font-black">المنفّذ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(archive as ArchiveEntry[]).map((a) => {
                      const labels: Record<string, string> = {
                        'self_change': '🔐 تغيير ذاتي',
                        'admin_reset': '🔄 إعادة تعيين بواسطة المدير',
                        'initial_create': '✨ إنشاء أولي (مزامنة)',
                        'admin_create': '➕ إنشاء بواسطة المدير',
                      };
                      return (
                        <tr key={a.id} className="border-t border-[var(--schedule-border)]/40">
                          <td className="p-2 text-xs font-mono">{new Date(a.created_at).toLocaleString('ar-IQ')}</td>
                          <td className="p-2 font-bold">{a.full_name}</td>
                          <td className="p-2">{labels[a.action] || a.action}</td>
                          <td className="p-2">{a.performed_by || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Teacher view (uses SingleSystemPage with overrides) ---------------- */
const TeacherView = ({ user, onLogout, onChangePw }: { user: TeacherUser; onLogout: () => void; onChangePw: () => void }) => {
  const baseSystem = useMemo(() => SYSTEMS.find((s) => s.id === 'assignments'), []);
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['individual-assignments'],
    queryFn: fetchIndividualAssignmentRows,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    retry: 1,
  });

  const systemsOverride = useMemo<SystemConfig[] | undefined>(() => {
    if (!baseSystem || !rows) return undefined;
    const myRows = rows
      .filter((r) => (r['اسم التدريسي'] || '').trim() === user.full_name.trim())
      .map((r) => ({ ...r, 'اسم التدريسي': user.full_name }));
    return [{
      ...baseSystem,
      title: `تكليفاتي - ${user.full_name}`,
      hint: 'حدّد الفصل الدراسي لعرض تكليفاتك.',
      filters: [
        { label: 'الفصل الدراسي', key: 'الفصل الدراسي', control: 'select', matchMode: 'contains', fixedOptions: ['الاول', 'الثاني'] },
      ],
      requiredFilters: ['الفصل الدراسي'],
      rows: myRows,
    }];
  }, [baseSystem, rows, user]);

  if (isLoading && !rows) {
    return <Shell><div className="text-center"><div className="text-4xl mb-3 animate-pulse">⏳</div><p className="font-bold">جاري التحميل…</p></div></Shell>;
  }
  if (error) {
    return <Shell><div className="text-center"><p className="font-bold text-red-600">{(error as Error).message}</p></div></Shell>;
  }
  if (!systemsOverride) return null;

  return (
    <div>
      <div className="fixed top-3 left-3 z-50 flex gap-2">
        <div className="schedule-card flex items-center gap-2 px-3 py-1.5 text-xs font-bold" style={{ background: 'rgba(255,255,255,0.95)' }}>
          <span>👤 {user.full_name}</span>
          <button onClick={onChangePw} className="schedule-btn text-xs" style={{ minHeight: 28 }}>🔐 كلمة المرور</button>
          <button onClick={onLogout} className="schedule-btn text-xs" style={{ minHeight: 28 }}>🚪 خروج</button>
        </div>
      </div>
      <SingleSystemPage systemIds={['assignments']} systemsOverride={systemsOverride} showBackButton={false} />
    </div>
  );
};

/* ---------------- Root page ---------------- */
const IndividualAssignments = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<TeacherUser | null>(() => getSession()?.user || null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [checking, setChecking] = useState(!!user);

  // Validate session on mount
  useEffect(() => {
    if (!user) return;
    refreshMe().then((u) => {
      if (!u) { setUser(null); }
      else setUser(u);
    }).finally(() => setChecking(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (checking) {
    return <Shell><div className="text-center"><div className="text-4xl mb-3 animate-pulse">⏳</div><p className="font-bold">جاري التحقق…</p></div></Shell>;
  }

  if (!user) {
    return <LoginScreen onLoggedIn={(u) => { setUser(u); setShowChangePw(false); }} />;
  }

  // Force change password if must_change_password is true (and not currently in voluntary change)
  if (user.must_change_password && !showChangePw) {
    return <ForceChangePassword isInitial onDone={() => refreshMe().then((u) => u && setUser(u))} />;
  }

  if (showChangePw) {
    return <ForceChangePassword isInitial={false} onDone={() => { refreshMe().then((u) => u && setUser(u)); setShowChangePw(false); }} />;
  }

  if (user.role === 'admin') {
    return <AdminPanel admin={user} onLogout={handleLogout} onChangePw={() => setShowChangePw(true)} />;
  }

  return <TeacherView user={user} onLogout={handleLogout} onChangePw={() => setShowChangePw(true)} />;
};

export default IndividualAssignments;
