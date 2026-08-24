import { useEffect, useMemo } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import SingleSystemPage from '@/components/shared/SingleSystemPage';
import { LiveLoadingShell } from '@/components/shared/LiveLoadingShell';
import { listCustomSystems } from '@/data/customSystemsRegistry';
import { fetchSheetByGid } from '@/data/supervisionData';
import { buildJoinedTable } from '@/lib/joinEngine';
import type { SystemConfig } from '@/data/scheduleData';

/** تقرير مدمج من نظامين — يُعرَّف بالكامل من منشئ الأنظمة بدون كود. */
const JoinedReport = () => {
  const { id = '', jid = '' } = useParams<{ id: string; jid: string }>();

  const { data: systems, isLoading } = useQuery({
    queryKey: ['custom-systems-list'],
    queryFn: () => listCustomSystems(),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const def = useMemo(() => (systems || []).find((s) => s.id === id), [systems, id]);
  const cfg = useMemo(() => (def?.joined_reports || []).find((j) => j.id === jid), [def, jid]);
  const target = useMemo(() => (systems || []).find((s) => s.id === cfg?.target_id), [systems, cfg]);

  const enabled = !!def && !!cfg && !!target;

  const { data, isLoading: loadingSheets, error } = useQuery({
    queryKey: ['joined-report', id, jid],
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 60_000,
    queryFn: async () => {
      const [l, r] = await Promise.all([
        fetchSheetByGid(def!.sheet_gid, def!.sheet_source === 'external' ? def!.sheet_url : undefined),
        fetchSheetByGid(target!.sheet_gid, target!.sheet_source === 'external' ? target!.sheet_url : undefined),
      ]);
      return buildJoinedTable(cfg!, l, r);
    },
  });

  // تنسيق الجدول القابل للتحكم الكامل من المنشئ (هيدر/صفوف/فوتر/الخط/الارتفاع).
  const st = cfg?.style || {};
  useEffect(() => {
    if (!cfg) return;
    const el = document.createElement('style');
    el.id = 'joined-report-style';
    el.textContent = `
      .schedule-table thead th { ${st.header_bg ? `background:${st.header_bg} !important;background-image:none !important;` : ''} ${st.header_color ? `color:${st.header_color} !important;` : ''} }
      .schedule-table tbody td {
        ${st.row_bg ? `background:${st.row_bg};` : ''}
        ${st.text_color ? `color:${st.text_color};` : ''}
        ${st.border_color ? `border-color:${st.border_color};` : ''}
        ${st.font_size ? `font-size:${st.font_size}px;` : ''}
        ${st.row_height ? `padding-top:${Math.round(st.row_height / 3)}px;padding-bottom:${Math.round(st.row_height / 3)}px;` : ''}
        ${st.align ? `text-align:${st.align};` : ''}
      }
      ${st.alt_row_bg ? `.schedule-table tbody tr:nth-child(even) td { background:${st.alt_row_bg}; }` : ''}
      ${st.footer_bg ? `.schedule-table tfoot td, .schedule-agg-row td { background:${st.footer_bg} !important; }` : ''}
      ${st.footer_text ? `.schedule-table tfoot td, .schedule-agg-row td { color:${st.footer_text} !important; }` : ''}
    `;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [cfg, st.header_bg, st.header_color, st.row_bg, st.alt_row_bg, st.text_color, st.border_color, st.font_size, st.row_height, st.footer_bg, st.footer_text, st.align]);

  if (isLoading) return <LiveLoadingShell />;
  if (!def || !cfg) return <Navigate to="/" replace />;
  if (!target) return <LiveLoadingShell error={new Error('النظام المرتبط غير موجود — راجع إعداد التقرير المدمج')} />;
  if (error) return <LiveLoadingShell error={error as Error} />;
  if (loadingSheets || !data) return <LiveLoadingShell />;

  const system: SystemConfig = {
    id: `joined_${def.id}_${cfg.id}`,
    title: cfg.title || 'تقرير مدمج',
    appTitle: cfg.title || 'تقرير مدمج',
    universityLine: 'كلية الهندسة المدنية - الجامعة التكنولوجية',
    hint: `تقرير مدمج بين «${def.title}» و«${target.title}»`,
    icon: '🧩',
    headers: data.headers,
    filters: [],
    rows: data.rows,
    customSignatures: def.signatures && def.signatures.length > 0 ? def.signatures : undefined,
    printPrefs: def.print_prefs && Object.keys(def.print_prefs).length > 0 ? def.print_prefs : undefined,
    globalSearch: true,
    aggregations: cfg.show_totals
      ? data.numericHeaders.map((h) => ({ header: h, op: 'sum' as const, label: 'المجموع' }))
      : undefined,
    toolbarButtons: def.toolbar_buttons,
  };

  return <SingleSystemPage systemIds={[system.id]} systemsOverride={[system]} showBackButton />;
};

export default JoinedReport;
