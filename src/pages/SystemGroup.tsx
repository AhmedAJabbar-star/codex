import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import universityLogo from '@/assets/university-logo.jpg';
import { getGroups, getRules, SYSTEMS_REGISTRY, SYSTEM_ACCESS_RULES_UPDATED_EVENT, syncRulesFromRemote, type SystemGroup } from '@/lib/systemAccess';

// Visual metadata fallback for systems (icon/color/description)
const SYSTEM_VISUALS: Record<string, { icon: string; color: string; description: string }> = {
  teacher: { icon: '👨‍🏫', color: '#2563eb', description: 'عرض وطباعة جدول التدريسي حسب الكلية والقسم' },
  student: { icon: '🎓', color: '#7c3aed', description: 'الجدول الدراسي الموحد لطلبة الجامعة' },
  audit: { icon: '📋', color: '#059669', description: 'تدقيق الجدول الدراسي وتدقيق الساعات الدراسية' },
  tracking: { icon: '📍', color: '#d97706', description: 'متابعة المحاضرات حسب اليوم والوقت' },
  emptyRooms: { icon: '🏛️', color: '#22c55e', description: 'البحث عن القاعات الشاغرة وحجزها مؤقتاً' },
  assignments: { icon: '📑', color: '#dc2626', description: 'تكليفات التدريسيين' },
  individualAssignments: { icon: '🪪', color: '#9333ea', description: 'دخول التدريسي بحسابه الشخصي' },
  quotaAudit: { icon: '⚖️', color: '#0d9488', description: 'استيفاء النصاب حسب نوع التعيين' },
  supervisionReport: { icon: '🧑‍🏫', color: '#0ea5e9', description: 'حالات الاشراف للسنة الحالية' },
  expiredSupervision: { icon: '⏳', color: '#a16207', description: 'الاشراف المنتهي قبل بدء العام' },
  studentsWithoutSupervisor: { icon: '🧑‍🎓', color: '#e11d48', description: 'طلبة لم يثبت لهم مشرف' },
  researchPhaseStudents: { icon: '🎓', color: '#16a34a', description: 'طلبة الدراسات العليا في مرحلة البحث' },
  supervisionCap: { icon: '📐', color: '#7c3aed', description: 'سقف الاشراف والإحصائيات' },
  projects: { icon: '📁', color: '#0891b2', description: 'التدريسيون المشرفون على مشاريع التخرج' },
  fourthStageStudents: { icon: '🎓', color: '#16a34a', description: 'طلبة المرحلة الرابعة' },
  projectsAssignmentsAudit: { icon: '⚠️', color: '#dc2626', description: 'تدقيق تكليفات مشاريع التخرج' },
  errors: { icon: '⚠️', color: '#ef4444', description: 'تجميع جميع الحالات غير السليمة' },
  charts: { icon: '📈', color: '#0891b2', description: 'إحصائيات شاملة' },
};

const SystemGroupPage = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState<SystemGroup | null>(null);
  const [, setRulesVersion] = useState(0);

  useEffect(() => {
    void syncRulesFromRemote().then(() => {
      const g = getGroups().find(x => x.id === groupId) || null;
      setGroup(g);
      setRulesVersion(v => v + 1);
    });
    const refresh = () => {
      const g = getGroups().find(x => x.id === groupId) || null;
      setGroup(g);
      setRulesVersion(v => v + 1);
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
    };
  }, [groupId]);

  const cards = useMemo(() => {
    if (!group) return [];
    const rules = getRules();
    return group.systemIds
      .map(id => SYSTEMS_REGISTRY.find(s => s.id === id))
      .filter((s): s is { id: string; title: string; path: string } => !!s && rules[s.id]?.visible !== false)
      .map(s => ({
        id: s.id,
        title: s.title,
        path: s.path,
        ...(SYSTEM_VISUALS[s.id] || { icon: '📄', color: '#475569', description: '' }),
      }));
  }, [group]);

  if (!group) {
    return (
      <div className="schedule-body flex items-center justify-center min-h-screen" dir="rtl">
        <div className="schedule-card p-8 text-center">
          <div className="text-5xl mb-3">❓</div>
          <h2 className="text-xl font-black mb-2">المجموعة غير موجودة</h2>
          <button className="schedule-btn schedule-btn-primary mt-3" onClick={() => navigate('/')}>🏠 الرئيسية</button>
        </div>
      </div>
    );
  }

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-[1800px] mx-auto my-4 px-3 sm:px-5 lg:px-8 pb-7">
        <div className="schedule-card">
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-3 text-center relative">
              <div className="absolute top-0 right-0">
                <button onClick={() => navigate('/')} className="schedule-btn" style={{ minHeight: 38, padding: '8px 16px', borderRadius: 999 }}>🏠 الرئيسية</button>
              </div>
              <img
                src={universityLogo}
                alt="شعار الجامعة"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-2xl shadow-lg"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.15))' }}
              />
              <p className="font-extrabold text-[15px] text-[var(--schedule-accent-blue)] tracking-wide opacity-95">
                كلية الهندسة المدنية - الجامعة التكنولوجية
              </p>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{group.icon}</span>
                <h1 className="m-0 text-[clamp(1.6rem,2.6vw,2.4rem)] font-black leading-tight text-[var(--schedule-text)]" style={{ letterSpacing: '-.02em' }}>
                  {group.title}
                </h1>
              </div>
              {group.description && (
                <div className="schedule-hint"><strong>💡 ملاحظة:</strong> {group.description}</div>
              )}
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-5 p-4 sm:p-6">
            {cards.length === 0 && (
              <div className="col-span-full text-center py-10 text-[var(--schedule-muted)] font-bold">لا توجد أنظمة في هذه المجموعة</div>
            )}
            {cards.map(card => (
              <button
                key={card.id}
                onClick={() => navigate(card.path)}
                className="group relative overflow-hidden rounded-2xl border border-[var(--schedule-border)] p-6 text-right transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                style={{ background: 'var(--schedule-card-bg)' }}
              >
                <div className="absolute top-0 right-0 w-1.5 h-full rounded-l-full" style={{ background: card.color }} />
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0 w-14 h-14 rounded-2xl grid place-items-center" style={{ background: `${card.color}15` }}>
                    {card.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-[var(--schedule-text)] mb-1">{card.title}</h3>
                    <p className="text-sm font-semibold text-[var(--schedule-muted)] leading-relaxed">{card.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemGroupPage;
