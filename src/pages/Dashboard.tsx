import { useNavigate } from 'react-router-dom';
import { SYSTEMS } from '@/data/scheduleData';
import universityLogo from '@/assets/university-logo.jpg';

const systemCards = [
  {
    id: 'teacher',
    title: 'جدول الأستاذ',
    icon: '👨‍🏫',
    description: 'عرض وطباعة جدول التدريسي حسب الكلية والقسم',
    path: '/teacher',
    color: '#2563eb',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
  },
  {
    id: 'student',
    title: 'جدول الطالب',
    icon: '🎓',
    description: 'الجدول الدراسي الموحد لطلبة الجامعة',
    path: '/student',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
  },
  {
    id: 'audit',
    title: 'أنظمة التدقيق',
    icon: '📋',
    description: 'تدقيق الجدول الدراسي وتدقيق الساعات الدراسية',
    path: '/audit',
    color: '#059669',
    gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  },
  {
    id: 'tracking',
    title: 'متابعة سير التدريسات',
    icon: '📍',
    description: 'متابعة المحاضرات حسب اليوم والوقت',
    path: '/tracking',
    color: '#d97706',
    gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
  },
  {
    id: 'emptyRooms',
    title: 'القاعات الشاغرة',
    icon: '🏛️',
    description: 'البحث عن القاعات الشاغرة وحجزها مؤقتاً',
    path: '/empty-rooms',
    color: '#22c55e',
    gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  },
  {
    id: 'assignments',
    title: 'تكليفات التدريسي',
    icon: '📑',
    description: 'عرض تكليفات التدريسيين حسب الكلية والقسم',
    path: '/assignments',
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
  },
  {
    id: 'charts',
    title: 'الإحصائيات',
    icon: '📈',
    description: 'رسوم بيانية وإحصائيات شاملة لجميع الأنظمة',
    path: '/charts',
    color: '#0891b2',
    gradient: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
  },
];

const getSystemRowCount = (id: string): number => {
  if (id === 'audit') {
    const ids = ['report', 'hours', 'lectureTypeAudit', 'assignmentsAudit'];
    return ids.reduce((sum, sid) => sum + (SYSTEMS.find(s => s.id === sid)?.rows.length || 0), 0);
  }
  if (id === 'charts') return 0;
  const sys = SYSTEMS.find(s => s.id === id);
  return sys?.rows.length || 0;
};

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-6xl mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card">
          {/* Header */}
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-3 text-center">
              <img
                src={universityLogo}
                alt="شعار الجامعة التكنولوجية"
                className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-2xl shadow-lg"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.15))' }}
              />
              <p className="font-extrabold text-[15px] text-[var(--schedule-accent-blue)] tracking-wide opacity-95">
                كلية الهندسة المدنية - الجامعة التكنولوجية
              </p>
              <h1 className="m-0 text-[clamp(1.8rem,3vw,2.8rem)] font-black leading-tight text-[var(--schedule-text)]" style={{ letterSpacing: '-.02em' }}>
                نظام إدارة الجداول الدراسية
              </h1>
              <span className="schedule-badge">جاهز</span>
            </div>
          </header>

          {/* System Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
            {systemCards.map(card => {
              const count = getSystemRowCount(card.id);
              return (
                <button
                  key={card.id}
                  onClick={() => navigate(card.path)}
                  className="group relative overflow-hidden rounded-2xl border border-[var(--schedule-border)] p-6 text-right transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                  style={{
                    background: 'var(--schedule-card-bg)',
                  }}
                >
                  {/* Accent bar */}
                  <div className="absolute top-0 right-0 w-1.5 h-full rounded-l-full" style={{ background: card.gradient }} />

                  <div className="flex items-start gap-4">
                    <div className="text-4xl flex-shrink-0 w-14 h-14 rounded-2xl grid place-items-center"
                      style={{ background: `${card.color}15`, }}
                    >
                      {card.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-[var(--schedule-text)] mb-1 group-hover:text-[var(--schedule-accent-blue)] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-sm font-semibold text-[var(--schedule-muted)] leading-relaxed">
                        {card.description}
                      </p>
                      {count > 0 && (
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black"
                          style={{ background: `${card.color}12`, color: card.color }}>
                          📊 {count.toLocaleString('ar-SA')} سجل
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hover arrow */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all text-[var(--schedule-accent-blue)] text-xl font-black">
                    ←
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="schedule-footer">
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
