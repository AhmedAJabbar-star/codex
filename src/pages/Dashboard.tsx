import { useNavigate } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { SYSTEMS } from '@/data/scheduleData';
import { useLiveScheduleData } from '@/hooks/useLiveSchedule';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import RefreshButton from '@/components/shared/RefreshButton';
import universityLogo from '@/assets/university-logo.jpg';
import { useEffect, useMemo, useState } from 'react';
import { useDarkMode } from '@/lib/darkMode';
import { getGroups, getRules, SYSTEM_ACCESS_RULES_UPDATED_EVENT, syncRulesFromRemote, type SystemGroup } from '@/lib/systemAccess';
import { listCustomSystems, CUSTOM_SYSTEMS_UPDATED_EVENT } from '@/data/customSystemsRegistry';
import { evaluateCondition, applyDerivedColumns } from '@/lib/conditionEngine';
import {
  fetchSheetByGid, parseSheetDate, currentAcademicCutoff,
  SUPERVISION_GID, POSTGRADUATE_GID, CHECK_GID, PROJECT_GID, STUDENTS_GID, CHECKALLHR_GID,
  type SheetFetchResult,
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
  const [isDark, setIsDark] = useDarkMode();
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

  // Fetch supervision-style sheets so cards can show record counts too.
  const supervisionGids = useMemo(() => ([
    { id: 'supervisionReport', gid: SUPERVISION_GID },
    { id: 'expiredSupervision', gid: SUPERVISION_GID },
    { id: 'researchPhaseStudents', gid: POSTGRADUATE_GID },
    { id: 'studentsWithoutSupervisor', gid: POSTGRADUATE_GID },
    { id: 'supervisionCap', gid: CHECK_GID },
    { id: 'projects', gid: PROJECT_GID },
    { id: 'fourthStageStudents', gid: STUDENTS_GID },
    { id: 'projectsAssignmentsAudit', gid: STUDENTS_GID },
    { id: 'supervisionWorkload', gid: CHECKALLHR_GID },
    { id: 'projectSupervisionExceeded', gid: CHECKALLHR_GID },
    { id: 'teachersWithoutTheory', gid: CHECKALLHR_GID },
    { id: 'unassignedSupervisors', gid: CHECKALLHR_GID },
  ]), []);
  const uniqueGids = useMemo(() => {
    const set = new Set<string>(supervisionGids.map((s) => s.gid));
    (customSystems || []).forEach((s) => { if (s.sheet_gid) set.add(s.sheet_gid); });
    return Array.from(set);
  }, [supervisionGids, customSystems]);
  const sheetQueries = useQueries({
    queries: uniqueGids.map((gid) => ({
      queryKey: ['sheet-count', gid],
      queryFn: () => fetchSheetByGid(gid),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchInterval: 5 * 60 * 1000,
      retry: 1,
    })),
  });
  const gidSheet = useMemo(() => {
    const map: Record<string, SheetFetchResult | undefined> = {};
    uniqueGids.forEach((gid, i) => { map[gid] = sheetQueries[i]?.data; });
    return map;
  }, [uniqueGids, sheetQueries]);

  const countFilteredSupervision = (id: string): number => {
    const sup = supervisionGids.find((s) => s.id === id);
    if (!sup) return 0;
    const sheet = gidSheet[sup.gid];
    if (!sheet) return 0;
    const rows = sheet.rows;
    const h = sheet.headers;
    const trim = (v: any) => String(v || '').trim();
    const normalizeAr = (s: string) => s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').trim();
    const num = (v: string) => parseFloat(String(v || '').replace(/[^\d.\-]/g, ''));

    switch (id) {
      case 'expiredSupervision': {
        const colE = h[4]; if (!colE) return 0;
        const cutoffMs = currentAcademicCutoff().getTime();
        return rows.filter((r) => {
          const d = parseSheetDate(r[colE] || '');
          return d !== null && d.getTime() <= cutoffMs;
        }).length;
      }
      case 'studentsWithoutSupervisor': {
        const colI = h[8]; if (!colI) return rows.length;
        return rows.filter((r) => trim(r[colI]) === '0').length;
      }
      case 'projectsAssignmentsAudit': {
        const colI = h[8]; if (!colI) return rows.length;
        const isSafe = (v: string) => {
          const t = (v || '').replace(/\s+/g, '').trim();
          return t === '' || t.includes('سليم');
        };
        return rows.filter((r) => !isSafe(r[colI] || '')).length;
      }
      case 'projectSupervisionExceeded': {
        const colI = h[8]; if (!colI) return 0;
        return rows.filter((r) => {
          const n = num(r[colI] || '');
          return !isNaN(n) && n > 4;
        }).length;
      }
      case 'teachersWithoutTheory': {
        const cKey = h[2], eKey = h[4], sKey = h[18], tKey = h[19];
        if (!cKey || !eKey) return 0;
        const isZero = (v: string) => {
          const t = trim(v);
          if (!t) return false;
          const n = num(t);
          return !isNaN(n) && n === 0;
        };
        let count = 0;
        rows.forEach((r) => {
          if (trim(r[cKey]) === 'مجاز') return;
          if (trim(r[eKey]) === 'مدرس مساعد') return;
          if (sKey && isZero(r[sKey] || '')) count += 1;
          if (tKey && isZero(r[tKey] || '')) count += 1;
        });
        return count;
      }
      case 'unassignedSupervisors': {
        const cKey = h[2], eKey = h[4], nKey = h[13];
        if (!cKey || !eKey || !nKey) return 0;
        return rows.filter((r) => {
          const e = normalizeAr(r[eKey] || '');
          const c = trim(r[cKey]);
          const nRaw = trim(r[nKey]);
          const nNum = num(nRaw);
          const nIsZero = nRaw === '' || nRaw === '0' || (!isNaN(nNum) && nNum === 0);
          return e.includes('استاذ') && c !== 'مجاز' && nIsZero;
        }).length;
      }
      default:
        return rows.length;
    }
  };


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
    // Supervision-style systems (with per-system filter logic)
    const sup = supervisionGids.find((s) => s.id === id);
    if (sup) return countFilteredSupervision(id);
    // Custom systems: id is `custom_<defId>`
    if (id.startsWith('custom_')) {
      const defId = id.slice('custom_'.length);
      const def = (customSystems || []).find((s) => s.id === defId);
      const sheet = def?.sheet_gid ? gidSheet[def.sheet_gid] : undefined;
      if (!sheet || !def) return 0;
      const conds = def.conditions || [];
      const logic = def.conditions_logic || 'AND';
      const passConds = (row: Record<string, string>) => {
        if (conds.length === 0) return true;
        if (logic === 'OR') return conds.some((c) => evaluateCondition(c, row, sheet.headers));
        return conds.every((c) => evaluateCondition(c, row, sheet.headers));
      };
      const filtered = sheet.rows.filter(passConds);
      if (!def.derived_columns || def.derived_columns.length === 0) return filtered.length;
      // Expand via derived columns (same as page rendering)
      let total = 0;
      filtered.forEach((r) => { total += applyDerivedColumns(def.derived_columns, r, sheet.headers).length; });
      return total;
    }
    const sys = SYSTEMS.find(s => s.id === id);
    return sys?.rows.length || 0;
  };

  const groupedSystemIds = new Set<string>(groups.flatMap(g => g.systemIds));
  const applyOverrides = (c: typeof systemCards[number]) => {
    const r = rules[c.id] as any;
    if (!r) return { ...c, _sortOrder: 100 };
    const color = r.color || c.color;
    const gradient = r.color ? `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` : c.gradient;
    return {
      ...c,
      title: r.title || c.title,
      description: typeof r.description === 'string' && r.description ? r.description : c.description,
      icon: r.icon || c.icon,
      color,
      gradient,
      _sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 100,
    };
  };
  const baseVisibleCards = systemCards
    .filter((c) => (c.id === 'controlPanel' || rules[c.id]?.visible !== false) && !groupedSystemIds.has(c.id))
    .map(applyOverrides);
  const customCards = [...(customSystems || [])]
    .filter((sys) => sys.enabled !== false)
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
  // Merge built-in (with overrides) + custom, then sort by _sortOrder (stable for equal values).
  const visibleCards: any[] = [...baseVisibleCards, ...customCards]
    .map((c, i) => ({ ...c, _idx: i }))
    .sort((a, b) => (a._sortOrder - b._sortOrder) || (a._idx - b._idx));

  const groupRowCount = (g: SystemGroup) =>
    g.systemIds.reduce((sum, id) => sum + (getSystemRowCount(id) || 0), 0);

  return (
    <div className="schedule-body" dir="rtl">
      <div className="relative z-[1] w-full max-w-[1800px] mx-auto my-4 px-3 sm:px-5 lg:px-8 pb-7">
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

          {/* System Cards Grid - 3D Vibrant */}
          <div className="cards-3d-grid">
            {groups.map(group => {
              const count = groupRowCount(group);
              return (
                <button
                  key={`group-${group.id}`}
                  onClick={() => navigate(`/group/${group.id}`)}
                  className="card3d"
                  style={{ ['--c' as any]: group.color, ['--c2' as any]: group.color } as React.CSSProperties}
                >
                  <span className="card3d__orb card3d__orb--a" />
                  <span className="card3d__orb card3d__orb--b" />
                  <span className="card3d__badge">📦 مجموعة · {group.systemIds.length}</span>
                  <div className="card3d__inner">
                    <div className="card3d__icon">{group.icon}</div>
                    <div className="card3d__body">
                      <h3 className="card3d__title">{group.title}</h3>
                      <p className="card3d__desc">{group.description || 'مجموعة أنظمة'}</p>
                    </div>
                  </div>
                  {count > 0 && (
                    <div className="card3d__count">📊 {count.toLocaleString('ar-SA')} سجل</div>
                  )}
                  <div className="card3d__arrow">←</div>
                </button>
              );
            })}
            {visibleCards.map(card => {
              const count = getSystemRowCount(card.id);
              const m = /linear-gradient\([^,]+,\s*([^\s]+)\s+0%\s*,\s*([^\s]+)\s+100%/.exec(card.gradient || '');
              const c1 = m?.[1] || card.color;
              const c2 = m?.[2] || card.color;
              return (
                <button
                  key={card.id}
                  onClick={() => navigate(card.path)}
                  className="card3d"
                  style={{ ['--c' as any]: c1, ['--c2' as any]: c2 } as React.CSSProperties}
                >
                  <span className="card3d__orb card3d__orb--a" />
                  <span className="card3d__orb card3d__orb--b" />
                  <div className="card3d__inner">
                    <div className="card3d__icon">{card.icon}</div>
                    <div className="card3d__body">
                      <h3 className="card3d__title">{card.title}</h3>
                      <p className="card3d__desc">{card.description}</p>
                    </div>
                  </div>
                  {count > 0 && (
                    <div className="card3d__count">📊 {count.toLocaleString('ar-SA')} سجل</div>
                  )}
                  <div className="card3d__arrow">←</div>
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

