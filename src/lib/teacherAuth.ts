import { supabase } from '@/integrations/supabase/client';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import { SYSTEMS } from '@/data/scheduleData';

const STORAGE_KEY = 'teacher_session_v2';
const CONNECTION_KEY = 'teacher_sheet_connection_v1';
const FN = 'sheet-auth';

import type { UserPermissions, AppRole } from './permissions';

export interface TeacherUser {
  id: string;
  full_name: string;
  department: string;
  college: string;
  role: AppRole;
  /** المنصب (مثل: رئيس قسم) — يُستخدم في فلترة البيانات حسب المنصب. */
  position?: string;
  must_change_password: boolean;
  permissions?: UserPermissions | null;
}

export interface AdminUser extends TeacherUser {
  is_manual: boolean;
  created_at: string;
}

export interface ArchiveEntry {
  id: string;
  user_id: string | null;
  full_name: string;
  action: string;
  performed_by: string | null;
  created_at: string;
}

interface Session { token: string; user: TeacherUser; }
export interface SheetConnectionConfig {
  sheet_id: string;
  service_account_json: string;
  assignments_csv?: string;
}

export function getConnectionConfig(): SheetConnectionConfig | null {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function setConnectionConfig(cfg: SheetConnectionConfig | null) {
  if (cfg) safeLocalSet(CONNECTION_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CONNECTION_KEY);
}

function toFriendlyAuthError(error: unknown): Error {
  const raw = (error as Error)?.message || 'Unknown error';
  if (raw.includes('non-2xx status code')) {
    return new Error('تعذر الوصول إلى خدمة تسجيل الدخول حالياً. تأكد من نشر دالة المصادقة وإعداد الأسرار (GOOGLE_SERVICE_ACCOUNT_JSON و GOOGLE_SHEET_ID).');
  }
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return new Error('فشل الاتصال بخدمة تسجيل الدخول. تحقق من الاتصال بالإنترنت أو إعدادات المشروع.');
  }
  return new Error(raw);
}


function isQuotaError(e: unknown): boolean {
  const err = e as any;
  if (!err) return false;
  return err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22 || err.code === 1014
    || /quota/i.test(String(err.message || ''));
}

/** يمسح كل ذاكرات كاش أوراق Google Sheets لتحرير مساحة localStorage. */
function purgeSheetCaches(): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith('sheets:') || k === 'live_schedule_v3' || k.startsWith('live_schedule_')) {
        keys.push(k);
      }
    }
    keys.forEach((k) => { try { localStorage.removeItem(k); removed++; } catch { /* ignore */ } });
  } catch { /* ignore */ }
  return removed;
}

/** كتابة آمنة إلى localStorage: عند امتلاء الحصّة نُنظّف كاش الأوراق ونعيد المحاولة، ثم نلجأ إلى sessionStorage. */
function safeLocalSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (!isQuotaError(e)) { try { console.warn('localStorage setItem failed', e); } catch {} return false; }
    const n = purgeSheetCaches();
    try { console.warn(`تم تنظيف ${n} مفتاح كاش أوراق لتحرير مساحة التخزين.`); } catch {}
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e2) {
      try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
      try { console.warn('تعذر الكتابة إلى localStorage حتى بعد التنظيف؛ استُخدم sessionStorage كخطة بديلة.', e2); } catch {}
      return false;
    }
  }
}

export function getSession(): Session | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { try { raw = sessionStorage.getItem(STORAGE_KEY); } catch { raw = null; } }
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function setSession(s: Session | null) {
  if (s) {
    safeLocalSet(STORAGE_KEY, JSON.stringify(s));
  } else {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}


async function call<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const session = getSession();
  const connection = getConnectionConfig();
  const { data, error } = await supabase.functions.invoke(FN, {
    body: { action, token: session?.token, connection, ...payload },
  });
  if (error) {
    // Try to surface server-provided error message when present
    const ctx: any = (error as any).context;
    if (ctx?.body) {
      try {
        const txt = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text();
        const j = JSON.parse(txt);
        if (j?.error) throw toFriendlyAuthError(new Error(j.error));
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message) {
          throw toFriendlyAuthError(parseErr);
        }
      }
    }
    throw toFriendlyAuthError(error);
  }
  if ((data as any)?.error) throw toFriendlyAuthError(new Error((data as any).error));
  return data as T;
}

export async function fetchTeacherList(): Promise<string[]> {
  try {
    const r = await call<{ users: string[] }>('list-users');
    const users = (r.users || []).map((n) => n.trim()).filter(Boolean);
    if (users.length > 0) return users;
  } catch {
    // Fall through to CSV fallback.
  }

  // Fallback: read names directly from assignments sheet so dropdown never stays empty.
  const rows = await fetchIndividualAssignmentRows();
  const names = Array.from(new Set(
    rows
      .map((r) => (r['اسم التدريسي'] || '').toString().trim())
      .filter(Boolean),
  ));
  if (names.length > 0) return names.sort((a, b) => a.localeCompare(b, 'ar'));

  // Last-resort fallback: bundled dataset used by the assignments page.
  const systemRows = SYSTEMS.find((s) => s.id === 'individualAssignments')?.rows || [];
  const bundledNames = Array.from(new Set(
    systemRows
      .map((r) => (r['اسم التدريسي'] || '').toString().trim())
      .filter(Boolean),
  ));
  return bundledNames.sort((a, b) => a.localeCompare(b, 'ar'));
}

/**
 * Fire-and-forget: ask the edge function to append any new teacher names from
 * the assignments sheet to the users sheet. Existing rows (and their passwords)
 * are never modified. Safe to call frequently — runs on the server.
 */
const BG_SYNC_KEY = 'teacher_bg_sync_at';
const BG_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 دقائق على الأقل بين عمليات المزامنة لتفادي ضغط Sheets API
export function backgroundSyncTeachers(): void {
  try {
    const last = Number(localStorage.getItem(BG_SYNC_KEY) || '0');
    if (Date.now() - last < BG_SYNC_MIN_INTERVAL_MS) return;
    localStorage.setItem(BG_SYNC_KEY, String(Date.now()));
  } catch { /* ignore */ }
  const connection = getConnectionConfig();
  supabase.functions
    .invoke(FN, { body: { action: 'background-sync', connection } })
    .catch(() => { /* ignore */ });
}

function normalizeTeacherName(name: string): string {
  return (name || '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function login(full_name: string, password: string): Promise<Session> {
  const normalizedName = normalizeTeacherName(full_name);
  const normalizedPassword = (password || '').trim();
  const r = await call<{ token: string; user: TeacherUser }>('login', {
    full_name: normalizedName,
    password: normalizedPassword,
  });
  const s = { token: r.token, user: r.user };
  setSession(s);
  return s;
}

export async function logout() {
  try { await call('logout'); } catch { /* ignore */ }
  setSession(null);
  try { sessionStorage.removeItem('admin_pw_session_v1'); } catch { /* ignore */ }
}

export async function refreshMe(): Promise<TeacherUser | null> {
  try {
    const r = await call<{ user: TeacherUser | null }>('me');
    if (!r?.user) { setSession(null); return null; }
    const cur = getSession();
    if (cur) setSession({ ...cur, user: r.user });
    return r.user;
  } catch {
    setSession(null);
    return null;
  }
}

export async function changePassword(old_password: string, new_password: string) {
  await call('change-password', { old_password, new_password });
  await refreshMe();
}

// Admin
export async function adminListUsers(): Promise<AdminUser[]> {
  const r = await call<{ users: AdminUser[] }>('admin-list');
  return r.users || [];
}
export async function adminResetPassword(user_id: string, new_password?: string) {
  return call<{ ok: true; new_password: string }>('admin-reset-password', { user_id, new_password });
}
export async function adminCreateUser(payload: {
  full_name: string; department?: string; college?: string; role?: AppRole; password?: string; position?: string;
}) {
  return call<{ ok: true; password: string }>('admin-create-user', payload);
}
export async function adminUpdateUser(user_id: string, payload: { department?: string; college?: string; position?: string }) {
  return call<{ ok: true }>('admin-update-user', { user_id, ...payload });
}
export async function adminDeleteUser(user_id: string) {
  return call('admin-delete-user', { user_id });
}
export async function adminSync() {
  return call<{ added: number; total: number }>('admin-sync');
}
export async function adminTestConnection() {
  return call<{ ok: true; users: number; added: number; removedDuplicates: number }>('connection-test');
}
export async function adminArchive(): Promise<ArchiveEntry[]> {
  const r = await call<{ archive: ArchiveEntry[] }>('admin-archive');
  return r.archive || [];
}
export async function adminSetRole(user_id: string, role: AppRole) {
  return call<{ ok: true }>('admin-set-role', { user_id, role });
}
export async function adminSetPermissions(user_id: string, permissions: UserPermissions) {
  return call<{ ok: true }>('admin-set-permissions', { user_id, permissions });
}

/** كلمة مرور المدير لعمليات الحذف — مخزَّنة في sessionStorage بعد إدخالها مرة واحدة. */
const ADMIN_PW_KEY = 'admin_pw_session_v1';
export function getCachedAdminPassword(): string | null {
  try { return sessionStorage.getItem(ADMIN_PW_KEY); } catch { return null; }
}
export function setCachedAdminPassword(pw: string | null) {
  try {
    if (pw) sessionStorage.setItem(ADMIN_PW_KEY, pw);
    else sessionStorage.removeItem(ADMIN_PW_KEY);
  } catch { /* ignore */ }
}

