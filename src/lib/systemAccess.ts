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
};

export const SYSTEMS_REGISTRY: ManagedSystem[] = [
  { id: 'controlPanel', title: 'لوحة التحكم', path: '/control-panel' },
  { id: 'teacher', title: 'جدول الأستاذ', path: '/teacher' },
  { id: 'student', title: 'جدول الطالب', path: '/student' },
  { id: 'audit', title: 'أنظمة التدقيق', path: '/audit' },
  { id: 'tracking', title: 'متابعة سير التدريسات', path: '/tracking' },
  { id: 'emptyRooms', title: 'القاعات الشاغرة', path: '/empty-rooms' },
  { id: 'assignments', title: 'تكليفات التدريسي', path: '/assignments' },
  { id: 'individualAssignments', title: 'التكليفات الفردية', path: '/individual-assignments' },
  { id: 'errors', title: 'ملخص الأخطاء', path: '/errors' },
  { id: 'charts', title: 'الإحصائيات', path: '/charts' },
];

const KEY = 'system-access-rules-v1';
export const SYSTEM_ACCESS_RULES_UPDATED_EVENT = 'system-access-rules-updated';
const GLOBAL_RULES_ID = 'global';

type RawRules = Record<string, Partial<SystemAccessRule>>;

const defaultRule = (systemId?: string): SystemAccessRule => ({
  visible: true,
  protected: systemId === 'controlPanel',
  password: systemId === 'controlPanel' ? '2021' : '',
});

const normalizeRules = (parsed: RawRules = {}): Record<string, SystemAccessRule> => {
  const out: Record<string, SystemAccessRule> = {};
  SYSTEMS_REGISTRY.forEach((s) => {
    const r = parsed?.[s.id] || {};
    const fallback = defaultRule(s.id);
    out[s.id] = {
      visible: typeof r.visible === 'boolean' ? r.visible : fallback.visible,
      protected: typeof r.protected === 'boolean' ? r.protected : fallback.protected,
      password: typeof r.password === 'string' ? r.password : fallback.password,
    };
  });
  return out;
};

export function getRules(): Record<string, SystemAccessRule> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return normalizeRules();
  }

  try {
    const raw = localStorage.getItem(KEY);
    return normalizeRules(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeRules();
  }
}

export async function syncRulesFromRemote(): Promise<Record<string, SystemAccessRule>> {
  const { data, error } = await supabase
    .from('system_access_rules')
    .select('rules')
    .eq('id', GLOBAL_RULES_ID)
    .maybeSingle();

  if (error || !data?.rules) return getRules();

  const normalized = normalizeRules(data.rules as RawRules);
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
  }
  return normalized;
}

export async function setRules(rules: Record<string, SystemAccessRule>) {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(KEY, JSON.stringify(rules));
    window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
  }

  await supabase.from('system_access_rules').upsert(
    {
      id: GLOBAL_RULES_ID,
      rules,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
}

export function getRuleByPath(pathname: string): SystemAccessRule | null {
  const m = SYSTEMS_REGISTRY.find((s) => s.path === pathname);
  if (!m) return null;
  return getRules()[m.id] || defaultRule(m.id);
}
