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

const defaultRule = (): SystemAccessRule => ({ visible: true, protected: false, password: '' });

export function getRules(): Record<string, SystemAccessRule> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const out: Record<string, SystemAccessRule> = {};
    SYSTEMS_REGISTRY.forEach((s) => {
      const r = parsed?.[s.id] || {};
      out[s.id] = {
        visible: typeof r.visible === 'boolean' ? r.visible : true,
        protected: !!r.protected,
        password: typeof r.password === 'string' ? r.password : '',
      };
    });
    return out;
  } catch {
    return Object.fromEntries(SYSTEMS_REGISTRY.map((s) => [s.id, defaultRule()]));
  }
}

export function setRules(rules: Record<string, SystemAccessRule>) {
  localStorage.setItem(KEY, JSON.stringify(rules));
}

export function getRuleByPath(pathname: string): SystemAccessRule | null {
  const m = SYSTEMS_REGISTRY.find((s) => s.path === pathname);
  if (!m) return null;
  return getRules()[m.id] || defaultRule();
}
