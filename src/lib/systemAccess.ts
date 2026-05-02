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

let remoteRulesStoreUnavailable = false;

const isRemoteRulesTableMissing = (error: unknown) => {
  const e = error as { code?: string; message?: string; details?: string; status?: number };
  const msg = `${e?.message || ''} ${e?.details || ''}`;
  return e?.status === 404 || e?.code === 'PGRST205' || /system_access_rules/i.test(msg) && /not\s+found|does not exist|could not find/i.test(msg);
};

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

  const normalized = normalizeRules(data.rules as RawRules);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));
  return normalized;
}

export async function setRules(rules: Record<string, SystemAccessRule>) {
  localStorage.setItem(KEY, JSON.stringify(rules));
  window.dispatchEvent(new Event(SYSTEM_ACCESS_RULES_UPDATED_EVENT));

  if (remoteRulesStoreUnavailable) {
    return;
  }

  const { error } = await supabase.from('system_access_rules').upsert(
    {
      id: GLOBAL_RULES_ID,
      rules,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    if (isRemoteRulesTableMissing(error)) {
      remoteRulesStoreUnavailable = true;
      throw new Error('جدول إعدادات الوصول غير موجود على الخادم. تم حفظ الإعدادات محليًا فقط حتى يتم نشر Migration قاعدة البيانات.');
    }
    throw new Error(`تعذر حفظ إعدادات الوصول على الخادم: ${error.message}`);
  }
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
