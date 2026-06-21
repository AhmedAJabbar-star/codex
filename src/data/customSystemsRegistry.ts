import { supabase } from '@/integrations/supabase/client';
import type { Condition, ConditionOp, DerivedColumn } from '@/lib/conditionEngine';

export interface SignatureItem { label: string; name?: string }

/** Saved print/preview settings per system. When set, they override the toolbar defaults
 *  and the preview bar is hidden by default — the user can still reveal it via the
 *  «⚙️ إعدادات الطباعة» floating button (unless show_toolbar is forced true). */
export interface PrintPrefs {
  orient?: 'portrait' | 'landscape';
  size?: 'A4' | 'A3' | 'Letter';
  margin?: '5' | '8' | '12';
  repeatHeader?: boolean;
  compactRepeat?: boolean;
  repeatSigs?: boolean;
  showLogo?: boolean;
  showTitle?: boolean;
  showInfo?: boolean;
  showFilters?: boolean;
  showDate?: boolean;
  showDocnum?: boolean;
  showCount?: boolean;
  showSigs?: boolean;
  fit?: boolean;
  /** Show the diagonal "University of Technology" watermark. Default true. */
  showWatermark?: boolean;
  /** Optional override text for the watermark. */
  watermarkText?: string;
  /** When true, the preview toolbar is shown by default. When false/undefined, it is hidden
   *  (a small floating settings button is shown so the user can still adjust if needed). */
  show_toolbar?: boolean;
}

/** A named rule attached to a filter. When the user picks it, only rows whose source cell satisfies the rule pass. */
export interface FilterRule {
  label: string;
  op: ConditionOp;
  value?: string | number;
  values?: (string | number)[];
}

export interface FilterConfigItem {
  column: string; // Excel letter
  label?: string; // optional override
  control?: 'select' | 'combo' | 'text';
  /** Custom placeholder text for the search input when control = 'combo'. */
  search_placeholder?: string;
  /** Optional named rules — appear in the dropdown as choices. */
  rules?: FilterRule[];
  /** When true (and rules exist), also include the column's individual values in the dropdown. */
  include_values?: boolean;
  /** When true, the user MUST choose a value before any data renders (مثل «الفصل الدراسي» في تكليفات التدريسي). */
  required?: boolean;
}

/** Quick-filter button (toggle) shown above the table — same UX as «غير مستوفي» in تدقيق النصاب. */
export interface QuickFilterConfig {
  label: string;
  icon?: string;
  color?: string;
  column: string; // Excel letter
  op: ConditionOp;
  value?: string | number;
  values?: (string | number)[];
}

/** CRUD permission flags — each can be toggled independently. */
export interface CrudPermissions {
  view?: boolean;   // عرض جدول الإدارة
  add?: boolean;    // إضافة
  edit?: boolean;   // تعديل
  delete?: boolean; // حذف
}

export interface CustomSystemDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  /** 'current' = use the project's published sheet (default), 'external' = use a separate Google Sheet via URL. */
  sheet_source?: 'current' | 'external';
  /** Full Google Sheets URL when sheet_source = 'external' (e.g., https://docs.google.com/spreadsheets/d/<ID>/edit). */
  sheet_url?: string;
  sheet_gid: string;
  columns_range: string;
  filter_columns: string;
  filters_config?: FilterConfigItem[];
  conditions: Condition[];
  conditions_logic?: 'AND' | 'OR';
  derived_columns: DerivedColumn[];
  header_labels?: Record<string, string>;
  signatures?: SignatureItem[];
  /** Print/preview settings — when set, used as fixed defaults; toolbar hidden by default. */
  print_prefs?: PrintPrefs;
  /** Excel letters of filters that the user MUST choose before any data renders. */
  required_filters?: string[];
  /** Toggle-style buttons rendered above the table (multiple may be active). */
  quick_filters?: QuickFilterConfig[];
  /** Position on the home dashboard. Lower = earlier. Default 100. */
  sort_order?: number;
  protected: boolean;
  password: string;
  hint: string;
  enabled: boolean;
  /** When true, only authenticated teachers (Individual Assignments login) may access this system. */
  require_teacher_auth?: boolean;
  /** Excel letter (e.g. "F") of the column containing the teacher's full name. */
  teacher_column?: string;
  /** Excel letter of the column containing the teacher's department (for department-scoped filtering). */
  teacher_department_column?: string;
  /** How to scope visible rows when teacher auth is required.
   *  - 'name' (default): only rows where teacher_column equals the logged-in name
   *  - 'department': only rows where teacher_department_column equals the user's department
   *  - 'name_or_department': either match — useful for heads of department
   *  - 'all': no row-level filter (just gated by login) */
  teacher_filter_scope?: 'name' | 'department' | 'name_or_department' | 'all';
  /** Legacy: enables Add / Edit / Delete on the source Google Sheet (admin password required).
   *  Kept for backwards compatibility — when true and no crud_permissions are set, all four perms apply. */
  crud_enabled?: boolean;
  /** Fine-grained CRUD permissions (preferred over crud_enabled). */
  crud_permissions?: CrudPermissions;
  /** Per-column input type for the CRUD form. Key = Excel letter, value = type. */
  column_types?: Record<string, 'text' | 'number' | 'date' | 'select' | 'readonly'>;
  /** Comma-separated select options per column letter (used when column_types[letter] === 'select' AND source = 'manual'). */
  column_options?: Record<string, string>;
  /** Source of the dropdown options: 'manual' (default, from column_options) or 'column' (unique values from the column itself). */
  column_select_source?: Record<string, 'manual' | 'column'>;
  /** When true, the select also accepts values not in the list (renders as combobox/datalist). */
  column_select_allow_custom?: Record<string, boolean>;
  /** Per-column link button label (Excel letter -> button text). When set, cells with a URL
   *  in this column render as a clickable button («افتح الملف» / «Open» ...) opening the URL
   *  in a new tab instead of showing the raw URL. */
  column_link_labels?: Record<string, string>;
}

/** Resolve effective CRUD permissions with backward compatibility. */
export function getCrudPerms(def: Partial<CustomSystemDef>): Required<CrudPermissions> {
  const p = def.crud_permissions || {};
  // Legacy: if old crud_enabled was true, default all four to true unless explicitly overridden.
  const legacyAll = def.crud_enabled === true && !def.crud_permissions;
  return {
    view:   p.view   ?? legacyAll,
    add:    p.add    ?? legacyAll,
    edit:   p.edit   ?? legacyAll,
    delete: p.delete ?? legacyAll,
  };
}

/** True when at least one CRUD permission is enabled (governs whether the CRUD panel renders). */
export function isCrudActive(def: Partial<CustomSystemDef>): boolean {
  const p = getCrudPerms(def);
  return !!(p.view || p.add || p.edit || p.delete);
}

export const EMPTY_SYSTEM: CustomSystemDef = {
  id: '',
  title: '',
  description: '',
  icon: '📋',
  color: '#0891b2',
  sheet_source: 'current',
  sheet_url: '',
  sheet_gid: '',
  columns_range: 'F:N',
  filter_columns: '',
  filters_config: [],
  conditions: [],
  conditions_logic: 'AND',
  derived_columns: [],
  header_labels: {},
  signatures: [],
  required_filters: [],
  quick_filters: [],
  sort_order: 100,
  protected: false,
  password: '',
  hint: '',
  enabled: true,
  require_teacher_auth: false,
  teacher_column: '',
  teacher_department_column: '',
  teacher_filter_scope: 'name',
  crud_enabled: false,
  crud_permissions: { view: false, add: false, edit: false, delete: false },
  column_types: {},
  column_options: {},
  column_select_source: {},
  column_select_allow_custom: {},
  column_link_labels: {},
};



export async function listCustomSystems(): Promise<CustomSystemDef[]> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'list' },
  });
  if (error) throw new Error(error.message || 'فشل تحميل الأنظمة المخصّصة');
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.systems || []) as CustomSystemDef[];
}

export async function saveCustomSystem(system: CustomSystemDef, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'save', password, system },
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
    throw new Error(msg || 'فشل الحفظ');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
}

export async function deleteCustomSystem(id: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'delete', password, id },
  });
  if (error) throw new Error(error.message || 'فشل الحذف');
  if ((data as any)?.error) throw new Error((data as any).error);
}

export const CUSTOM_SYSTEMS_UPDATED_EVENT = 'custom-systems-updated';

/** CRUD against the source Google Sheet for a custom system. Admin password required. */
export type SheetWriteOp = 'append' | 'update' | 'delete';
export interface SheetWritePayload {
  op: SheetWriteOp;
  gid: string;
  /** Optional external sheet URL (when system.sheet_source === 'external'). */
  sheet_url?: string;
  /** Map of column letter -> value for the new/updated row. */
  values?: Record<string, string>;
  /** Snapshot of the original row (letter -> value) used to locate the row on the server. */
  match?: Record<string, string>;
  password: string;
}
export async function sheetWrite(payload: SheetWritePayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'sheet-write', ...payload },
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
    throw new Error(msg || 'فشل تنفيذ العملية');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
}
