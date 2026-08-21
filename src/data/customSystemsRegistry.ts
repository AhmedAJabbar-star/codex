import { supabase } from '@/integrations/supabase/client';
import type { Condition, ConditionOp, ComputedColumn, ConflictCfg, DerivedColumn, GroupStage } from '@/lib/conditionEngine';

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
  /** طريقة توزيع عرض الأعمدة في التقرير الرسمي:
   *  - 'smart' (افتراضي): توزيع مخمّد يمنع هيمنة الأعمدة الطويلة ويمنح الأعمدة الفارغة مساحة كتابة
   *  - 'content': حسب طول المحتوى (السلوك القديم)
   *  - 'equal': أعمدة متساوية تماماً
   *  - 'manual': نسب يدوية من `col_widths` */
  col_width_mode?: 'smart' | 'content' | 'equal' | 'manual';
  /** نسبة عرض ثابتة (٪ من عرض الجدول) لكل عمود، بالمفتاح = عنوان العمود. 0/غير محدد = تلقائي. */
  col_widths?: Record<string, number>;
  /** Show the diagonal "University of Technology" watermark. Default true. */
  showWatermark?: boolean;
  /** Optional override text for the watermark. */
  watermarkText?: string;
  /** When true, the preview toolbar is shown by default. When false/undefined, it is hidden
   *  (a small floating settings button is shown so the user can still adjust if needed). */
  show_toolbar?: boolean;
  /** Fixed report title. When set, the title input in the preview is read-only. */
  title?: string;
  /** When true, all preview controls are locked (disabled) and the floating settings toggle
   *  is removed — the user cannot change or re-show anything hidden by the admin. */
  lock_settings?: boolean;
  /** When true AND lock_settings is on, the title input stays editable by the user
   *  even though every other preview control is locked. Ignored when lock_settings is false. */
  title_editable?: boolean;
  /** 🔠 نسبة حجم خط البيانات (٪ من الحجم التلقائي). الافتراضي 100. */
  font_scale?: number;
  /** ↕️ نسبة ارتفاع الخلية/السطر (٪ من الحشوة التلقائية). الافتراضي 100. */
  row_scale?: number;
  /** 📄 محاولة ضغط التقرير تلقائياً ليُطبع على ورقة واحدة. */
  one_page?: boolean;
  /** ✍️ ارتفاع المساحة الفارغة المخصصة للتوقيع والختم بالملليمتر. */
  signature_space_mm?: number;
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
  control?: 'select' | 'combo' | 'text' | 'numberRange' | 'dateRange';
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
  /** Excel letters (space/comma separated) of extra columns loaded for filtering/logic but HIDDEN from the table and CRUD form. */
  hidden_columns?: string;
  filter_columns: string;
  filters_config?: FilterConfigItem[];
  conditions: Condition[];
  conditions_logic?: 'AND' | 'OR';
  derived_columns: DerivedColumn[];
  /** 🧮 Computed columns (formulas) evaluated per row after conditions. */
  computed_columns?: ComputedColumn[];
  /** 📊 Group/aggregate stage applied after row filtering (e.g. teachers without theory). */
  group_stage?: GroupStage;
  /** ⚠️ Pairwise time-conflict detector (room/teacher double booking). */
  conflict_detector?: ConflictCfg;
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
  teacher_filter_scope?: 'name' | 'department' | 'name_or_department' | 'custom' | 'all';
  /** Legacy: enables Add / Edit / Delete on the source Google Sheet (admin password required).
   *  Kept for backwards compatibility — when true and no crud_permissions are set, all four perms apply. */
  crud_enabled?: boolean;
  /** Fine-grained CRUD permissions (preferred over crud_enabled). */
  crud_permissions?: CrudPermissions;
  /** Per-column input type for the CRUD form. Key = Excel letter, value = type. */
  column_types?: Record<string, 'text' | 'number' | 'date' | 'select' | 'readonly' | 'file'>;
  /** Default Google Drive folder (URL or ID) used to store uploaded files for this system. */
  drive_folder_id?: string;
  /** Per-column override of the Google Drive folder (Excel letter -> folder URL/ID). */
  column_drive_folders?: Record<string, string>;
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
  /** 📸 OCR — extract field values from an uploaded image into the CRUD form. */
  ocr_enabled?: boolean;
  /** Optional custom Arabic prompt override for the OCR model. */
  ocr_prompt?: string;
  /** Excel letters the OCR should populate. Empty = all editable columns. */
  ocr_fields?: string[];
  /** 📝 استخراج نص الملفات المرفوعة (صورة/PDF/…) وحفظه في عمود مجاور. */
  ocr_text_enabled?: boolean;
  /** خريطة: حرف عمود الملف ← حرف عمود حفظ النص. الافتراضي: العمود التالي مباشرة. */
  ocr_text_targets?: Record<string, string>;
  /** تعليمات مخصصة لاستخراج النص. */
  ocr_text_prompt?: string;
  /** 🎨 Highlight rows with a background color when conditions match. First matching rule wins. */
  row_rules?: RowRule[];
  /** 📊 Aggregation footer — SUM/AVG/COUNT/MIN/MAX/COUNT_UNIQUE per column on visible rows. */
  aggregations?: AggregationCfg[];
  /** 🔍 Enable a global search box above the table (filters across all visible columns). */
  global_search?: boolean;
  /** 🎨 UI theme override for this system only. Empty/undefined = follow the global theme. */
  ui_theme?: string;
  /** 📤 Enable bulk import of records from an Excel/CSV file (requires the «add» permission). */
  bulk_import_enabled?: boolean;
  /** 🚫 Prevent duplicate records using a composite key built from one or more columns. */
  dedupe_enabled?: boolean;
  /** Excel letters joined together to form the composite duplicate key. */
  dedupe_columns?: string[];
  /** Optional column that receives the joined key value (a generated ID column). */
  dedupe_key_column?: string;
  /** Separator used when joining the key columns. Default "|". */
  dedupe_separator?: string;

  /* ============ v14 — الهوية والقيود والربط والتتبّع و QR ============ */
  /** Excel letter of the column containing the user's college. */
  teacher_college_column?: string;
  /** Which identity criteria are used to scope rows (combined with teacher_scope_logic). */
  teacher_scope_criteria?: IdentityCriterion[];
  /** 'all' = every selected criterion must match, 'any' = at least one. Default 'any'. */
  teacher_scope_logic?: 'all' | 'any';

  /** 🔒 Allow each user to add only one record in this system. */
  single_response_enabled?: boolean;
  /** Excel letter of the column holding the user's identity (usually the name column). */
  single_response_column?: string;
  /** Allow the user to edit their own single record afterwards. */
  single_response_allow_edit?: boolean;

  /** 🎯 Per-column capacity for select options (letter -> config). */
  option_limits?: Record<string, OptionLimitCfg>;

  /** 🔗 Related systems — enables "next system" navigation with shared values pre-filled. */
  linked_systems?: LinkedSystemCfg[];

  /** 🧾 Automatic audit columns (created by/at, updated by/at). */
  audit_enabled?: boolean;
  audit_created_by_column?: string;
  audit_created_at_column?: string;
  audit_updated_by_column?: string;
  audit_updated_at_column?: string;

  /** 🗄️ Archive deleted rows into another sheet before removing them. */
  archive_enabled?: boolean;
  /** Google Sheets URL of the archive workbook (empty = same workbook). */
  archive_sheet_url?: string;
  /** GID of the archive sheet/tab. */
  archive_gid?: string;

  /** 📷 QR scanner for filling form fields. */
  qr_enabled?: boolean;
  /** Excel letters that can be filled by scanning. Empty = all editable columns. */
  qr_fields?: string[];
}

export type IdentityCriterion = 'name' | 'department' | 'college';

/** Capacity configuration for a select column. */
export interface OptionLimitCfg {
  /** Default capacity applied to every option (0/undefined = unlimited). */
  limit?: number;
  /** Per-option capacity overrides (option value -> capacity). */
  per?: Record<string, number>;
  /** What happens when an option is full: disable it (default) or hide it. */
  mode?: 'disable' | 'hide';
}

/** Relation to another custom system, used for chained data entry. */
export interface LinkedSystemCfg {
  /** id of the target custom system. */
  target_id: string;
  /** Button label. Defaults to «الانتقال إلى <اسم النظام>». */
  label?: string;
  /** Shared columns: source Excel letter -> target Excel letter. */
  map?: Record<string, string>;
}

/** Row-highlighting rule: when conditions pass, apply `color` as row background. */
export interface RowRule {
  color: string;
  label?: string;
  logic?: 'AND' | 'OR';
  conditions: Condition[];
}

/** Aggregation column configuration. */
export interface AggregationCfg {
  column: string; // Excel letter
  op: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'countUnique';
  label?: string;
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
  hidden_columns: '',
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
  drive_folder_id: '',
  column_drive_folders: {},
  column_options: {},
  column_select_source: {},
  column_select_allow_custom: {},
  column_link_labels: {},
  ocr_enabled: false,
  ocr_prompt: '',
  ocr_fields: [],
  ocr_text_enabled: false,
  ocr_text_targets: {},
  ocr_text_prompt: '',
  row_rules: [],
  aggregations: [],
  global_search: false,
  ui_theme: '',
  bulk_import_enabled: false,
  dedupe_enabled: false,
  dedupe_columns: [],
  dedupe_key_column: '',
  dedupe_separator: '|',
  teacher_college_column: '',
  teacher_scope_criteria: [],
  teacher_scope_logic: 'any',
  single_response_enabled: false,
  single_response_column: '',
  single_response_allow_edit: true,
  option_limits: {},
  linked_systems: [],
  audit_enabled: false,
  audit_created_by_column: '',
  audit_created_at_column: '',
  audit_updated_by_column: '',
  audit_updated_at_column: '',
  archive_enabled: false,
  archive_sheet_url: '',
  archive_gid: '',
  qr_enabled: false,
  qr_fields: [],
};



export async function listCustomSystems(): Promise<CustomSystemDef[]> {
  const forceUntil = typeof window !== 'undefined'
    ? Number(window.sessionStorage.getItem('custom-systems-force-refresh-until') || 0)
    : 0;
  const noCache = Date.now() < forceUntil;
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'list', no_cache: noCache },
  });
  if (error) throw new Error(error.message || 'فشل تحميل الأنظمة المخصّصة');
  if ((data as any)?.error) throw new Error((data as any).error);
  return ((data as any)?.systems || []) as CustomSystemDef[];
}

/**
 * Verifies a custom system's password on the server. The stored password is
 * masked in the public listing, so it can never be compared in the browser.
 */
export async function verifyCustomSystemPassword(id: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'verify', id, password },
  });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
}

const notifyCustomSystemsUpdated = () => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('custom-systems-force-refresh-until', String(Date.now() + 30_000));
  window.dispatchEvent(new Event(CUSTOM_SYSTEMS_UPDATED_EVENT));
};


export async function saveCustomSystem(system: CustomSystemDef, password: string, originalId?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'save', password, system, original_id: originalId },
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
  notifyCustomSystemsUpdated();
}

export async function deleteCustomSystem(id: string, password: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('custom-systems', {
    body: { action: 'delete', password, id },
  });
  if (error) throw new Error(error.message || 'فشل الحذف');
  if ((data as any)?.error) throw new Error((data as any).error);
  notifyCustomSystemsUpdated();
}

/** Column metadata for inline CRUD forms (built from CustomSystemDef + live sheet). */
export interface CrudColMeta {
  letter: string;
  header: string;
  type: 'text' | 'number' | 'date' | 'select' | 'readonly' | 'file';
  options: string[];
  allowCustom: boolean;
  source: 'manual' | 'column';
  /** For 'file' type: Google Drive folder URL/ID used to store the upload. */
  driveFolder?: string;
}

/** Data passed from a custom system to SingleSystemPage so that Add/Edit/Delete
 *  can render inline (adjacent to the main table) instead of in a duplicate panel. */
export interface CrudContext {
  def: CustomSystemDef;
  externalUrl?: string;
  cols: CrudColMeta[];
  perms: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  teacherCol?: string;
  teacherName?: string;
  /** Row key holding the JSON-encoded raw-sheet snapshot (Excel letter -> value). */
  snapshotKey: string;
  /** React-Query keys to invalidate after a successful write. */
  refetchQueryKeys: string[][];
  /** Logged-in identity (used for audit columns, single response, prefilling). */
  identity?: { name: string; department: string; college: string };
  /** How many times each option value is already used, per column letter. */
  optionCounts?: Record<string, Record<string, number>>;
  /** Number of records already submitted by the logged-in user (single-response systems). */
  myRecordsCount?: number;
  /** Snapshot of the user's own record (single response + edit allowed). */
  myRecordSnapshot?: Record<string, string> | null;
  /** Resolved related systems for chained data entry. */
  linked?: { id: string; title: string; icon?: string; label: string; map: Record<string, string> }[];
  /** Values received from a previous system to pre-fill the add form. */
  prefill?: Record<string, string>;
  /** Excel letters used by the audit columns (hidden from the form). */
  auditLetters?: string[];
}


export const CUSTOM_SYSTEMS_UPDATED_EVENT = 'custom-systems-updated';

/** CRUD against the source Google Sheet for a custom system. Admin password required. */
export type SheetWriteOp = 'append' | 'bulk_append' | 'update' | 'delete';
export interface SheetWritePayload {
  op: SheetWriteOp;
  gid: string;
  /** Optional external sheet URL (when system.sheet_source === 'external'). */
  sheet_url?: string;
  /** Map of column letter -> value for the new/updated row. */
  values?: Record<string, string>;
  /** Snapshot of the original row (letter -> value) used to locate the row on the server. */
  match?: Record<string, string>;
  /** Rows for op = 'bulk_append' (each is a map of column letter -> value). */
  rows?: Record<string, string>[];
  /** Name of the logged-in user — used for audit columns, single-response and archiving. */
  actor?: string;
  password: string;
}
export interface SheetWriteResult { ok?: boolean; inserted?: number; skipped_existing?: number; skipped_in_file?: number }
export async function sheetWrite(payload: SheetWritePayload): Promise<SheetWriteResult> {
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
  return (data || {}) as SheetWriteResult;
}
