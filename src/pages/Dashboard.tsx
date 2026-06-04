import { useNavigate } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { SYSTEMS } from '@/data/scheduleData';
import { useLiveScheduleData } from '@/hooks/useLiveSchedule';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import RefreshButton from '@/components/shared/RefreshButton';
import universityLogo from '@/assets/university-logo.jpg';
import { useEffect, useMemo, useState } from 'react';
import { getGroups, getRules, SYSTEM_ACCESS_RULES_UPDATED_EVENT, syncRulesFromRemote, type SystemGroup } from '@/lib/systemAccess';
import { listCustomSystems, CUSTOM_SYSTEMS_UPDATED_EVENT } from '@/data/customSystemsRegistry';
import {
  fetchSheetByGid,
  SUPERVISION_GID, POSTGRADUATE_GID, CHECK_GID, PROJECT_GID, STUDENTS_GID, CHECKALLHR_GID,
} from '@/data/supervisionData';

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
    id: 'auditReport',
    title: 'تدقيق الجدول الدراسي',
    icon: '📋',
    description: 'تدقيق سجلات الجدول الدراسي والكشف عن نقص البيانات والتضارب',
    path: '/audit-report',
    color: '#059669',
    gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  },
  {
    id: 'auditHours',
    title: 'تدقيق الساعات الدراسية',
    icon: '⏱️',
    description: 'تدقيق ساعات المحاضرات الأسبوعية',
    path: '/audit-hours',
    color: '#0d9488',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)',
  },
  {
    id: 'auditLectureType',
    title: 'تدقيق نوع المحاضرة',
    icon: '🧪',
    description: 'تدقيق نوع المحاضرة (نظري/عملي) ومطابقتها',
    path: '/audit-lecture-type',
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
  },
  {
    id: 'auditAssignments',
    title: 'تدقيق تكليفات القسم',
    icon: '📝',
    description: 'تدقيق تكليفات الأقسام والنتائج غير السليمة',
    path: '/audit-assignments',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
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
    description: 'خاص بالمقررين للاطلاع السريع على تكليفات التدريسيين',
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
    id: 'quotaAudit',
    title: 'تدقيق استيفاء النصاب',
    icon: '⚖️',
    description: 'ملخص ساعات الاستاذ الاسبوعية واستيفاء النصاب حسب نوع التعيين',
    path: '/quota-audit',
    color: '#0d9488',
    gradient: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)',
  },
  {
    id: 'supervisionReport',
    title: 'تقرير الاشراف',
    icon: '🧑‍🏫',
    description: 'حالات الاشراف لتدريسيي الكلية والتدريسيين الخارجيين ضمن السنة الدراسية الحالية',
    path: '/supervision-report',
    color: '#0ea5e9',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
  },
  {
    id: 'expiredSupervision',
    title: 'الاشراف المنتهي قبل بدء العام',
    icon: '⏳',
    description: 'حالات الاشراف التي انتهى تكليفها قبل بداية العام الدراسي الحالي',
    path: '/expired-supervision',
    color: '#a16207',
    gradient: 'linear-gradient(135deg, #a16207 0%, #713f12 100%)',
  },
  {
    id: 'studentsWithoutSupervisor',
    title: 'طلبة من دون مشرف',
    icon: '🧑‍🎓',
    description: 'طلبة الدراسات العليا في مرحلة البحث الذين لم يثبت لهم مشرف بعد',
    path: '/students-without-supervisor',
    color: '#e11d48',
    gradient: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)',
  },
  {
    id: 'researchPhaseStudents',
    title: 'طلبة الدراسات العليا في مرحلة البحث',
    icon: '🎓',
    description: 'قائمة بطلبة الدراسات العليا الذين هم حالياً في مرحلة البحث',
    path: '/research-phase-students',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
  },
  {
    id: 'supervisionCap',
    title: 'سقف الاشراف',
    icon: '📐',
    description: 'حالات تجاوز سقف الاشراف الاعتيادي والاستثنائي وإحصائيات الاشراف',
    path: '/supervision-cap',
    color: '#7c3aed',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
  },
  {
    id: 'projects',
    title: 'المشاريع',
    icon: '📁',
    description: 'التدريسيون المكلفون بالاشراف على مشاريع طلبة المرحلة الرابعة',
    path: '/projects',
    color: '#0891b2',
    gradient: 'linear-gradient(135deg, #0891b2 0%, #155e75 100%)',
  },
  {
    id: 'fourthStageStudents',
    title: 'طلبة المرحلة الرابعة',
    icon: '🎓',
    description: 'الطلبة الذين يفترض تكليفهم بمشاريع التخرج مع أسماء المشرفين',
    path: '/fourth-stage-students',
    color: '#16a34a',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #166534 100%)',
  },
  {
    id: 'projectsAssignmentsAudit',
    title: 'تدقيق تكليفات المشاريع',
    icon: '⚠️',
    description: 'حالات تكليفات مشاريع التخرج التي تحتوي على مخالفات',
    path: '/projects-assignments-audit',
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  },
  {
    id: 'supervisionWorkload',
    title: 'عبء المشاريع والاشراف',
    icon: '📊',
    description: 'نظام إحصائي سريع لإعطاء نظرة عن عبء الإشراف على المشاريع وطلبة الدراسات العليا',
    path: '/supervision-workload',
    color: '#0891b2',
    gradient: 'linear-gradient(135deg, #0891b2 0%, #155e75 100%)',
  },
  {
    id: 'projectSupervisionExceeded',
    title: 'تجاوز الحد الاقصى للاشراف على المشاريع',
    icon: '🚨',
    description: 'حالات تجاوز سقف الاشراف على مشاريع التخرج لطلبة الدراسة الاولية',
    path: '/project-supervision-exceeded',
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  },
  {
    id: 'teachersWithoutTheory',
    title: 'التدريسيون الذين ليس لديهم ساعات نظرية',
    icon: '📚',
    description: 'تدريسيون مطالبون بتدريس مادة نظرية وليس لديهم تكليف نظري',
    path: '/teachers-without-theory',
    color: '#a16207',
    gradient: 'linear-gradient(135deg, #a16207 0%, #713f12 100%)',
  },
  {
    id: 'unassignedSupervisors',
    title: 'التدريسيون غير المكلفين بالاشراف',
    icon: '🧑‍🏫',
    description: 'التدريسيون المؤهلون للإشراف وليس لديهم تكليف على طلبة الدراسات العليا',
    path: '/unassigned-supervisors',
    color: '#475569',
    gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
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
  const [groups, setGroups] = useState<SystemGroup[]>(() => getGroups());
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
  const { data: customSystems = [] } = useQuery({
    queryKey: ['custom-systems-list'],
    queryFn: () => listCustomSystems(),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    void syncRulesFromRemote().then((r) => { setRules(r); setGroups(getGroups()); });

    const refreshRules = () => { setRules(getRules()); setGroups(getGroups()); };
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
      quotaAudit: liveData?.quota.length,
    };
    if (id === 'audit') {
      return (
        (liveData?.report.length || 0) +
        (liveData?.hours.length || 0) +
        (liveData?.lectureTypeAudit.length || 0) +
        (liveData?.assignmentsAudit.length || 0)
      );
    }
    if (id === 'auditReport') return liveData?.report.length || 0;
    if (id === 'auditHours') return liveData?.hours.length || 0;
    if (id === 'auditLectureType') return liveData?.lectureTypeAudit.length || 0;
    if (id === 'auditAssignments') return liveData?.assignmentsAudit.length || 0;
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

  const groupedSystemIds = new Set<string>(groups.flatMap(g => g.systemIds));
  const baseVisibleCards = systemCards.filter(
    (c) => (c.id === 'controlPanel' || rules[c.id]?.visible !== false) && !groupedSystemIds.has(c.id),
  );
  const customCards = [...(customSystems || [])]
    .filter((sys) => sys.enabled !== false)
    .sort((a, b) => ((a.sort_order ?? 100) - (b.sort_order ?? 100)))
    .map((sys) => ({
      id: `custom_${sys.id}`,
      title: sys.title,
      icon: sys.icon || '📋',
      description: sys.description || '',
      path: `/custom/${sys.id}`,
      color: sys.color || '#0891b2',
      gradient: `linear-gradient(135deg, ${sys.color || '#0891b2'} 0%, ${sys.color || '#0891b2'}cc 100%)`,
      _sortOrder: sys.sort_order ?? 100,
    }));
  // Insert each custom card at its sort_order position (1-indexed) within the visible list.
  const visibleCards: any[] = [...baseVisibleCards];
  customCards.forEach((c) => {
    const pos = Math.max(1, Math.min(c._sortOrder, visibleCards.length + 1));
    visibleCards.splice(pos - 1, 0, c);
  });

  const groupRowCount = (g: SystemGroup) =>
    g.systemIds.reduce((sum, id) => sum + (getSystemRowCount(id) || 0), 0);

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
                الأنظمة الملحقة بنظام الإدارة الاكاديمية
              </h1>
              <div className="flex flex-wrap gap-3 items-center justify-center">
                <span className="schedule-badge">جاهز</span>
                <RefreshButton compact />
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black border-2"
                  style={{
                    background: 'linear-gradient(135deg,#1e40af,#1d4ed8)',
                    color: '#fff',
                    borderColor: '#1e3a8a',
                    boxShadow: '0 4px 12px rgba(30,64,175,0.25)',
                  }}
                  title="عدد الأنظمة المتاحة في الواجهة"
                >
                  🗂️ عدد الأنظمة: {(visibleCards.length + groups.length).toLocaleString('ar-SA')}
                </span>
              </div>
            </div>
          </header>

          {/* System Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
            {groups.map(group => {
              const count = groupRowCount(group);
              const gradient = `linear-gradient(135deg, ${group.color} 0%, ${group.color}cc 100%)`;
              return (
                <button
                  key={`group-${group.id}`}
                  onClick={() => navigate(`/group/${group.id}`)}
                  className="group relative overflow-hidden rounded-2xl border-2 border-[var(--schedule-border)] p-6 text-right transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                  style={{ background: 'var(--schedule-card-bg)' }}
                >
                  <div className="absolute top-0 right-0 w-1.5 h-full rounded-l-full" style={{ background: gradient }} />
                  <div className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: `${group.color}20`, color: group.color }}>
                    📦 مجموعة · {group.systemIds.length}
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="text-4xl flex-shrink-0 w-14 h-14 rounded-2xl grid place-items-center" style={{ background: `${group.color}15` }}>
                      {group.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-black text-[var(--schedule-text)] mb-1 group-hover:text-[var(--schedule-accent-blue)] transition-colors">
                        {group.title}
                      </h3>
                      <p className="text-sm font-semibold text-[var(--schedule-muted)] leading-relaxed">
                        {group.description || 'مجموعة أنظمة'}
                      </p>
                      {count > 0 && (
                        <div className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black" style={{ background: `${group.color}12`, color: group.color }}>
                          📊 {count.toLocaleString('ar-SA')} سجل
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
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

