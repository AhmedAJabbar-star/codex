import { supabase } from '@/integrations/supabase/client';
import type { Condition, DerivedColumn } from '@/lib/conditionEngine';

export interface CustomSystemDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  sheet_gid: string;
  columns_range: string;
  filter_columns: string; // comma-separated letters
  conditions: Condition[];
  derived_columns: DerivedColumn[];
  protected: boolean;
  password: string;
  hint: string;
  enabled: boolean;
}

export const EMPTY_SYSTEM: CustomSystemDef = {
  id: '',
  title: '',
  description: '',
  icon: '📋',
  color: '#0891b2',
  sheet_gid: '',
  columns_range: 'F:N',
  filter_columns: '',
  conditions: [],
  derived_columns: [],
  protected: false,
  password: '',
  hint: '',
  enabled: true,
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
