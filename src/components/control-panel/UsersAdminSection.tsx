import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  adminListUsers, adminResetPassword, adminCreateUser, adminDeleteUser,
  adminSync, adminArchive, adminTestConnection,
  adminSetRole, adminSetPermissions,
  setConnectionConfig, getConnectionConfig,
  login, getSession, setSession,
  type AdminUser, type ArchiveEntry,
} from '@/lib/teacherAuth';
import { ROLE_LABELS, type AppRole, type UserPermissions } from '@/lib/permissions';
import { listCustomSystems, type CustomSystemDef } from '@/data/customSystemsRegistry';
import { uiConfirm } from '@/lib/ui-dialog';

/**
 * قسم «المستخدمون والصلاحيات» في لوحة التحكم.
 * يدمج: إدارة المستخدمين + الأدوار + التخصيص لكل نظام + الأرشيف + إعدادات الربط.
 * يتطلب دخول المدير (سواء عبر «aa/aa» أو كلمة مرور المدير المخزَّنة).
 */
const UsersAdminSection = () => {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState<boolean>(() => {
    const s = getSession();
    return !!(s?.user && (s.user.role === 'admin'));
  });
  const [pw, setPw] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) return toast.error('أدخل كلمة مرور المدير');
    setLoggingIn(true);
    try {
      await login('__manager__', pw.trim());
      setAuthed(true);
      setPw('');
      toast.success('تم الدخول كمدير');
    } catch (err) {
      toast.error((err as Error).message || 'فشل الدخول');
    } finally { setLoggingIn(false); }
  };

  if (!authed) {
    return (
      <div className="border-2 border-rose-300 rounded-xl p-4 bg-rose-50/40 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <strong>👥 المستخدمون والصلاحيات</strong>
          <span className="text-xs text-[var(--schedule-muted)]">يتطلب دخول المدير</span>
        </div>
        <form onSubmit={doLogin} className="flex flex-wrap items-center gap-2 max-w-xl">
          <input
            type="password"
            className="schedule-select flex-1 min-w-[200px]"
            placeholder="كلمة مرور المدير"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <button type="submit" disabled={loggingIn} className="schedule-btn schedule-btn-primary">
            {loggingIn ? '⏳…' : '🔓 دخول'}
          </button>
        </form>
      </div>
    );
  }

  return <AdminWorkspace onLogout={() => { setSession(null); setAuthed(false); }} />;
};

const AdminWorkspace = ({ onLogout }: { onLogout: () => void }) => {
  const qc = useQueryClient();
  const { data: users = [], refetch: refetchUsers, isLoading } =
    useQuery({ queryKey: ['admin-users'], queryFn: adminListUsers });
  const { data: archive = [], refetch: refetchArchive } =
    useQuery({ queryKey: ['admin-archive'], queryFn: adminArchive });
  const { data: customSystems = [] } =
    useQuery({ queryKey: ['custom-systems-list'], queryFn: listCustomSystems, staleTime: 60_000 });

  const [tab, setTab] = useState<'users' | 'archive' | 'add' | 'connection'>('users');
  const [search, setSearch] = useState('');
  const [permTarget, setPermTarget] = useState<AdminUser | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return users;
    return users.filter((u) => u.full_name.includes(q) || (u.department || '').includes(q));
  }, [users, search]);

  const refresh = () => {
    refetchUsers(); refetchArchive();
    qc.invalidateQueries({ queryKey: ['teacher-users-list'] });
  };

  return (
    <div className="border-2 border-rose-300 rounded-xl p-4 bg-rose-50/30 mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <strong>👥 المستخدمون والصلاحيات</strong>
        <button onClick={onLogout} className="schedule-btn text-xs">🚪 خروج المدير</button>
      </div>

      <div className="flex gap-2 border-b border-[var(--schedule-border)] mb-3 flex-wrap">
        {[
          { k: 'users', l: `👥 المستخدمون (${users.length})` },
          { k: 'add', l: '➕ إضافة' },
          { k: 'archive', l: `📜 الأرشيف (${archive.length})` },
          { k: 'connection', l: '⚙️ الربط' },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`px-3 py-1.5 font-extrabold text-xs border-b-2 transition ${
              tab === t.k ? 'border-[var(--schedule-accent-blue)] text-[var(--schedule-accent-blue)]' : 'border-transparent text-[var(--schedule-muted)]'
            }`}>{t.l}</button>
        ))}
      </div>

      {tab === 'users' && (
        <UsersTab
          users={filtered}
          isLoading={isLoading}
          search={search}
          setSearch={setSearch}
          onChanged={refresh}
          onOpenPerms={setPermTarget}
          customSystems={customSystems}
        />
      )}
      {tab === 'add' && <AddUserTab onAdded={() => { refresh(); }} />}
      {tab === 'archive' && <ArchiveTab archive={archive as ArchiveEntry[]} />}
      {tab === 'connection' && <ConnectionTab onChanged={refresh} />}

      {permTarget && (
        <PermissionsDialog
          user={permTarget}
          systems={customSystems}
          onClose={() => setPermTarget(null)}
          onSaved={() => { setPermTarget(null); refresh(); }}
        />
      )}
    </div>
  );
};

/* ---------- Users tab ---------- */
const UsersTab = ({ users, isLoading, search, setSearch, onChanged, onOpenPerms, customSystems }: {
  users: AdminUser[]; isLoading: boolean; search: string; setSearch: (s: string) => void;
  onChanged: () => void; onOpenPerms: (u: AdminUser) => void; customSystems: CustomSystemDef[];
}) => {
  const handleReset = async (u: AdminUser) => {
    if (!(await uiConfirm({ title: 'إعادة تعيين كلمة المرور', message: `سيتم إرجاع كلمة مرور "${u.full_name}" إلى القيمة الافتراضية 123.`, icon: '🔑', confirmText: 'إعادة التعيين' }))) return;
    try { await adminResetPassword(u.id); toast.success('تم. كلمة المرور الجديدة: 123'); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleDelete = async (u: AdminUser) => {
    if (!(await uiConfirm({ title: 'حذف المستخدم', message: `سيتم حذف "${u.full_name}" نهائياً ولا يمكن التراجع عن هذا الإجراء.`, tone: 'danger', confirmText: 'حذف نهائي' }))) return;
    try { await adminDeleteUser(u.id); toast.success('تم الحذف'); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleSetRole = async (u: AdminUser, role: AppRole) => {
    try { await adminSetRole(u.id, role); toast.success(`تم تعيين الدور: ${ROLE_LABELS[role]}`); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const handleSync = async () => {
    try { const r = await adminSync(); toast.success(`تم. أُضيف ${r.added} مستخدم. الإجمالي: ${r.total}`); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          placeholder="🔍 بحث بالاسم أو القسم…"
          className="schedule-select flex-1 min-w-[200px]" style={{ minHeight: 38 }}
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={handleSync} className="schedule-btn schedule-btn-primary text-xs">🔄 مزامنة من الشيت</button>
      </div>
      <div className="overflow-auto rounded-xl border border-[var(--schedule-border)] bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[var(--schedule-accent-blue)]/10 sticky top-0">
            <tr>
              <th className="p-2 text-right font-black">الاسم</th>
              <th className="p-2 text-right font-black">القسم</th>
              <th className="p-2 text-center font-black">الدور</th>
              <th className="p-2 text-center font-black">صلاحيات مخصّصة</th>
              <th className="p-2 text-center font-black">الباسورد</th>
              <th className="p-2 text-center font-black">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center p-4">⏳ جاري التحميل…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-4 text-slate-400">لا يوجد مستخدمون.</td></tr>
            ) : users.map((u) => {
              const sysCount = Object.keys((u as any).permissions?.systems || {}).length;
              const isProtected = u.full_name === 'aa';
              return (
                <tr key={u.id} className="border-t border-[var(--schedule-border)]/40">
                  <td className="p-2 font-bold">{u.full_name}</td>
                  <td className="p-2">{u.department}</td>
                  <td className="p-2 text-center">
                    <select
                      className="schedule-select text-xs"
                      value={u.role}
                      disabled={isProtected}
                      onChange={(e) => handleSetRole(u, e.target.value as AppRole)}
                      style={{ minHeight: 30, padding: '2px 6px' }}
                    >
                      <option value="admin">{ROLE_LABELS.admin}</option>
                      <option value="editor">{ROLE_LABELS.editor}</option>
                      <option value="viewer">{ROLE_LABELS.viewer}</option>
                      <option value="user">{ROLE_LABELS.user}</option>
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => onOpenPerms(u)}
                      disabled={customSystems.length === 0}
                      className="schedule-btn text-xs"
                      style={{ minHeight: 28, padding: '2px 10px' }}
                      title="تخصيص الصلاحيات لكل نظام"
                    >🎯 {sysCount > 0 ? `${sysCount} نظام` : 'تخصيص'}</button>
                  </td>
                  <td className="p-2 text-center text-xs">
                    {u.must_change_password ? <span className="text-amber-600 font-bold">⚠️ افتراضية</span> : <span className="text-green-700">✓</span>}
                  </td>
                  <td className="p-2 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => handleReset(u)} className="schedule-btn text-xs" title="إعادة تعيين إلى 123">🔄</button>
                      {!isProtected && (
                        <button onClick={() => handleDelete(u)} className="schedule-btn text-xs" title="حذف">🗑️</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

/* ---------- Add user tab ---------- */
const AddUserTab = ({ onAdded }: { onAdded: () => void }) => {
  const [u, setU] = useState({ full_name: '', department: '', college: '', role: 'user' as AppRole, password: '' });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.full_name.trim()) return toast.error('الاسم مطلوب');
    try {
      const r = await adminCreateUser({ ...u, password: u.password || '123' });
      toast.success(`تم إنشاء المستخدم. كلمة المرور: ${r.password}`);
      setU({ full_name: '', department: '', college: '', role: 'user', password: '' });
      onAdded();
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
      <input className="schedule-select" placeholder="الاسم الكامل *" value={u.full_name} onChange={(e) => setU({ ...u, full_name: e.target.value })} />
      <input className="schedule-select" placeholder="القسم" value={u.department} onChange={(e) => setU({ ...u, department: e.target.value })} />
      <input className="schedule-select" placeholder="الكلية" value={u.college} onChange={(e) => setU({ ...u, college: e.target.value })} />
      <select className="schedule-select" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value as AppRole })}>
        <option value="user">{ROLE_LABELS.user}</option>
        <option value="viewer">{ROLE_LABELS.viewer}</option>
        <option value="editor">{ROLE_LABELS.editor}</option>
        <option value="admin">{ROLE_LABELS.admin}</option>
      </select>
      <input className="schedule-select md:col-span-2" placeholder="كلمة المرور الأولية (123)" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
      <button type="submit" className="schedule-btn schedule-btn-primary md:col-span-2" style={{ minHeight: 42 }}>➕ إنشاء المستخدم</button>
    </form>
  );
};

/* ---------- Archive tab ---------- */
const ArchiveTab = ({ archive }: { archive: ArchiveEntry[] }) => {
  const labels: Record<string, string> = {
    self_change: '🔐 تغيير ذاتي', admin_reset: '🔄 إعادة تعيين بواسطة المدير',
    initial_create: '✨ إنشاء أولي (مزامنة)', admin_create: '➕ إنشاء بواسطة المدير',
    admin_delete: '🗑️ حذف', admin_set_role: '🛡️ تغيير الدور', admin_set_permissions: '🎯 تعديل الصلاحيات',
  };
  return (
    <div className="overflow-auto rounded-xl border border-[var(--schedule-border)] bg-white" style={{ maxHeight: 360 }}>
      <table className="w-full text-xs">
        <thead className="bg-[var(--schedule-accent-blue)]/10 sticky top-0">
          <tr>
            <th className="p-2 text-right font-black">التاريخ</th>
            <th className="p-2 text-right font-black">المستخدم</th>
            <th className="p-2 text-right font-black">الإجراء</th>
            <th className="p-2 text-right font-black">المنفّذ</th>
          </tr>
        </thead>
        <tbody>
          {archive.map((a) => (
            <tr key={a.id} className="border-t border-[var(--schedule-border)]/40">
              <td className="p-2 font-mono text-[11px]">{new Date(a.created_at).toLocaleString('ar-IQ')}</td>
              <td className="p-2 font-bold">{a.full_name}</td>
              <td className="p-2">{labels[a.action] || a.action}</td>
              <td className="p-2">{a.performed_by || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ---------- Connection tab ---------- */
const ConnectionTab = ({ onChanged }: { onChanged: () => void }) => {
  const [testing, setTesting] = useState(false);
  const [conn, setConn] = useState(() => {
    const c = getConnectionConfig();
    return { sheet_id: c?.sheet_id || '', service_account_json: c?.service_account_json || '', assignments_csv: c?.assignments_csv || '' };
  });
  const save = () => {
    if (!conn.sheet_id.trim() || !conn.service_account_json.trim()) { toast.error('يرجى إدخال Google Sheet ID و Service Account JSON'); return false; }
    setConnectionConfig({ sheet_id: conn.sheet_id.trim(), service_account_json: conn.service_account_json.trim(), assignments_csv: conn.assignments_csv.trim() || undefined });
    toast.success('تم حفظ إعدادات الربط');
    return true;
  };
  const test = async () => {
    if (!save()) return;
    setTesting(true);
    try {
      const r = await adminTestConnection();
      toast.success(`الربط يعمل. المستخدمون: ${r.users}، أضيف: ${r.added}، حُذف المكرر: ${r.removedDuplicates}`);
      onChanged();
    } catch (e) { toast.error((e as Error).message); }
    finally { setTesting(false); }
  };
  return (
    <div className="grid gap-2 max-w-3xl">
      <input className="schedule-select w-full text-left" dir="ltr" placeholder="Google Sheet ID" value={conn.sheet_id} onChange={(e) => setConn({ ...conn, sheet_id: e.target.value })} />
      <textarea className="schedule-select w-full text-left" dir="ltr" rows={4} placeholder="Google Service Account JSON" value={conn.service_account_json} onChange={(e) => setConn({ ...conn, service_account_json: e.target.value })} />
      <input className="schedule-select w-full text-left" dir="ltr" placeholder="Assignments CSV URL (اختياري)" value={conn.assignments_csv} onChange={(e) => setConn({ ...conn, assignments_csv: e.target.value })} />
      <div className="flex gap-2">
        <button onClick={save} className="schedule-btn">💾 حفظ</button>
        <button onClick={test} disabled={testing} className="schedule-btn schedule-btn-primary">{testing ? '⏳…' : '✅ اختبار الربط'}</button>
      </div>
    </div>
  );
};

/* ---------- Permissions dialog ---------- */
const PermissionsDialog = ({ user, systems, onClose, onSaved }: {
  user: AdminUser; systems: CustomSystemDef[]; onClose: () => void; onSaved: () => void;
}) => {
  const [perms, setPerms] = useState<UserPermissions>(
    () => (((user as any).permissions as UserPermissions) || { systems: {} })
  );
  const [busy, setBusy] = useState(false);

  const togglePerm = (sysId: string, key: 'view' | 'add' | 'edit' | 'delete') => {
    setPerms((p) => {
      const sys = { ...(p.systems || {}) };
      const cur = { ...(sys[sysId] || {}) } as Record<string, boolean>;
      cur[key] = !cur[key];
      sys[sysId] = cur;
      return { ...p, systems: sys };
    });
  };
  const clearSystem = (sysId: string) => {
    setPerms((p) => {
      const sys = { ...(p.systems || {}) };
      delete sys[sysId];
      return { ...p, systems: sys };
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      await adminSetPermissions(user.id, perms);
      toast.success('تم حفظ الصلاحيات');
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3" dir="rtl" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="px-5 py-4 bg-gradient-to-l from-rose-500 to-rose-700 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-black">🎯 صلاحيات «{user.full_name}» لكل نظام</h3>
            <p className="text-[11px] opacity-90">الدور: {ROLE_LABELS[user.role as AppRole] || user.role} — التخصيص يتجاوز افتراضي الدور.</p>
          </div>
          <button className="w-9 h-9 rounded-lg bg-white/15 hover:bg-white/25 text-xl" onClick={() => !busy && onClose()}>✕</button>
        </header>
        <div className="px-5 py-4 overflow-auto flex-1 bg-slate-50/50">
          {systems.length === 0 ? (
            <p className="text-center text-slate-500 py-8">لا توجد أنظمة مخصّصة بعد.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-rose-100/60 sticky top-0">
                <tr>
                  <th className="p-2 text-right font-black">النظام</th>
                  <th className="p-2 text-center font-black">👁️ عرض</th>
                  <th className="p-2 text-center font-black">➕ إضافة</th>
                  <th className="p-2 text-center font-black">✏️ تعديل</th>
                  <th className="p-2 text-center font-black">🗑️ حذف</th>
                  <th className="p-2 text-center font-black">إعادة للافتراضي</th>
                </tr>
              </thead>
              <tbody>
                {systems.map((s) => {
                  const cur = (perms.systems?.[s.id] || {}) as Record<string, boolean>;
                  const hasOverride = !!perms.systems?.[s.id];
                  return (
                    <tr key={s.id} className="border-t border-slate-200">
                      <td className="p-2 font-bold">{s.icon} {s.title}</td>
                      {(['view','add','edit','delete'] as const).map((k) => (
                        <td key={k} className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!cur[k]}
                            onChange={() => togglePerm(s.id, k)}
                            className="w-4 h-4"
                          />
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        {hasOverride && (
                          <button onClick={() => clearSystem(s.id)} className="text-xs text-rose-600 underline">إزالة</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <footer className="px-5 py-3 border-t bg-white flex flex-wrap justify-between items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500">عدد الأنظمة المخصّصة: {Object.keys(perms.systems || {}).length}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="schedule-btn">✕ إلغاء</button>
            <button onClick={save} disabled={busy} className="schedule-btn schedule-btn-primary">{busy ? '⏳…' : '💾 حفظ'}</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};

export default UsersAdminSection;
