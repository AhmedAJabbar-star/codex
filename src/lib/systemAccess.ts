import { supabase } from '@/integrations/supabase/client';

export type ManagedSystem = {
  id: string;
  title: string;
  path: string;
};

export type SystemAccessRule = {
  visible: boolean;
  protected: boolean;
  password: string;
  /** Optional presentation overrides for the dashboard card. */
  title?: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
  /** When true, requires Individual-Assignments teacher login (name + password) before access. */
  require_teacher_auth?: boolean;
};


export type SystemGroup = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  systemIds: string[];
};

export const MANAGER_PASSWORD_ID = '_manager';
/**
 * Sentinel used in place of a real password. Real passwords never reach the
 * browser: the server sends this marker and swaps it back on save.
 */
export const KEEP_PASSWORD = '__KEEP_EXISTING__';
export const GROUPS_KEY = '__groups';
export const BRANDING_KEY = '__branding';

/** 🎨 هوية الواجهة العامة (الشعار، اسم النظام، إظهار البانر) — تُدار من لوحة التحكم. */
export type Branding = {
  /** رابط صورة الشعار. فارغ = شعار الجامعة المرفق بالنظام. */
  logo_url: string;
  /** اسم النظام المعروض في الواجهة الرئيسية. */
  app_title: string;
  /** سطر الكلية/الجامعة أعلى الاسم. */
  university_line: string;
  /** إظهار البانر بالكامل (الشعار + السطر + الاسم) في الواجهة الرئيسية. */
  show_banner: boolean;
  show_logo: boolean;
  show_title: boolean;
  show_university_line: boolean;
  /** حجم الشعار بالبكسل (64 - 220). */
  logo_size: number;
};

export const DEFAULT_BRANDING: Branding = {
  logo_url: '',
  app_title: 'الأنظمة الملحقة بنظام الإدارة الاكاديمية',
  university_line: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
  show_banner: true,
  show_logo: true,
  show_title: true,
  show_university_line: true,
  logo_size: 112,
};


export const SYSTEMS_REGISTRY: ManagedSystem[] = [
  { id: 'controlPanel', title: 'لوحة التحكم', path: '/control-panel' },
  { id: MANAGER_PASSWORD_ID, title: 'كلمة مرور المدير', path: '__manager__' },
  { id: 'teacher', title: 'جدول الأستاذ', path: '/teacher' },
  { id: 'student', title: 'جدول الطالب', path: '/student' },
  { id: 'auditReport', title: 'تدقيق الجدول الدراسي', path: '/audit-report' },
  { id: 'auditHours', title: 'تدقيق الساعات الدراسية', path: '/audit-hours' },
  { id: 'auditLectureType', title: 'تدقيق نوع المحاضرة', path: '/audit-lecture-type' },
  { id: 'auditAssignments', title: 'تدقيق تكليفات القسم', path: '/audit-assignments' },
  { id: 'tracking', title: 'متابعة سير التدريسات', path: '/tracking' },
  { id: 'emptyRooms', title: 'القاعات الشاغرة', path: '/empty-rooms' },
  { id: 'assignments', title: 'تكليفات التدريسي', path: '/assignments' },
  { id: 'individualAssignments', title: 'التكليفات الفردية', path: '/individual-assignments' },
  { id: 'quotaAudit', title: 'تدقيق استيفاء النصاب', path: '/quota-audit' },
  { id: 'supervisionReport', title: 'تقرير الاشراف', path: '/supervision-report' },
  { id: 'expiredSupervision', title: 'حالات الاشراف المنتهية قبل بدء العام', path: '/expired-supervision' },
  { id: 'studentsWithoutSupervisor', title: 'طلبة من دون مشرف', path: '/students-without-supervisor' },
  { id: 'researchPhaseStudents', title: 'طلبة الدراسات العليا في مرحلة البحث', path: '/research-phase-students' },
  { id: 'supervisionCap', title: 'سقف الاشراف', path: '/supervision-cap' },
  { id: 'projects', title: 'المشاريع', path: '/projects' },
  { id: 'fourthStageStudents', title: 'طلبة المرحلة الرابعة', path: '/fourth-stage-students' },
  { id: 'projectsAssignmentsAudit', title: 'تدقيق تكليفات المشاريع', path: '/projects-assignments-audit' },
  { id: 'supervisionWorkload', title: 'عبء المشاريع والاشراف', path: '/supervision-workload' },
  { id: 'projectSupervisionExceeded', title: 'تجاوز الحد الاقصى للاشراف على المشاريع', path: '/project-supervision-exceeded' },
  { id: 'teachersWithoutTheory', title: 'التدريسيون الذين ليس لديهم ساعات نظرية', path: '/teachers-without-theory' },
  { id: 'unassignedSupervisors', title: 'التدريسيون غير المكلفين بالاشراف', path: '/unassigned-supervisors' },
  { id: 'errors', title: 'ملخص الأخطاء', path: '/errors' },
  { id: 'charts', title: 'الإحصائيات', path: '/charts' },
];

const KEY = 'system-access-rules-v1';
export const SYSTEM_ACCESS_RULES_UPDATED_EVENT = 'system-access-rules-updated';


let remoteRulesStoreUnavailable = false;

const isRemoteRulesTableMissing = (error: unknown) => {
  const e = error as { code?: string; message?: string; details?: string; status?: number };
  const msg = `${e?.message || ''} ${e?.details || ''}`;
  return e?.status === 404 || e?.code === 'PGRST205' || /system_access_rules/i.test(msg) && /not\s+found|does not exist|could not find/i.test(msg);
};

type RawRules = Record<string, unknown>;

const defaultRule = (systemId?: string): SystemAccessRule => ({
  visible: true,
  protected: systemId === 'controlPanel',
  password: '',
});


const normalizeRules = (parsed: RawRules = {}): Record<string, SystemAccessRule> => {
  const out: Record<string, SystemAccessRule> = {};
  SYSTEMS_REGISTRY.forEach((s) => {
    const r = (parsed?.[s.id] as Partial<SystemAccessRule>) || {};
    const fallback = defaultRule(s.id);
    const rule: SystemAccessRule = {
      visible: typeof r.visible === 'boolean' ? r.visible : fallback.visible,
      protected: typeof r.protected === 'boolean' ? r.protected : fallback.protected,
      password: typeof r.password === 'string' ? r.password : fallback.password,
    };
    if (typeof r.title === 'string' && r.title.trim()) rule.title = r.title;
    if (typeof r.description === 'string') rule.description = r.description;
    if (typeof r.icon === 'string' && r.icon.trim()) rule.icon = r.icon;
    if (typeof r.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(r.color.trim())) rule.color = r.color.trim();
    if (typeof r.sort_order === 'number' && !isNaN(r.sort_order)) rule.sort_order = r.sort_order;
    if (typeof r.require_teacher_auth === 'boolean') rule.require_teacher_auth = r.require_teacher_auth;

    out[s.id] = rule;
  });
  return out;
};

const normalizeGroups = (parsed: RawRules = {}): SystemGroup[] => {
  const raw = parsed?.[GROUPS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.map((g: any, i: number) => ({
    id: String(g?.id || `group-${i}`),
    title: String(g?.title || `مجموعة ${i + 1}`),
    description: String(g?.description || ''),
    icon: String(g?.icon || '📦'),
    color: String(g?.color || '#475569'),
    systemIds: Array.isArray(g?.systemIds) ? g.systemIds.map(String) : [],
  })).filter(g => g.systemIds.length > 0);
};

export function getRules(): Record<string, SystemAccessRule> {
  if (typeof window === 'undefined' || !window.localStorage) return normalizeRules();
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeRules(raw ? JSON.parse(raw) : {});
  } catch { return normalizeRules(); }
}

export function getGroups(): SystemGroup[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeGroups(raw ? JSON.parse(raw) : {});
  } catch { return []; }
}

const normalizeBranding = (parsed: RawRules = {}): Branding => {
  const b = (parsed?.[BRANDING_KEY] as Partial<Branding>) || {};
  const size = Number(b.logo_size);
  return {
    logo_url: typeof b.logo_url === 'string' ? b.logo_url.trim() : DEFAULT_BRANDING.logo_url,
    app_title: typeof b.app_title === 'string' && b.app_title.trim() ? b.app_title : DEFAULT_BRANDING.app_title,
    university_line: typeof b.university_line === 'string' ? b.university_line : DEFAULT_BRANDING.university_line,
    show_banner: typeof b.show_banner === 'boolean' ? b.show_banner : true,
    show_logo: typeof b.show_logo === 'boolean' ? b.show_logo : true,
    show_title: typeof b.show_title === 'boolean' ? b.show_title : true,
    show_university_line: typeof b.show_university_line === 'boolean' ? b.show_university_line : true,
    logo_size: Number.isFinite(size) && size >= 48 && size <= 260 ? size : DEFAULT_BRANDING.logo_size,
  };
};

/** هوية الواجهة الحالية (من النسخة المحلية المتزامنة مع الخادم). */
export function getBranding(): Branding {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_BRANDING };
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeBranding(raw ? JSON.parse(raw) : {});
  } catch { return { ...DEFAULT_BRANDING }; }
}

export async function syncRulesFromRemote(): Promise<Record<string, SystemAccessRule>> {
  if (remoteRulesStoreUnavailable) return getRules();

  const { data, error } = await supabase.functions.invoke('system-rules', {
    body: { action: 'get' },
  });

  if (error) {
    if (isRemoteRulesTableMissing(error)) remoteRulesStoreUnavailable = true;
    return getRules();
  }
  const rules = (data as { rules?: RawRules } | null)?.rules;
  if (!rules) return getRules();

  const normalized = normalizeRules(rules);
  const groups = normalizeGroups(rules);
  const branding = normalizeBranding(rules);
  const toStore: RawRules = { ...normalized, [GROUPS_KEY]: groups, [BRANDING_KEY]: branding };
  localStorage.setItem(KEY, JSON.stringify(toStore));
  window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
  return normalized;
}

/**
 * Checks a protected system's password on the server. The real password is
 * never sent to the browser, so comparison cannot happen locally.
 */
export async function verifySystemPassword(systemId: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('system-rules', {
    body: { action: 'verify', system_id: systemId, password },
  });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
}

/** Maps a route path to its registry id (used by the password gate). */
export function getSystemIdByPath(pathname: string): string | null {
  const normalizedPath = normalizePath(pathname);
  return SYSTEMS_REGISTRY.find((s) => normalizePath(s.path) === normalizedPath)?.id || null;
}


export async function setRules(
  rules: Record<string, SystemAccessRule>,
  password: string,
  groups?: SystemGroup[],
  branding?: Branding,
) {
  const groupList = groups ?? getGroups();
  const brandingValue = branding ?? getBranding();
  const payload: RawRules = { ...rules, [GROUPS_KEY]: groupList, [BRANDING_KEY]: brandingValue };
  const { data, error } = await supabase.functions.invoke('system-rules', {
    body: { password, rules: payload },
  });
  if (error) {
    const ctx: any = (error as any).context;
    let msg = error.message;
    if (ctx?.body) {
      try {
        const txt = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text();
        const j = JSON.parse(txt);
        if (j?.error) msg = j.error;
      } catch { /* ignore */ }
    }
    throw new Error(msg || 'تعذر حفظ الإعدادات على الخادم');
  }
  if ((data as any)?.error) throw new Error((data as any).error);

  localStorage.setItem(KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
}

const normalizePath = (pathname: string) => {
  if (!pathname) return '/';
  const cleaned = pathname.replace(/\/+$/, '');
  return cleaned || '/';
};

export function getRuleByPath(pathname: string): SystemAccessRule | null {
  const normalizedPath = normalizePath(pathname);
  const m = SYSTEMS_REGISTRY.find((s) => normalizePath(s.path) === normalizedPath);
  if (!m) return null;
  return getRules()[m.id] || defaultRule(m.id);
}

export function getGroupById(id: string): SystemGroup | null {
  return getGroups().find(g => g.id === id) || null;
}
