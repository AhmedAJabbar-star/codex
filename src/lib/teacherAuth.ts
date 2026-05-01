import { fetchIndividualAssignmentRows } from '@/data/individualAssignments';

const STORAGE_KEY = 'teacher_session_v1';
const USER_PW_KEY = 'teacher_pw_map_v1';
const USER_ROLE_KEY = 'teacher_role_map_v1';
const ARCHIVE_KEY = 'teacher_archive_v1';
const USERS_CACHE_KEY = 'teacher_users_cache_v1';

export interface TeacherUser { id: string; full_name: string; department: string; college: string; role: 'user' | 'admin'; must_change_password: boolean; }
export interface AdminUser extends TeacherUser { is_manual: boolean; created_at: string; }
export interface ArchiveEntry { id: string; user_id: string | null; full_name: string; action: string; performed_by: string | null; created_at: string; }
interface Session { token: string; user: TeacherUser; }

type UserMap = Record<string, { password: string; must_change_password: boolean }>;

function read<T>(k: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return fallback; } }
function write(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)); }
function uid(name: string) { return `u_${btoa(unescape(encodeURIComponent(name))).replace(/=/g, '')}`; }

export function getSession(): Session | null { return read<Session | null>(STORAGE_KEY, null); }
export function setSession(s: Session | null) { if (s) write(STORAGE_KEY, s); else localStorage.removeItem(STORAGE_KEY); }

async function buildUsers(): Promise<TeacherUser[]> {
  const rows = await fetchIndividualAssignmentRows();
  const map = new Map<string, { department: string; college: string }>();
  rows.forEach((r) => {
    const name = (r['اسم التدريسي'] || '').trim();
    if (!name || map.has(name)) return;
    map.set(name, {
      department: (r['القسم'] || r['القسم الذي تنتمي اليه'] || '').trim(),
      college: (r['الكلية'] || r['الكلية التي تنتمي اليها'] || '').trim(),
    });
  });

  const pwMap = read<UserMap>(USER_PW_KEY, {});
  const roleMap = read<Record<string, 'user' | 'admin'>>(USER_ROLE_KEY, {});
  const cached = read<TeacherUser[]>(USERS_CACHE_KEY, []);
  const cachedMap = new Map(cached.map((u) => [u.full_name, u]));
  const users: TeacherUser[] = Array.from(map.entries()).map(([name, info]) => ({
    id: uid(name),
    full_name: name,
    department: info.department || cachedMap.get(name)?.department || '',
    college: info.college || cachedMap.get(name)?.college || '',
    role: roleMap[name] || 'user',
    must_change_password: pwMap[name] ? pwMap[name].must_change_password : true,
  }));
  users.push({ id: 'admin-aa', full_name: 'aa', department: 'إدارة النظام', college: 'إدارة النظام', role: 'admin', must_change_password: false });
  users.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
  write(USERS_CACHE_KEY, users);
  return users;
}

function appendArchive(entry: Omit<ArchiveEntry, 'id' | 'created_at'>) {
  const ar = read<ArchiveEntry[]>(ARCHIVE_KEY, []);
  ar.unshift({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry });
  write(ARCHIVE_KEY, ar.slice(0, 500));
}

export async function fetchTeacherList(): Promise<string[]> {
  const cached = read<TeacherUser[]>(USERS_CACHE_KEY, []);
  if (cached.length > 0) {
    buildUsers().catch(() => undefined);
    return cached.map((u) => u.full_name);
  }
  return (await buildUsers()).map((u) => u.full_name);
}

export async function login(full_name: string, password: string): Promise<Session> {
  const users = await buildUsers();
  const user = users.find((u) => u.full_name === full_name);
  if (!user) throw new Error('اسم التدريسي غير موجود');
  if (full_name === 'aa') {
    if (password !== 'aa') throw new Error('كلمة المرور غير صحيحة');
  } else {
    const pwMap = read<UserMap>(USER_PW_KEY, {});
    const current = pwMap[full_name]?.password || '123';
    if (password !== current) throw new Error('كلمة المرور غير صحيحة');
  }
  const s = { token: crypto.randomUUID(), user };
  setSession(s);
  return s;
}

export async function logout() { setSession(null); }
export async function refreshMe(): Promise<TeacherUser | null> {
  const s = getSession(); if (!s) return null;
  const users = await buildUsers();
  const user = users.find((u) => u.full_name === s.user.full_name);
  if (!user) { setSession(null); return null; }
  setSession({ ...s, user });
  return user;
}

export async function changePassword(old_password: string, new_password: string) {
  const s = getSession(); if (!s) throw new Error('الجلسة منتهية');
  if (new_password.length < 3) throw new Error('كلمة المرور قصيرة جداً');
  if (s.user.full_name === 'aa') { if (old_password !== 'aa') throw new Error('كلمة المرور الحالية غير صحيحة'); return; }
  const pwMap = read<UserMap>(USER_PW_KEY, {});
  const current = pwMap[s.user.full_name]?.password || '123';
  if (old_password !== current) throw new Error('كلمة المرور الحالية غير صحيحة');
  pwMap[s.user.full_name] = { password: new_password, must_change_password: false };
  write(USER_PW_KEY, pwMap);
  appendArchive({ user_id: s.user.id, full_name: s.user.full_name, action: 'self_change', performed_by: 'self' });
  await refreshMe();
}

export async function adminListUsers(): Promise<AdminUser[]> { return (await buildUsers()).map((u) => ({ ...u, is_manual: u.full_name === 'aa', created_at: new Date().toISOString() })); }
export async function adminResetPassword(user_id: string, new_password?: string) {
  const users = await buildUsers(); const u = users.find((x) => x.id === user_id); if (!u) throw new Error('المستخدم غير موجود');
  if (u.full_name === 'aa') throw new Error('لا يمكن إعادة تعيين المدير الافتراضي');
  const pwMap = read<UserMap>(USER_PW_KEY, {}); pwMap[u.full_name] = { password: new_password || '123', must_change_password: true }; write(USER_PW_KEY, pwMap);
  appendArchive({ user_id: u.id, full_name: u.full_name, action: 'admin_reset', performed_by: 'aa' });
  return { ok: true as const, new_password: new_password || '123' };
}
export async function adminCreateUser(payload: { full_name: string; department?: string; college?: string; role?: 'user' | 'admin'; password?: string; }) {
  const roleMap = read<Record<string, 'user' | 'admin'>>(USER_ROLE_KEY, {}); roleMap[payload.full_name] = payload.role === 'admin' ? 'admin' : 'user'; write(USER_ROLE_KEY, roleMap);
  const pwMap = read<UserMap>(USER_PW_KEY, {}); pwMap[payload.full_name] = { password: payload.password || '123', must_change_password: true }; write(USER_PW_KEY, pwMap);
  appendArchive({ user_id: uid(payload.full_name), full_name: payload.full_name, action: 'admin_create', performed_by: 'aa' });
  return { ok: true as const, password: payload.password || '123' };
}
export async function adminDeleteUser(user_id: string) { return { ok: true }; }
export async function adminSync() { const users = await buildUsers(); return { added: 0, total: users.length }; }
export async function adminArchive(): Promise<ArchiveEntry[]> { return read<ArchiveEntry[]>(ARCHIVE_KEY, []); }
