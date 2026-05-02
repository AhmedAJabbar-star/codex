import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SYSTEMS } from '@/data/scheduleData';
import { useLiveScheduleData } from '@/hooks/useLiveSchedule';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import RefreshButton from '@/components/shared/RefreshButton';
import universityLogo from '@/assets/university-logo.jpg';
import { useEffect, useState } from 'react';
import { getRules, SYSTEM_ACCESS_RULES_UPDATED_EVENT, syncRulesFromRemote } from '@/lib/systemAccess';

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
    id: 'individualAssignments',
    title: 'التكليفات الفردية',
    icon: '🪪',
    description: 'دخول التدريسي بحسابه الشخصي لعرض تكليفاته فقط',
    path: '/individual-assignments',
    color: '#9333ea',
    gradient: 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
  },
  {
    id: 'errors',
    title: 'ملخص الأخطاء',
    icon: '⚠️',
    description: 'تجميع جميع الحالات غير السليمة من أنظمة التدقيق حسب القسم واليوم',
    path: '/errors',
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
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
  {
    id: 'controlPanel',
    title: 'لوحة التحكم',
    icon: '🛠️',
    description: 'إدارة إظهار الأنظمة والتحكم بالحماية بكلمة مرور',
    path: '/control-panel',
    color: '#334155',
    gradient: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
  }
];

const Dashboard = () => {
  const [rules, setRules] = useState(() => getRules());
  const navigate = useNavigate();
  const { data: liveData } = useLiveScheduleData();
  const { data: assignmentsRows } = useQuery({
    queryKey: ['individual-assignments'],
    queryFn: () => fetchIndividualAssignmentRows(),
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    void syncRulesFromRemote().then(setRules);

    const refreshRules = () => setRules(getRules());
    window.addEventListener('storage', refreshRules);
    window.addEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refreshRules);
    return () => {
      window.removeEventListener('storage', refreshRules);
      window.removeEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refreshRules);
    };
  }, []);

  const getSystemRowCount = (id: string): number => {
    const liveMap: Record<string, number | undefined> = {
      teacher: liveData?.teacher.length,
      student: liveData?.student.length,
      tracking: liveData?.tracking.length,
      emptyRooms: liveData?.emptyRooms.length,
      assignments: assignmentsRows?.length,
    };
    if (id === 'audit') {
      return (
        (liveData?.report.length || 0) +
        (liveData?.hours.length || 0) +
        (liveData?.lectureTypeAudit.length || 0) +
        (liveData?.assignmentsAudit.length || 0)
      );
    }
    if (id === 'errors') {
      if (!liveData) return 0;
      const isInvalid = (v: string) => {
        const t = (v || '').trim();
        if (!t) return false;
        return !['سليم', 'مطابق', 'صحيح', 'لا يوجد', '✓', 'ok', 'OK'].includes(t);
      };
      let count = 0;
      liveData.report.forEach((r) => {
        if (isInvalid(r['نقص البيانات'] || '') || (r['التضارب'] || '').trim()) count += 1;
      });
      liveData.hours.forEach((r) => { if (isInvalid(r['التدقيق حسب الاسبوع'] || '')) count += 1; });
      count += liveData.lectureTypeAudit.length;
      liveData.assignmentsAudit.forEach((r) => { if (isInvalid(r['نتيجة التدقيق الاول'] || '')) count += 1; });
      return count;
    }
    if (id === 'charts') return 0;
    if (liveMap[id] !== undefined) return liveMap[id]!;
    const sys = SYSTEMS.find(s => s.id === id);
    return sys?.rows.length || 0;
  };

  const visibleCards = systemCards.filter((c) => c.id === 'controlPanel' || rules[c.id]?.visible !== false);

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
              <div className="flex flex-wrap gap-3 items-center justify-center">
                <span className="schedule-badge">جاهز</span>
                <RefreshButton compact />
              </div>
            </div>
          </header>

          {/* System Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
            {visibleCards.map(card => {
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

