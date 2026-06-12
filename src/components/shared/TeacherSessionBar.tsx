import { useState } from 'react';
import { toast } from 'sonner';
import { changePassword, logout, type TeacherUser } from '@/lib/teacherAuth';

interface Props {
  user: TeacherUser;
  onLogout?: () => void;
}

/**
 * Floating session bar (matches the look used in «التكليفات الفردية»).
 * Shows the teacher name + buttons for change-password & logout.
 */
const TeacherSessionBar = ({ user, onLogout }: Props) => {
  const [showPw, setShowPw] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    try { await logout(); } catch { /* ignore */ }
    if (onLogout) onLogout();
    else window.location.reload();
  };

  const submitChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPw || !newPw) { toast.error('يرجى إدخال كلمتي المرور'); return; }
    if (newPw.length < 3) { toast.error('كلمة المرور الجديدة قصيرة جداً'); return; }
    setBusy(true);
    try {
      await changePassword(oldPw, newPw);
      toast.success('تم تغيير كلمة المرور بنجاح');
      setShowPw(false); setOldPw(''); setNewPw('');
    } catch (err) {
      toast.error((err as Error).message || 'فشل تغيير كلمة المرور');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="fixed top-3 left-3 z-50 flex gap-2" dir="rtl">
        <div
          className="schedule-card flex items-center gap-2 px-3 py-1.5 text-xs font-bold"
          style={{ background: 'rgba(255,255,255,0.95)' }}
        >
          <span>👤 {user.full_name}</span>
          <button onClick={() => setShowPw(true)} className="schedule-btn text-xs" style={{ minHeight: 28 }}>🔐 كلمة المرور</button>
          <button onClick={handleLogout} className="schedule-btn text-xs" style={{ minHeight: 28 }}>🚪 خروج</button>
        </div>
      </div>

      {showPw && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-3"
          dir="rtl"
          onClick={() => !busy && setShowPw(false)}
        >
          <form
            onSubmit={submitChange}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-center">🔐 تغيير كلمة المرور</h3>
            <div>
              <label className="block text-xs font-black mb-1">كلمة المرور الحالية</label>
              <input type="password" className="schedule-select w-full" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-black mb-1">كلمة المرور الجديدة</label>
              <input type="password" className="schedule-select w-full" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="schedule-btn" onClick={() => !busy && setShowPw(false)}>إلغاء</button>
              <button type="submit" disabled={busy} className="schedule-btn schedule-btn-primary">
                {busy ? '⏳ ...' : '💾 حفظ'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

export default TeacherSessionBar;
