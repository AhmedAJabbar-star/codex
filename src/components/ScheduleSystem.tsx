import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SYSTEMS, TIME_OPTIONS_ARABIC, type SystemConfig, type ScheduleRow } from '@/data/scheduleData';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import universityLogo from '@/assets/university-logo.jpg';

/* ───── Time parsing helper ───── */
function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
  const match = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|ص|م)/i);
  if (!match) return null;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const period = match[4];
  const isAM = period === 'AM' || period === 'am' || period === 'ص';
  const isPM = period === 'PM' || period === 'pm' || period === 'م';
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

/* ───── Print helper ───── */
function openPrintWindow(title: string, headers: string[], rows: ScheduleRow[], footerHtml: string, singlePage?: boolean) {
  const w = window.open('', '_blank');
  if (!w) return;

  const tableRows = rows.map((r, i) =>
    `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${headers.map(h => `<td>${r[h] || ''}</td>`).join('')}</tr>`
  ).join('');

  const colCount = headers.length;
  const fontSize = singlePage ? '7px' : colCount > 12 ? '9px' : colCount > 8 ? '10px' : '11px';
  const singlePageCSS = singlePage ? `
    @page{size:landscape;margin:4mm}
    html,body{height:100vh;overflow:hidden}
    .print-wrap{max-height:100vh;overflow:hidden}
    table{font-size:${fontSize} !important}
    td,th{padding:3px 2px !important}
  ` : `@page{size:landscape;margin:6mm}`;

  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;color:#000;background:#fff;padding:0}
.print-header{text-align:center;padding:20px 15px 15px;border-bottom:3px double #0f4c81}
.print-header img{width:80px;height:80px;object-fit:contain;margin-bottom:8px}
.print-header h1{font-size:18px;color:#0f4c81;margin:0 0 4px;font-weight:900}
.print-header h2{font-size:22px;color:#000;margin:0;font-weight:900}
.print-header .subtitle{font-size:12px;color:#555;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:${fontSize};margin-top:12px}
th{background:#0f4c81;color:#fff;padding:8px 5px;font-weight:800;border:1px solid #0b3558;white-space:nowrap;text-align:center}
td{padding:6px 5px;border:1px solid #c5d3e3;text-align:center;font-weight:600;vertical-align:middle}
tr.even{background:#f0f6ff}
tr.odd{background:#fff}
tr:hover{background:#e3edfa !important}
.footer{margin-top:18px;border-top:3px double #0f4c81;padding:12px 15px;font-size:11px;line-height:2;color:#333}
.footer strong{color:#0f4c81}
.stats-bar{display:flex;gap:12px;justify-content:center;padding:10px 15px;flex-wrap:wrap}
.stats-bar .stat{background:#f0f6ff;border:1px solid #c5d3e3;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:700;color:#0f4c81}
@media print{
  ${singlePageCSS}
  body{padding:0}
  tr,td,th{page-break-inside:avoid}
  .print-header{border-bottom-color:#000}
  .footer{border-top-color:#000}
}
</style></head><body>
<div class="print-wrap">
<div class="print-header">
<img src="${universityLogo}" alt="شعار الجامعة"/>
<h1>كلية الهندسة المدنية - الجامعة التكنولوجية</h1>
<h2>${title}</h2>
<div class="subtitle">عدد السجلات: ${rows.length}</div>
</div>
<div class="stats-bar">
<div class="stat">📊 إجمالي: ${rows.length}</div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<div class="footer">${footerHtml}</div>
</div>
<script>window.onafterprint=()=>window.close();window.print();<\/script>
</body></html>`);
  w.document.close();
}

/* ───── Short report modes ───── */
function generateExcludeHeadersReport(rows: ScheduleRow[], allHeaders: string[], excludeHeaders: string[], title: string, footerHtml: string) {
  const displayHeaders = allHeaders.filter(h => !excludeHeaders.includes(h));
  openPrintWindow(title, displayHeaders, rows, footerHtml, true);
}

function generateAfterHeaderReport(rows: ScheduleRow[], allHeaders: string[], headerKey: string, title: string, footerHtml: string) {
  const idx = allHeaders.indexOf(headerKey);
  const displayHeaders = idx >= 0 ? allHeaders.slice(idx + 1) : allHeaders;
  openPrintWindow(title, displayHeaders, rows, footerHtml);
}

/* ───── Interactive Statistics Component ───── */
interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}

const StatCard = ({ label, value, icon, color, active, onClick }: StatCardProps) => (
  <button
    className={`schedule-stat-card schedule-stat-interactive ${active ? 'schedule-stat-active' : ''}`}
    style={{ '--stat-color': color } as React.CSSProperties}
    onClick={onClick}
  >
    <span className="schedule-stat-icon">{icon}</span>
    <span className="schedule-stat-value">{value}</span>
    <span className="schedule-stat-label">{label}</span>
  </button>
);

/* ───── Compute lecture duration in hours ───── */
function computeDurationHours(row: ScheduleRow): number {
  const start = parseTimeToMinutes(row['بدء المحاضرة'] || '');
  const end = parseTimeToMinutes(row['نهاية المحاضرة'] || '');
  if (start === null || end === null) return 0;
  return (end - start) / 60;
}

/* ───── Statistics for each system ───── */
const SystemStatistics = ({ rows, allRows, systemId, onFilterApply, activeStatFilter }: {
  rows: ScheduleRow[];
  allRows: ScheduleRow[];
  systemId: string;
  onFilterApply: (key: string, value: string) => void;
  activeStatFilter: string | null;
}) => {
  const stats = useMemo(() => {
    if (systemId === 'teacher' || systemId === 'student' || systemId === 'tracking' || systemId === 'assignments') {
      const departments = new Set(rows.map(r => r['القسم'] || r['القسم الذي تنتمي اليه']));
      const teachers = new Set(rows.map(r => r['اسم التدريسي']).filter(Boolean));
      const rooms = new Set(rows.map(r => r['القاعة أو المختبر']).filter(Boolean));
      const days = new Set(rows.map(r => r['اليوم']).filter(Boolean));
      const subjects = new Set(rows.map(r => r['المادة']).filter(Boolean));
      const practicalCount = rows.filter(r => r['نوع المحاضرة'] === 'عملي').length;
      const theoryCount = rows.filter(r => r['نوع المحاضرة'] === 'نظري').length;
      let practicalHours = 0;
      let theoryHours = 0;
      rows.forEach(r => {
        const dur = computeDurationHours(r);
        if (r['نوع المحاضرة'] === 'عملي') practicalHours += dur;
        else if (r['نوع المحاضرة'] === 'نظري') theoryHours += dur;
      });
      return { departments: departments.size, teachers: teachers.size, rooms: rooms.size, days: days.size, subjects: subjects.size, practicalCount, theoryCount, total: rows.length, practicalHours, theoryHours };
    }
    if (systemId === 'report') {
      const total = rows.length;
      const withDeficiency = rows.filter(r => r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم').length;
      const withConflict = rows.filter(r => r['التضارب'] && r['التضارب'] !== '').length;
      return { total, withDeficiency, withConflict, clean: rows.filter(r => (!r['نقص البيانات'] || r['نقص البيانات'] === 'سليم') && (!r['التضارب'] || r['التضارب'] === '')).length };
    }
    if (systemId === 'hours') {
      const totalRows = rows.length;
      const tadqiqValues: Record<string, number> = {};
      let totalScheduleHours = 0;
      let totalProgramHours = 0;
      rows.forEach(r => {
        const tVal = r['التدقيق حسب الاسبوع'] || '';
        tadqiqValues[tVal] = (tadqiqValues[tVal] || 0) + 1;
        totalScheduleHours += parseFloat(r['الساعات حسب الجدول الدراسي'] || '0') || 0;
        totalProgramHours += parseFloat(r['الساعات حسب البرنامج الدراسي'] || '0') || 0;
      });
      return { totalRows, tadqiqValues, totalScheduleHours, totalProgramHours };
    }
    if (systemId === 'emptyRooms') {
      const allRooms = new Set(rows.map(r => r['القاعة']).filter(Boolean));
      const days = new Set(rows.map(r => r['اليوم']).filter(Boolean));
      return { total: rows.length, rooms: allRooms.size, days: days.size };
    }
    return { total: rows.length };
  }, [rows, systemId]);

  if (systemId === 'teacher' || systemId === 'student' || systemId === 'tracking' || systemId === 'assignments') {
    const s = stats as { departments: number; teachers: number; rooms: number; days: number; subjects: number; practicalCount: number; theoryCount: number; total: number; practicalHours: number; theoryHours: number };
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات التقرير</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي المحاضرات" value={s.total} icon="📄" color="#2563eb" />
          <StatCard label="التدريسيون" value={s.teachers} icon="👨‍🏫" color="#7c3aed" />
          <StatCard label="المواد" value={s.subjects} icon="📚" color="#059669" />
          <StatCard label="القاعات" value={s.rooms} icon="🏛️" color="#d97706" />
          <StatCard
            label="نظري"
            value={s.theoryCount}
            icon="📖"
            color="#2563eb"
            active={activeStatFilter === 'نظري'}
            onClick={() => onFilterApply('نوع المحاضرة', activeStatFilter === 'نظري' ? '' : 'نظري')}
          />
          <StatCard
            label="عملي"
            value={s.practicalCount}
            icon="🔬"
            color="#dc2626"
            active={activeStatFilter === 'عملي'}
            onClick={() => onFilterApply('نوع المحاضرة', activeStatFilter === 'عملي' ? '' : 'عملي')}
          />
          <StatCard label="مجموع الساعات النظرية" value={s.theoryHours} icon="⏱️" color="#0891b2" />
          <StatCard label="مجموع الساعات العملية" value={s.practicalHours} icon="🔧" color="#be185d" />
        </div>
      </div>
    );
  }

  if (systemId === 'report') {
    const s = stats as { total: number; withDeficiency: number; withConflict: number; clean: number };
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات التدقيق</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي السجلات" value={s.total} icon="📄" color="#2563eb" />
          <StatCard
            label="سليم"
            value={s.clean}
            icon="✅"
            color="#22c55e"
            active={activeStatFilter === 'clean'}
            onClick={() => onFilterApply('__stat', activeStatFilter === 'clean' ? '' : 'clean')}
          />
          <StatCard
            label="نقص بيانات"
            value={s.withDeficiency}
            icon="⚠️"
            color="#f59e0b"
            active={activeStatFilter === 'deficiency'}
            onClick={() => onFilterApply('__stat', activeStatFilter === 'deficiency' ? '' : 'deficiency')}
          />
          <StatCard
            label="تضارب"
            value={s.withConflict}
            icon="❌"
            color="#ef4444"
            active={activeStatFilter === 'conflict'}
            onClick={() => onFilterApply('__stat', activeStatFilter === 'conflict' ? '' : 'conflict')}
          />
        </div>
      </div>
    );
  }

  if (systemId === 'hours') {
    const s = stats as { totalRows: number; tadqiqValues: Record<string, number>; totalScheduleHours: number; totalProgramHours: number };
    const statusColors: Record<string, string> = {
      '✅ سليم': '#22c55e',
      '⚠️ الساعات المدخلة أقل من البرنامج': '#f59e0b',
      '⚠️ الساعات المدخلة أكثر من البرنامج': '#f97316',
      '⚪ لا توجد ساعات في البرنامج الدراسي': '#94a3b8',
      '❌ إدراج ساعات عملي لمادة نظري': '#ef4444',
    };
    const statusIcons: Record<string, string> = {
      '✅ سليم': '✅',
      '⚠️ الساعات المدخلة أقل من البرنامج': '⚠️',
      '⚠️ الساعات المدخلة أكثر من البرنامج': '⚠️',
      '⚪ لا توجد ساعات في البرنامج الدراسي': '⚪',
      '❌ إدراج ساعات عملي لمادة نظري': '❌',
    };
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات الساعات الدراسية</div>
        <div className="schedule-stats-grid">
          <StatCard label="إجمالي المواد" value={s.totalRows} icon="📄" color="#2563eb" />
          <StatCard label="ساعات الجدول" value={s.totalScheduleHours} icon="📅" color="#7c3aed" />
          <StatCard label="ساعات البرنامج" value={s.totalProgramHours} icon="📋" color="#059669" />
          <StatCard label="الفرق" value={Math.abs(s.totalScheduleHours - s.totalProgramHours)} icon="📊" color="#d97706" />
        </div>
        <div className="schedule-stats-breakdown">
          {Object.entries(s.tadqiqValues).sort((a, b) => b[1] - a[1]).map(([key, count]) => (
            <button
              key={key}
              className={`schedule-stats-tag-interactive ${activeStatFilter === key ? 'active' : ''}`}
              style={{ '--tag-color': statusColors[key] || '#94a3b8' } as React.CSSProperties}
              onClick={() => onFilterApply('التدقيق حسب الاسبوع', activeStatFilter === key ? '' : key)}
            >
              <span>{statusIcons[key] || '📊'} {key || '(فارغ)'}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (systemId === 'emptyRooms') {
    const s = stats as { total: number; rooms: number; days: number };
    return (
      <div className="schedule-stats">
        <div className="schedule-stats-header">📊 إحصائيات القاعات الشاغرة</div>
        <div className="schedule-stats-grid">
          <StatCard label="فترات شاغرة" value={s.total} icon="🏛️" color="#22c55e" />
          <StatCard label="قاعات" value={s.rooms} icon="🚪" color="#2563eb" />
          <StatCard label="الأيام" value={s.days} icon="📅" color="#d97706" />
        </div>
      </div>
    );
  }

  return null;
};

/* ───── Excel export (with styled HTML table for formatting) ───── */
function exportToExcel(title: string, headers: string[], rows: ScheduleRow[]) {
  // Build styled HTML table for Excel
  const headerCells = headers.map(h => 
    `<th style="background-color:#0F4C81;color:#FFFFFF;font-weight:bold;font-size:12pt;text-align:center;border:1px solid #0B3558;padding:8px;font-family:Cairo,Arial">${h}</th>`
  ).join('');
  
  const dataRows = rows.map((r, i) => {
    const bgColor = i % 2 === 0 ? '#F0F6FF' : '#FFFFFF';
    const cells = headers.map(h => 
      `<td style="background-color:${bgColor};text-align:center;border:1px solid #C5D3E3;padding:6px;font-size:11pt;font-family:Cairo,Arial">${r[h] || ''}</td>`
    ).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
    <x:Name>الجدول</x:Name>
    <x:WorksheetOptions><x:DisplayRightToLeft/><x:FreezePanes/><x:FrozenNoSplit/><x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane></x:WorksheetOptions>
    <x:AutoFilter x:Range="A1:${String.fromCharCode(64 + headers.length)}1"/>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    </head>
    <body><table dir="rtl">${`<tr>${headerCells}</tr>`}${dataRows}</table></body></html>`;

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ───── PDF export (uses print window approach) ───── */
function exportToPDF(title: string, headers: string[], rows: ScheduleRow[]) {
  const tableRows = rows.map((r, i) =>
    `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${headers.map(h => `<td>${r[h] || ''}</td>`).join('')}</tr>`
  ).join('');

  const colCount = headers.length;
  const fontSize = colCount > 12 ? '8px' : colCount > 8 ? '9px' : '10px';

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><title>${title} - PDF</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;color:#000;background:#fff;padding:10px}
.print-header{text-align:center;padding:16px 10px 12px;border-bottom:3px double #0f4c81}
.print-header img{width:70px;height:70px;object-fit:contain;margin-bottom:6px}
.print-header h1{font-size:16px;color:#0f4c81;margin:0 0 3px;font-weight:900}
.print-header h2{font-size:18px;color:#000;margin:0;font-weight:900}
.print-header .subtitle{font-size:11px;color:#555;margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:${fontSize};margin-top:10px}
th{background:#0f4c81;color:#fff;padding:6px 4px;font-weight:800;border:1px solid #0b3558;white-space:nowrap;text-align:center}
td{padding:5px 4px;border:1px solid #c5d3e3;text-align:center;font-weight:600}
tr.even{background:#f0f6ff}
tr.odd{background:#fff}
.footer{margin-top:14px;border-top:3px double #0f4c81;padding:10px;font-size:10px;line-height:2;color:#333}
.footer strong{color:#0f4c81}
.actions{text-align:center;padding:16px;background:#f9fafb}
.actions button{padding:12px 32px;font-size:14px;font-weight:800;border:none;border-radius:10px;cursor:pointer;margin:0 8px;font-family:'Cairo',sans-serif}
.btn-print{background:#0f4c81;color:#fff}
.btn-print:hover{background:#0b3558}
@page{size:landscape;margin:6mm}
@media print{.actions{display:none !important}}
</style></head><body>
<div class="actions">
  <button class="btn-print" onclick="window.print()">📄 طباعة / حفظ كـ PDF</button>
</div>
<div class="print-header">
<img src="${universityLogo}" alt="شعار الجامعة"/>
<h1>كلية الهندسة المدنية - الجامعة التكنولوجية</h1>
<h2>${title}</h2>
<div class="subtitle">عدد السجلات: ${rows.length}</div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<div class="footer">
<div><strong>برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
<div><strong>تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
<div><strong>إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>
</div>
</body></html>`);
  w.document.close();
}

const FOOTER_HTML = `
<div><strong>برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
<div><strong>تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
<div><strong>إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>`;

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d', '#65a30d', '#ea580c', '#6366f1'];

/* ───── Charts Panel ───── */
const ChartsPanel = () => {
  const chartData = useMemo(() => {
    const teacherSys = SYSTEMS.find(s => s.id === 'teacher');
    const studentSys = SYSTEMS.find(s => s.id === 'student');
    const reportSys = SYSTEMS.find(s => s.id === 'report');
    const hoursSys = SYSTEMS.find(s => s.id === 'hours');
    const emptyRoomsSys = SYSTEMS.find(s => s.id === 'emptyRooms');
    const assignmentsSys = SYSTEMS.find(s => s.id === 'assignments');

    // Lectures by day
    const dayCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => {
      const d = r['اليوم'] || '';
      if (d) dayCount[d] = (dayCount[d] || 0) + 1;
    });
    const byDay = Object.entries(dayCount).map(([name, value]) => ({ name, value }));

    // Lectures by type (theory vs practical)
    const typeCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => {
      const t = r['نوع المحاضرة'] || '';
      if (t) typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const byType = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

    // By department
    const deptCount: Record<string, number> = {};
    (teacherSys?.rows || []).forEach(r => {
      const d = r['القسم'] || '';
      if (d) deptCount[d] = (deptCount[d] || 0) + 1;
    });
    const byDept = Object.entries(deptCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 25) + '...' : name, value }));

    // Empty rooms by day
    const emptyByDay: Record<string, number> = {};
    (emptyRoomsSys?.rows || []).forEach(r => {
      const d = r['اليوم'] || '';
      if (d) emptyByDay[d] = (emptyByDay[d] || 0) + 1;
    });
    const emptyDayData = Object.entries(emptyByDay).map(([name, value]) => ({ name, value }));

    // Report audit status
    const auditCount: Record<string, number> = {};
    (reportSys?.rows || []).forEach(r => {
      const hasDeficiency = r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم';
      const hasConflict = r['التضارب'] && r['التضارب'] !== '';
      if (hasConflict) auditCount['تضارب'] = (auditCount['تضارب'] || 0) + 1;
      else if (hasDeficiency) auditCount['نقص بيانات'] = (auditCount['نقص بيانات'] || 0) + 1;
      else auditCount['سليم'] = (auditCount['سليم'] || 0) + 1;
    });
    const auditData = Object.entries(auditCount).map(([name, value]) => ({ name, value }));

    // Hours comparison
    const hoursData = (() => {
      const deptHours: Record<string, { schedule: number; program: number }> = {};
      (hoursSys?.rows || []).forEach(r => {
        const dept = r['القسم'] || 'غير محدد';
        if (!deptHours[dept]) deptHours[dept] = { schedule: 0, program: 0 };
        deptHours[dept].schedule += parseFloat(r['الساعات حسب الجدول الدراسي'] || '0') || 0;
        deptHours[dept].program += parseFloat(r['الساعات حسب البرنامج الدراسي'] || '0') || 0;
      });
      return Object.entries(deptHours).map(([name, v]) => ({
        name: name.length > 20 ? name.slice(0, 20) + '...' : name,
        'ساعات الجدول': v.schedule,
        'ساعات البرنامج': v.program,
      }));
    })();

    // Summary stats
    const summary = {
      teachers: new Set((teacherSys?.rows || []).map(r => r['اسم التدريسي']).filter(Boolean)).size,
      students: studentSys?.rows.length || 0,
      rooms: new Set((teacherSys?.rows || []).map(r => r['القاعة أو المختبر']).filter(Boolean)).size,
      subjects: new Set((teacherSys?.rows || []).map(r => r['المادة']).filter(Boolean)).size,
      emptySlots: emptyRoomsSys?.rows.length || 0,
      assignments: assignmentsSys?.rows.length || 0,
    };

    return { byDay, byType, byDept, emptyDayData, auditData, hoursData, summary };
  }, []);

  const { byDay, byType, byDept, emptyDayData, auditData, hoursData, summary } = chartData;

  const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="schedule-card" style={{ padding: '20px', marginBottom: '16px' }}>
      <h3 className="text-lg font-black text-[var(--schedule-text)] mb-4 text-center">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="p-4">
      {/* Summary Cards */}
      <div className="schedule-stats-grid mb-6">
        <StatCard label="التدريسيون" value={summary.teachers} icon="👨‍🏫" color="#7c3aed" />
        <StatCard label="المحاضرات" value={summary.students} icon="📚" color="#2563eb" />
        <StatCard label="القاعات" value={summary.rooms} icon="🏛️" color="#d97706" />
        <StatCard label="المواد" value={summary.subjects} icon="📖" color="#059669" />
        <StatCard label="فترات شاغرة" value={summary.emptySlots} icon="🚪" color="#22c55e" />
        <StatCard label="التكليفات" value={summary.assignments} icon="📑" color="#be185d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lectures by Day */}
        <ChartCard title="📅 توزيع المحاضرات حسب الأيام">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo' }} />
              <YAxis />
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Bar dataKey="value" name="عدد المحاضرات" radius={[8, 8, 0, 0]}>
                {byDay.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Lectures by Type */}
        <ChartCard title="📊 توزيع المحاضرات حسب النوع">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={byType} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* By Department */}
        <ChartCard title="🏢 المحاضرات حسب القسم (أعلى 8)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byDept} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10, fontFamily: 'Cairo' }} />
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Bar dataKey="value" name="عدد المحاضرات" radius={[0, 8, 8, 0]}>
                {byDept.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Empty Rooms by Day */}
        <ChartCard title="🏛️ القاعات الشاغرة حسب الأيام">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={emptyDayData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Cairo' }} />
              <YAxis />
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Bar dataKey="value" name="فترات شاغرة" fill="#22c55e" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Audit Status */}
        <ChartCard title="📋 حالة تدقيق الجدول">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={auditData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                {auditData.map((entry, i) => {
                  const colorMap: Record<string, string> = { 'سليم': '#22c55e', 'نقص بيانات': '#f59e0b', 'تضارب': '#ef4444' };
                  return <Cell key={i} fill={colorMap[entry.name] || CHART_COLORS[i]} />;
                })}
              </Pie>
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Hours Comparison */}
        <ChartCard title="⏰ مقارنة الساعات الدراسية حسب القسم">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hoursData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'Cairo' }} angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip contentStyle={{ fontFamily: 'Cairo', direction: 'rtl' }} />
              <Legend wrapperStyle={{ fontFamily: 'Cairo' }} />
              <Bar dataKey="ساعات الجدول" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ساعات البرنامج" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

interface Booking {
  id: string;
  room: string;
  day: string;
  date: string;
  fromTime: string;
  toTime: string;
  note?: string;
}

function loadBookings(): Booking[] {
  try {
    return JSON.parse(localStorage.getItem('room_bookings') || '[]');
  } catch { return []; }
}
function saveBookings(bookings: Booking[]) {
  localStorage.setItem('room_bookings', JSON.stringify(bookings));
}

const ScheduleSystem = () => {
  const [activeSystem, setActiveSystem] = useState('teacher');
  const [isDark, setIsDark] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [comboOpen, setComboOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState('');
  const [statFilter, setStatFilter] = useState<string | null>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const [bookings, setBookings] = useState<Booking[]>(loadBookings);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [bookingForm, setBookingForm] = useState({ room: '', day: '', date: '', fromTime: '', toTime: '', note: '' });

  const system = useMemo(() => SYSTEMS.find(s => s.id === activeSystem) || SYSTEMS[0], [activeSystem]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) setComboOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const filteredRows = useMemo(() => {
    let result = system.rows.filter(row => {
      const standardPass = system.filters.every(f => {
        if (f.control === 'time' || f.control === 'timeSelect') return true;
        const val = filters[f.key];
        if (!val) return true;
        return row[f.key] === val;
      });
      if (!standardPass) return false;

      if (system.timeFilter) {
        const fromStr = filters['__timeFrom'];
        const toStr = filters['__timeTo'];
        const mode = system.timeFilter.mode || 'overlap';
        const lectureStart = parseTimeToMinutes(row[system.timeFilter.startKey] || '');
        const lectureEnd = parseTimeToMinutes(row[system.timeFilter.endKey] || '');

        if (mode === 'containment') {
          // For empty rooms: show only if room period is within the selected range
          if (fromStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            if (filterStart !== null && lectureStart !== null) {
              if (lectureStart < filterStart) return false;
            }
          }
          if (toStr) {
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterEnd !== null && lectureEnd !== null) {
              if (lectureEnd > filterEnd) return false;
            }
          }
        } else {
          // Overlap mode for tracking
          if (fromStr && toStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterStart !== null && filterEnd !== null && lectureStart !== null && lectureEnd !== null) {
              if (!(lectureStart < filterEnd && lectureEnd > filterStart)) return false;
            }
          } else if (fromStr) {
            const filterStart = parseTimeToMinutes(fromStr);
            if (filterStart !== null && lectureEnd !== null) {
              if (lectureEnd <= filterStart) return false;
            }
          } else if (toStr) {
            const filterEnd = parseTimeToMinutes(toStr);
            if (filterEnd !== null && lectureStart !== null) {
              if (lectureStart >= filterEnd) return false;
            }
          }
        }
      }
      return true;
    });

    // Apply stat filter
    if (statFilter) {
      if (activeSystem === 'report') {
        if (statFilter === 'clean') result = result.filter(r => (!r['نقص البيانات'] || r['نقص البيانات'] === 'سليم') && (!r['التضارب'] || r['التضارب'] === ''));
        else if (statFilter === 'deficiency') result = result.filter(r => r['نقص البيانات'] && r['نقص البيانات'] !== 'سليم');
        else if (statFilter === 'conflict') result = result.filter(r => r['التضارب'] && r['التضارب'] !== '');
      } else if (activeSystem === 'hours') {
        result = result.filter(r => r['التدقيق حسب الاسبوع'] === statFilter);
      } else if (activeSystem === 'teacher' || activeSystem === 'student' || activeSystem === 'tracking' || activeSystem === 'assignments') {
        if (statFilter === 'نظري' || statFilter === 'عملي') {
          result = result.filter(r => r['نوع المحاضرة'] === statFilter);
        }
      }
    }

    return result;
  }, [system, filters, statFilter, activeSystem]);

  const getFilterOptions = useCallback((filterKey: string): string[] => {
    const filterIndex = system.filters.findIndex(f => f.key === filterKey);
    const upstreamFilters = system.filters.slice(0, filterIndex).filter(f => f.control !== 'time' && f.control !== 'timeSelect');
    let rows = system.rows;
    upstreamFilters.forEach(f => {
      const val = filters[f.key];
      if (val) rows = rows.filter(r => r[f.key] === val);
    });
    const values = [...new Set(rows.map(r => r[filterKey]).filter(Boolean))];
    values.sort();
    return values;
  }, [system, filters]);

  const handleFilterChange = (key: string, value: string) => {
    const filterIndex = system.filters.findIndex(f => f.key === key);
    const newFilters = { ...filters };
    newFilters[key] = value;
    system.filters.slice(filterIndex + 1).forEach(f => {
      if (f.control !== 'time' && f.control !== 'timeSelect') delete newFilters[f.key];
    });
    setFilters(newFilters);
  };

  const handleTimeChange = (key: string, value: string) => {
    const newFilters = { ...filters };
    if (value) newFilters[key] = value;
    else delete newFilters[key];
    setFilters(newFilters);
  };

  const handleStatFilter = (key: string, value: string) => {
    if (!value) { setStatFilter(null); return; }
    if (key === '__stat') {
      setStatFilter(prev => prev === value ? null : value);
    } else {
      setStatFilter(prev => prev === value ? null : value);
    }
  };

  const clearFilters = () => { setFilters({}); setComboQuery(''); setStatFilter(null); };

  const addBooking = () => {
    if (!bookingForm.room || !bookingForm.day || !bookingForm.date || !bookingForm.fromTime || !bookingForm.toTime) return;
    const newBooking: Booking = {
      id: Date.now().toString(),
      room: bookingForm.room,
      day: bookingForm.day,
      date: bookingForm.date,
      fromTime: bookingForm.fromTime,
      toTime: bookingForm.toTime,
      note: bookingForm.note,
    };
    const updated = [...bookings, newBooking];
    setBookings(updated);
    saveBookings(updated);
    setBookingForm({ room: '', day: '', date: '', fromTime: '', toTime: '', note: '' });
    setShowBookingDialog(false);
  };

  const removeBooking = (id: string) => {
    const updated = bookings.filter(b => b.id !== id);
    setBookings(updated);
    saveBookings(updated);
  };

  const getBookingNote = (room: string, day: string, fromTime: string, toTime: string): string | null => {
    const fromMin = parseTimeToMinutes(fromTime);
    const toMin = parseTimeToMinutes(toTime);
    if (fromMin === null || toMin === null) return null;
    const match = bookings.find(b => {
      if (b.room !== room || b.day !== day) return false;
      const bFrom = parseTimeToMinutes(b.fromTime);
      const bTo = parseTimeToMinutes(b.toTime);
      if (bFrom === null || bTo === null) return false;
      return bFrom < toMin && bTo > fromMin;
    });
    if (!match) return null;
    return `⚠️ محجوزة - ${match.date} من ${match.fromTime} إلى ${match.toTime}`;
  };

  const switchSystem = (id: string) => {
    setActiveSystem(id);
    setFilters({});
    setComboQuery('');
    setComboOpen(false);
    setStatFilter(null);
  };

  const handlePrint = () => {
    const isSinglePage = activeSystem === 'teacher';
    openPrintWindow(system.appTitle, system.headers, filteredRows, FOOTER_HTML, isSinglePage);
  };

  const handleShortReport = () => {
    const sr = system.shortReport;
    if (!sr) return;
    if (sr.mode === 'excludeHeaders' && sr.headers) {
      // For teacher short report, include teacher name in title
      let reportTitle = sr.title;
      if (activeSystem === 'teacher') {
        const teacherName = filters['اسم التدريسي'];
        if (teacherName) reportTitle = `جدول التدريسي : ${teacherName}`;
      }
      generateExcludeHeadersReport(filteredRows, system.headers, sr.headers, reportTitle, FOOTER_HTML);
    } else if (sr.mode === 'afterHeader' && sr.header) {
      generateAfterHeaderReport(filteredRows, system.headers, sr.header, sr.title, FOOTER_HTML);
    }
  };

  // Find the combo filter key for the current system
  const comboFilterKey = useMemo(() => {
    const comboFilter = system.filters.find(f => f.control === 'combo');
    return comboFilter?.key || 'اسم التدريسي';
  }, [system]);

  const comboOptions = useMemo(() => {
    const options = getFilterOptions(comboFilterKey);
    if (!comboQuery) return options;
    return options.filter(o => o.includes(comboQuery));
  }, [filters, comboQuery, system, getFilterOptions, comboFilterKey]);

  return (
    <div className={`schedule-body ${isDark ? 'dark' : ''}`} dir="rtl">
      <div className="relative z-[1] w-full mx-auto my-4 px-3 sm:px-5 pb-7">
        <div className="schedule-card">
          {/* Header */}
          <header className="schedule-header">
            <div className="flex flex-col items-center gap-2.5 text-center relative">
              <img
                src={universityLogo}
                alt="شعار الجامعة التكنولوجية"
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain rounded-2xl shadow-lg"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.15))' }}
              />
              <p className="font-extrabold text-[15px] text-[var(--schedule-accent-blue)] tracking-wide opacity-95">
                {system.universityLine}
              </p>
              <h1 className="m-0 text-[clamp(1.7rem,2.8vw,2.5rem)] font-black leading-tight text-[var(--schedule-text)]" style={{ letterSpacing: '-.02em' }}>
                {system.appTitle}
              </h1>
              <div className="mt-1 flex flex-wrap gap-2.5 justify-center items-center">
                <span className="schedule-badge">جاهز</span>
                <button onClick={() => setIsDark(!isDark)} className="schedule-btn" style={{ minHeight: 38, padding: '8px 14px', borderRadius: 999 }}>
                  🌓 تبديل النمط
                </button>
              </div>
              <div className="schedule-hint">
                <strong>💡 ملاحظة:</strong> {system.hint}
              </div>
            </div>
          </header>

          {/* System Switcher */}
          <div className="system-switcher">
            {SYSTEMS.map(sys => (
              <button key={sys.id} className={`system-slide ${activeSystem === sys.id ? 'active' : ''}`} onClick={() => switchSystem(sys.id)}>
                <span className="system-slide-icon">{sys.icon}</span>
                <span>{sys.title}</span>
                <span className="system-slide-badge">{sys.rows.length}</span>
              </button>
            ))}
            <button className={`system-slide ${activeSystem === 'charts' ? 'active' : ''}`} onClick={() => switchSystem('charts')}>
              <span className="system-slide-icon">📈</span>
              <span>الإحصائيات</span>
            </button>
          </div>

          {activeSystem === 'charts' ? (
            <ChartsPanel />
          ) : (
            <>
              {/* Filters */}
              <div className="schedule-filters" style={{
                gridTemplateColumns: system.filters.length > 4
                  ? `repeat(${Math.min(system.filters.length, 4)}, minmax(160px, 1fr))`
                  : `repeat(${system.filters.length}, minmax(180px, 1fr))`
              }}>
                {system.filters.map(f => (
                  <div key={f.key} className="flex flex-col gap-2 min-w-0">
                    <span className="schedule-filter-label">{f.label}</span>
                    {f.control === 'combo' ? (
                      <div ref={comboRef} className={`relative ${comboOpen ? 'z-30' : ''}`}>
                        <div
                          className={`relative flex items-center min-h-[52px] rounded-2xl border border-[var(--schedule-border)] px-4 cursor-pointer transition-all ${comboOpen ? 'border-blue-400/45 shadow-[0_0_0_4px_rgba(37,99,235,.14)]' : ''}`}
                          style={{
                            background: isDark
                              ? 'linear-gradient(180deg, rgba(13,22,38,.92), rgba(10,18,33,.84))'
                              : 'linear-gradient(180deg, rgba(255,255,255,.88), rgba(248,250,255,.76))',
                          }}
                          onClick={() => setComboOpen(!comboOpen)}
                        >
                          <input
                            type="text"
                            className="flex-1 min-w-0 border-none outline-none bg-transparent font-extrabold text-sm text-[var(--schedule-text)]"
                            style={{ minHeight: 'auto', boxShadow: 'none', padding: 0 }}
                            placeholder="ابحث عن التدريسي..."
                            value={filters[f.key] || comboQuery}
                            onChange={e => {
                              setComboQuery(e.target.value);
                              setComboOpen(true);
                              if (filters[f.key]) {
                                const newF = { ...filters };
                                delete newF[f.key];
                                setFilters(newF);
                              }
                            }}
                            onClick={e => { e.stopPropagation(); setComboOpen(true); }}
                          />
                          <div className="flex items-center gap-1.5 absolute left-2 top-1/2 -translate-y-1/2">
                            {(filters[f.key] || comboQuery) && (
                              <button
                                className="w-8 h-8 rounded-xl grid place-items-center text-sm font-black schedule-btn"
                                style={{ minHeight: 32, padding: 0 }}
                                onClick={e => { e.stopPropagation(); setComboQuery(''); const newF = { ...filters }; delete newF[f.key]; setFilters(newF); }}
                              >✕</button>
                            )}
                            <span className={`text-xs transition-transform ${comboOpen ? 'rotate-180' : ''}`}>▼</span>
                          </div>
                        </div>
                        {comboOpen && (
                          <div className="absolute inset-x-0 top-[calc(100%+10px)] z-25 rounded-[22px] border border-[var(--schedule-border)] overflow-hidden"
                            style={{
                              background: isDark
                                ? 'linear-gradient(180deg, rgba(11,19,33,.98), rgba(9,16,29,.96))'
                                : 'linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.94))',
                              boxShadow: '0 26px 60px rgba(15,23,42,.18)',
                              backdropFilter: 'blur(14px)',
                            }}>
                            <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b border-[var(--schedule-border)] text-xs font-black text-[var(--schedule-muted)]"
                              style={{ background: 'linear-gradient(180deg, rgba(37,99,235,.08), rgba(37,99,235,.03))' }}>
                              <strong className="text-[var(--schedule-text)] text-[13px]">اختر التدريسي</strong>
                              <span>{comboOptions.length} نتيجة</span>
                            </div>
                            <div className="max-h-[300px] overflow-auto p-2.5 flex flex-col gap-2">
                              {comboOptions.length === 0 ? (
                                <div className="text-center py-4 text-[var(--schedule-muted)] text-sm font-extrabold border border-dashed border-[var(--schedule-border)] rounded-2xl">لا توجد نتائج</div>
                              ) : comboOptions.map(opt => (
                                <button key={opt}
                                  className={`w-full text-right rounded-2xl px-3.5 py-3 text-sm font-extrabold border transition-colors ${filters[f.key] === opt ? 'border-blue-400/20 text-[var(--schedule-accent-blue)]' : 'border-transparent'}`}
                                  style={{
                                    background: filters[f.key] === opt
                                      ? 'linear-gradient(180deg, rgba(37,99,235,.12), rgba(37,99,235,.08))'
                                      : isDark ? 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02))' : 'linear-gradient(180deg, rgba(255,255,255,.92), rgba(246,249,255,.82))',
                                    minHeight: 46,
                                  }}
                                  onClick={() => { handleFilterChange(f.key, opt); setComboQuery(''); setComboOpen(false); }}
                                >{opt}</button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : f.control === 'timeSelect' ? (
                      <select
                        className="schedule-select"
                        value={filters[f.key] || ''}
                        onChange={e => handleTimeChange(f.key, e.target.value)}
                        style={{ cursor: 'pointer', paddingInlineEnd: 44, minHeight: 52 }}
                      >
                        <option value="">— الكل —</option>
                        {TIME_OPTIONS_ARABIC.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : f.control === 'time' ? (
                      <input
                        type="time"
                        className="schedule-select"
                        value={filters[f.key] || ''}
                        onChange={e => handleTimeChange(f.key, e.target.value)}
                        style={{ cursor: 'pointer', paddingInlineEnd: 16, minHeight: 52 }}
                      />
                    ) : (
                      <select className="schedule-select" value={filters[f.key] || ''} onChange={e => handleFilterChange(f.key, e.target.value)} style={{ cursor: 'pointer', paddingInlineEnd: 44 }}>
                        <option value="">— الكل —</option>
                        {getFilterOptions(f.key).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div className="schedule-toolbar">
                <button className="schedule-btn schedule-btn-primary" onClick={handlePrint}>🖨️ طباعة الجدول</button>
                {system.shortReport && (
                  <button className="schedule-btn schedule-btn-secondary" onClick={handleShortReport}>📋 تقرير مختصر</button>
                )}
                <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(124,58,237,.28)' }} onClick={() => exportToExcel(system.appTitle, system.headers, filteredRows)}>📥 تصدير Excel</button>
                <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(220,38,38,.28)' }} onClick={() => exportToPDF(system.appTitle, system.headers, filteredRows)}>📄 تصدير PDF</button>
                {activeSystem === 'emptyRooms' && (
                  <button className="schedule-btn schedule-btn-primary" style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.20), 0 16px 28px rgba(5,150,105,.28)' }} onClick={() => setShowBookingDialog(true)}>📅 حجز مؤقت</button>
                )}
                <button className="schedule-btn" onClick={clearFilters}>🔄 مسح التصفية</button>
                <div className="schedule-counter">📊 عدد النتائج: <strong className="text-[var(--schedule-text)]">{filteredRows.length}</strong></div>
              </div>

              {/* Active Bookings List */}
              {activeSystem === 'emptyRooms' && bookings.length > 0 && (
                <div className="schedule-stats" style={{ marginBottom: 12 }}>
                  <div className="schedule-stats-header">📅 الحجوزات المؤقتة ({bookings.length})</div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {bookings.map(b => (
                      <div key={b.id} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: 'linear-gradient(135deg, rgba(5,150,105,.1), rgba(5,150,105,.05))', border: '1px solid rgba(5,150,105,.2)' }}>
                        <span>🏛️ {b.room} | {b.day} | {b.date} | {b.fromTime} - {b.toTime}</span>
                        <button onClick={() => removeBooking(b.id)} className="text-red-500 hover:text-red-700 font-black">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )

              {/* Statistics for all tabs */}
              <SystemStatistics
                rows={filteredRows}
                allRows={system.rows}
                systemId={activeSystem}
                onFilterApply={handleStatFilter}
                activeStatFilter={statFilter}
              />

              {/* Table */}
              <div className="schedule-table-wrap">
                {filteredRows.length === 0 ? (
                  <div className="schedule-empty">
                    <span className="text-[34px] mb-2.5 opacity-70">📄</span>
                    لا توجد بيانات مطابقة.
                  </div>
                ) : (
                  <table className="schedule-table">
                    <thead>
                      <tr>{system.headers.map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, i) => {
                        const hasWarning = activeSystem === 'report' && (
                          (row['نقص البيانات'] && row['نقص البيانات'] !== 'سليم') ||
                          (row['التضارب'] && row['التضارب'] !== '')
                        );
                        return (
                          <tr key={i} className={hasWarning ? 'schedule-row-warning' : ''}>
                            {system.headers.map(h => {
                              let cellClass = '';
                              const val = row[h] || '';
                              if (h === 'نقص البيانات' && val && val !== 'سليم') cellClass = 'schedule-cell-warn';
                              if (h === 'التضارب' && val) cellClass = 'schedule-cell-danger';
                              if (h === 'التدقيق حسب الاسبوع') {
                                if (val.includes('✅')) cellClass = 'schedule-cell-ok';
                                else if (val.includes('⚠️')) cellClass = 'schedule-cell-warn';
                                else if (val.includes('❌')) cellClass = 'schedule-cell-danger';
                              }
                              return <td key={h} className={cellClass}>{val}</td>;
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="schedule-footer">
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
            <div className="schedule-footer-card"><strong className="text-[var(--schedule-text)]">إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleSystem;
