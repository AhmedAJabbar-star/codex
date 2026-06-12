/**
 * صلاحيات المستخدمين على مستوى النظام.
 * - الأدوار الجاهزة: admin / editor / viewer / user
 * - يمكن تخصيص صلاحيات لكل نظام مخصّص باستخدام permissions.systems[systemId]
 */

import type { CrudPermissions, CustomSystemDef } from '@/data/customSystemsRegistry';
import { getCrudPerms } from '@/data/customSystemsRegistry';

export type AppRole = 'admin' | 'editor' | 'viewer' | 'user';

export interface UserPermissions {
  /** صلاحيات لكل نظام (تتجاوز افتراضي الدور حين تُحدَّد). */
  systems?: Record<string, Partial<CrudPermissions>>;
}

/** القيم الافتراضية لكل دور — تُستخدم حين لا يوجد تخصيص للنظام. */
export const ROLE_DEFAULTS: Record<AppRole, Required<CrudPermissions>> = {
  admin:  { view: true,  add: true,  edit: true,  delete: true  },
  editor: { view: true,  add: true,  edit: true,  delete: false },
  viewer: { view: true,  add: false, edit: false, delete: false },
  user:   { view: true,  add: false, edit: false, delete: false },
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: '🛡️ مدير',
  editor: '✏️ محرّر',
  viewer: '👁️ مُطّلِع',
  user: '👤 مستخدم',
};

/**
 * يحسب الصلاحيات الفعّالة لمستخدم على نظام مخصّص.
 * = صلاحيات النظام (مما سمح به منشئ النظام) ∩ صلاحيات المستخدم (الدور أو التخصيص).
 */
export function getEffectivePerms(
  def: Partial<CustomSystemDef>,
  user: { role?: string; permissions?: UserPermissions | null } | null | undefined,
): Required<CrudPermissions> {
  const sysPerms = getCrudPerms(def);
  const role = ((user?.role as AppRole) || 'user');
  const roleDefaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.user;
  const override = user?.permissions?.systems?.[String(def.id || '')] || {};
  const userPerms: Required<CrudPermissions> = {
    view:   override.view   ?? roleDefaults.view,
    add:    override.add    ?? roleDefaults.add,
    edit:   override.edit   ?? roleDefaults.edit,
    delete: override.delete ?? roleDefaults.delete,
  };
  return {
    view:   sysPerms.view   && userPerms.view,
    add:    sysPerms.add    && userPerms.add,
    edit:   sysPerms.edit   && userPerms.edit,
    delete: sysPerms.delete && userPerms.delete,
  };
}
