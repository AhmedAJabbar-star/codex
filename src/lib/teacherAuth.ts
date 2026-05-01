import { supabase } from '@/integrations/supabase/client';
import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';
import { SYSTEMS } from '@/data/scheduleData';

const STORAGE_KEY = 'teacher_session_v2';
const FN = 'sheet-auth';

export interface TeacherUser {
  id: string;
  full_name: string;
  department: string;
  college: string;
  role: 'user' | 'admin';
  must_change_password: boolean;
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

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function setSession(s: Session | null) {
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

async function call<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const session = getSession();
  const { data, error } = await supabase.functions.invoke(FN, {
    body: { action, token: session?.token, ...payload },
  });
  if (error) {
    // Try to surface server-provided error message when present
    const ctx: any = (error as any).context;
    if (ctx?.body) {
      try {
        const txt = typeof ctx.body === 'string' ? ctx.body : await new Response(ctx.body).text();
        const j = JSON.parse(txt);
        if (j?.error) throw new Error(j.error);
      } catch (_) { /* fall through */ }
    }
    throw new Error(error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
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
export function backgroundSyncTeachers(): void {
  supabase.functions
    .invoke(FN, { body: { action: 'background-sync' } })
    .catch(() => { /* ignore */ });
}

export async function login(full_name: string, password: string): Promise<Session> {
  const r = await call<{ token: string; user: TeacherUser }>('login', { full_name, password });
  const s = { token: r.token, user: r.user };
  setSession(s);
  return s;
}

export async function logout() {
  try { await call('logout'); } catch { /* ignore */ }
  setSession(null);
}

export async function refreshMe(): Promise<TeacherUser | null> {
  try {
    const r = await call<{ user: TeacherUser }>('me');
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
  full_name: string; department?: string; college?: string; role?: 'user' | 'admin'; password?: string;
}) {
  return call<{ ok: true; password: string }>('admin-create-user', payload);
}
export async function adminDeleteUser(user_id: string) {
  return call('admin-delete-user', { user_id });
}
export async function adminSync() {
  return call<{ added: number; total: number }>('admin-sync');
}
export async function adminArchive(): Promise<ArchiveEntry[]> {
  const r = await call<{ archive: ArchiveEntry[] }>('admin-archive');
  return r.archive || [];
}
