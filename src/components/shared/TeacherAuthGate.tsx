import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSession, login, fetchTeacherList, backgroundSyncTeachers, type TeacherUser } from '@/lib/teacherAuth';

interface Props {
  /** Children rendered once a valid teacher session exists. */
  children: JSX.Element;
  /** Optional title shown on the gate. */
  title?: string;
}

/**
 * Gates content behind the Individual-Assignments teacher login (name + password).
 * Uses the same auth store as IndividualAssignments — no separate password.
 */
const TeacherAuthGate = ({ children, title = '🔐 دخول التدريسي مطلوب' }: Props) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<TeacherUser | null>(() => getSession()?.user || null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['teacher-users-list'],
    queryFn: fetchTeacherList,
    staleTime: 5 * 60 * 1000,
    enabled: !user,
  });

  useEffect(() => { if (!user) backgroundSyncTeachers(); }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? users.filter((u) => u.includes(q)) : users;
  }, [users, query]);

  if (user) return children;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) { toast.error('يرجى إدخال الاسم وكلمة المرور'); return; }
    setSubmitting(true);
    try {
      const s = await login(name, password);
      setUser(s.user);
      toast.success('تم الدخول بنجاح');
    } catch (err) {
      toast.error((err as Error).message || 'فشل الدخول');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="schedule-body min-h-screen flex items-center justify-center px-4 py-8" dir="rtl">
      <div className="schedule-card w-full" style={{ maxWidth: 520, padding: 32 }}>
        <div className="mb-4 flex justify-start">
          <button className="schedule-btn" onClick={() => navigate('/')}>🏠 الرئيسية</button>
        </div>
        <h2 className="text-xl font-black text-center mb-5 text-[var(--schedule-text)]">{title}</h2>
        <p className="text-xs text-center text-[var(--schedule-muted)] mb-4">
          يستخدم هذا النظام نفس كلمة المرور الخاصة بـ «التكليفات الفردية».
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="relative">
            <label className="block text-sm font-extrabold mb-2">اسم التدريسي</label>
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
                  <button key={u} type="button"
                    onClick={() => { setName(u); setQuery(u); setOpen(false); }}
                    className="w-full text-right px-4 py-2 hover:bg-[var(--schedule-accent-blue)]/10 text-sm font-semibold border-b border-[var(--schedule-border)]/50 last:border-0">
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-extrabold mb-2">كلمة المرور</label>
            <input
              type="password"
              className="schedule-select w-full text-center"
              style={{ minHeight: 48, letterSpacing: 4 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
            />
          </div>
          <button type="submit" disabled={submitting} className="schedule-btn schedule-btn-primary w-full" style={{ minHeight: 48 }}>
            {submitting ? '⏳ جاري الدخول…' : '🔓 دخول'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TeacherAuthGate;
