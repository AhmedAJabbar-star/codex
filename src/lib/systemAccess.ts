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
const GLOBAL_RULES_ID = 'global';

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

export async function syncRulesFromRemote(): Promise<Record<string, SystemAccessRule>> {
  if (remoteRulesStoreUnavailable) return getRules();

  const { data, error } = await supabase
    .from('system_access_rules')
    .select('rules')
    .eq('id', GLOBAL_RULES_ID)
    .maybeSingle();

  if (error) {
    if (isRemoteRulesTableMissing(error)) remoteRulesStoreUnavailable = true;
    return getRules();
  }
  if (!data?.rules) return getRules();

  const parsed = data.rules as RawRules;
  const normalized = normalizeRules(parsed);
  const groups = normalizeGroups(parsed);
  const toStore: RawRules = { ...normalized, [GROUPS_KEY]: groups };
  localStorage.setItem(KEY, JSON.stringify(toStore));
  window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
  return normalized;
}

export async function setRules(rules: Record<string, SystemAccessRule>, password: string, groups?: SystemGroup[]) {
  const groupList = groups ?? getGroups();
  const payload: RawRules = { ...rules, [GROUPS_KEY]: groupList };
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
