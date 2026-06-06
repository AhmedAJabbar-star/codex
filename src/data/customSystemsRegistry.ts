import { supabase } from '@/integrations/supabase/client';
import type { Condition, ConditionOp, DerivedColumn } from '@/lib/conditionEngine';

export interface SignatureItem { label: string; name?: string }

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
  /** Position on the home dashboard. Lower = earlier. Default 100. */
  sort_order?: number;
  protected: boolean;
  password: string;
  hint: string;
  enabled: boolean;
  /** When true, only authenticated teachers (Individual Assignments login) may access this system. */
  require_teacher_auth?: boolean;
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
  sort_order: 100,
  protected: false,
  password: '',
  hint: '',
  enabled: true,
  require_teacher_auth: false,
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
