import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { SYSTEMS, TIME_OPTIONS_ARABIC, type SystemConfig, type ScheduleRow } from '@/data/scheduleData';
import universityLogo from '@/assets/university-logo.jpg';

/* ───── Time parsing helper ───── */
export function parseTimeToMinutes(timeStr: string): number | null {
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
export function openPrintWindow(title: string, headers: string[], rows: ScheduleRow[], footerHtml: string, singlePage?: boolean) {
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

/* ───── Official Assignments Print (تكليفات التدريسي) ───── */
export function openAssignmentsPrintWindow(opts: {
  teacherName: string;
  semester: string;
  department: string;
  college: string;
  headers: string[];
  rows: ScheduleRow[];
}) {
  const { teacherName, semester, department, college, headers: rawHeaders, rows } = opts;
  const w = window.open('', '_blank');
  if (!w) return;

  // Exclude teacher-name column (already shown in title + info band) and any redundant department/college columns
  const EXCLUDED = ['اسم التدريسي', 'التدريسي', 'اسم المدرس', 'الفصل الدراسي'];
  const headers = rawHeaders.filter(h => !EXCLUDED.includes((h || '').trim()));

  const title = `تكليفات ${teacherName || '—'} للفصل الدراسي ${semester || '—'}`;
  // Narrow columns whose values are short single words — render smaller and prevent line breaks
  const NARROW_COLS = ['اليوم', 'الدراسة', 'المرحلة', 'الشعبة', 'المجموعة', 'نوع المحاضرة', 'الساعات النهائية', 'مدة المحاضرة'];
  const isNarrow = (h: string) => NARROW_COLS.includes((h || '').trim());
  const tableRows = rows.map((r, i) =>
    `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${headers.map(h => `<td class="${isNarrow(h) ? 'narrow' : ''}">${r[h] || ''}</td>`).join('')}</tr>`
  ).join('');
  const colCount = headers.length;
  const rowCount = rows.length;
  // Dynamic font sizing — shrink when many columns OR many rows to fit width on a single A4 page
  // (height grows automatically with portrait orientation)
  const baseFont = colCount > 14 ? 7.5 : colCount > 12 ? 8.5 : colCount > 10 ? 9.5 : colCount > 8 ? 10.5 : 11.5;
  const rowFactor = rowCount > 40 ? 0.85 : rowCount > 25 ? 0.92 : 1;
  const fontSize = `${(baseFont * rowFactor).toFixed(1)}px`;
  const cellPadV = rowCount > 30 ? 2 : rowCount > 18 ? 3 : 5;
  const cellPadH = colCount > 12 ? 2 : 4;
  const today = new Date().toLocaleDateString('ar-IQ');

  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;color:#000;background:#fff;padding:0}
.page{padding:8mm 8mm;position:relative}
.page::before{content:"";position:absolute;inset:5mm;border:2px double #0f4c81;border-radius:6px;pointer-events:none;z-index:0}
.content{position:relative;z-index:1}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-family:'Amiri',serif;font-size:120px;color:rgba(15,76,129,0.05);font-weight:700;white-space:nowrap;pointer-events:none;z-index:0}
.official-header{display:grid;grid-template-columns:80px 1fr 80px;align-items:center;gap:8px;padding:6px 10px;border-bottom:3px double #0f4c81}
.official-header img{width:70px;height:70px;object-fit:contain;justify-self:center}
.header-text{text-align:center}
.header-text .ar1{font-family:'Amiri',serif;font-size:15px;font-weight:700;color:#0f4c81;margin-bottom:2px}
.header-text .ar2{font-size:12px;font-weight:800;color:#000;margin-bottom:2px}
.header-text .ar3{font-size:10px;font-weight:700;color:#333}
.header-side{font-size:9px;text-align:center;color:#555;line-height:1.5}
.header-side strong{color:#0f4c81;display:block;margin-bottom:2px;font-size:10px}
.doc-title{margin:8px auto 4px;text-align:center}
.doc-title h1{font-family:'Amiri',serif;font-size:18px;color:#0f4c81;font-weight:700;letter-spacing:1px;display:inline-block;padding:5px 22px;border-top:2px solid #0f4c81;border-bottom:2px solid #0f4c81}
.info-band{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0;padding:6px;background:#f7faff;border:1px solid #c5d3e3;border-radius:6px}
.info-cell{font-size:9.5px;font-weight:700;color:#333;padding:3px 6px;border-right:3px solid #0f4c81;background:#fff;border-radius:3px}
.info-cell strong{color:#0f4c81;display:block;font-size:8.5px;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:${fontSize};margin-top:4px;table-layout:auto}
th{background:linear-gradient(180deg,#0f4c81,#0b3558);color:#fff;padding:${cellPadV + 2}px ${cellPadH}px;font-weight:800;border:1px solid #0b3558;text-align:center;font-size:${fontSize};line-height:1.2}
td{padding:${cellPadV}px ${cellPadH}px;border:1px solid #c5d3e3;text-align:center;font-weight:600;vertical-align:middle;line-height:1.25;word-break:break-word}
td.narrow{white-space:nowrap;font-size:calc(${fontSize} - 1.5px);padding-left:1px;padding-right:1px;letter-spacing:-0.2px}
tr.even{background:#f0f6ff}
tr.odd{background:#fff}
.pledge{margin-top:10px;padding:8px 12px;border:2px solid #0f4c81;border-radius:6px;background:#f7faff;font-size:11px;font-weight:700;line-height:1.7;text-align:justify;color:#000}
.pledge strong{color:#0f4c81}
.signatures{margin-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;page-break-inside:avoid}
.sig-box{text-align:center;border-top:2px solid #0f4c81;padding-top:6px}
.sig-label{font-size:10px;font-weight:800;color:#0f4c81;margin-bottom:18px}
.sig-name{font-size:11px;font-weight:700;color:#000;min-height:16px;border-bottom:1px dotted #888;padding-bottom:2px;margin-bottom:4px}
.sig-sub{font-size:9px;color:#555}
.stamp-box{position:relative;min-height:70px}
.stamp-circle{display:inline-block;width:65px;height:65px;border:2px dashed #0f4c81;border-radius:50%;font-size:8px;color:#0f4c81;font-weight:800;line-height:65px;margin:2px auto;opacity:.7}
.doc-meta{margin-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#555;padding:4px 10px;border-top:1px solid #c5d3e3}
@page{size:A4 portrait;margin:5mm}
@media print{
  body{padding:0}
  tr,td,th{page-break-inside:avoid}
  .signatures{page-break-inside:avoid}
  .pledge{page-break-inside:avoid}
}
</style></head><body>
<div class="watermark">رسمي</div>
<div class="page"><div class="content">
<div class="official-header">
  <div class="header-side"><strong>جمهورية العراق</strong>وزارة التعليم العالي<br/>والبحث العلمي</div>
  <div class="header-text">
    <img src="${universityLogo}" alt="شعار"/>
    <div class="ar1">الجامعة التكنولوجية</div>
    <div class="ar2">كلية الهندسة المدنية</div>
    <div class="ar3">${department || ''}</div>
  </div>
  <div class="header-side"><strong>Republic of Iraq</strong>Ministry of Higher<br/>Education<br/>University of Technology</div>
</div>

<div class="doc-title"><h1>${title}</h1></div>

<div class="info-band">
  <div class="info-cell"><strong>اسم التدريسي</strong>${teacherName || '—'}</div>
  <div class="info-cell"><strong>الفصل الدراسي</strong>${semester || '—'}</div>
  <div class="info-cell"><strong>القسم</strong>${department || '—'}</div>
  <div class="info-cell"><strong>الكلية</strong>${college || 'كلية الهندسة المدنية'}</div>
</div>

<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>

<div class="pledge">
<strong>إقرار وتعهد :</strong> اؤيد صحة كافة المعلومات المذكورة بالاستمارة وهي تشمل كافة التكليفات لفصل الدراسي اعلاه واتعهد بعدم المطالبة باي تكليفات اخرى غير مذكورة في هذه الاستمارة مستقبلا.
</div>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">اسم التدريسي</div>
    <div class="sig-name">${teacherName || ''}</div>
    <div class="sig-sub">التوقيع : ............................</div>
  </div>
  <div class="sig-box stamp-box">
    <div class="sig-label">ختم القسم</div>
    <div class="stamp-circle">ختم القسم</div>
    <div class="sig-sub">${department || ''}</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">رئيس القسم</div>
    <div class="sig-name"></div>
    <div class="sig-sub">التوقيع : ............................</div>
  </div>
</div>

<div class="doc-meta">
  <span>تاريخ الإصدار : ${today}</span>
  <span>عدد التكليفات : ${rows.length}</span>
</div>

</div></div>
<script>window.onafterprint=()=>window.close();window.print();<\/script>
</body></html>`);
  w.document.close();
}

/* ───── Short report with info header ───── */
export function openShortReportWindow(title: string, headers: string[], rows: ScheduleRow[], footerHtml: string, infoHtml: string, singlePage?: boolean) {
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
.info-section{display:flex;flex-wrap:wrap;gap:8px 24px;justify-content:center;padding:10px 20px;margin:8px 0;background:#f0f6ff;border:1px solid #c5d3e3;border-radius:8px}
.info-line{font-size:12px;font-weight:700;color:#0f4c81}
.info-line strong{color:#333;margin-left:4px}
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
${infoHtml ? `<div class="info-section">${infoHtml}</div>` : ''}
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

export function generateExcludeHeadersReport(rows: ScheduleRow[], allHeaders: string[], excludeHeaders: string[], title: string, footerHtml: string) {
  const displayHeaders = allHeaders.filter(h => !excludeHeaders.includes(h));
  openPrintWindow(title, displayHeaders, rows, footerHtml, true);
}

export function generateAfterHeaderReport(rows: ScheduleRow[], allHeaders: string[], headerKey: string, title: string, footerHtml: string) {
  const idx = allHeaders.indexOf(headerKey);
  const displayHeaders = idx >= 0 ? allHeaders.slice(idx + 1) : allHeaders;
  openPrintWindow(title, displayHeaders, rows, footerHtml);
}

/* ───── Excel export ───── */
export function exportToExcel(title: string, headers: string[], rows: ScheduleRow[]) {
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

/* ───── PDF export ───── */
export function exportToPDF(title: string, headers: string[], rows: ScheduleRow[]) {
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
body{font-family:'Cairo',sans-serif;color:#000;background:#fff;padding:10mm}
@page{size:landscape;margin:6mm}
h1{text-align:center;font-size:18px;color:#0f4c81;margin-bottom:4px;font-weight:900}
h2{text-align:center;font-size:14px;color:#333;margin-bottom:8px;font-weight:700}
.info{text-align:center;font-size:11px;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:${fontSize}}
th{background:#0f4c81;color:#fff;padding:6px 4px;font-weight:800;border:1px solid #0b3558;white-space:nowrap;text-align:center}
td{padding:5px 4px;border:1px solid #c5d3e3;text-align:center;font-weight:600}
tr.even{background:#f0f6ff}
tr.odd{background:#fff}
.footer{margin-top:15px;border-top:2px solid #0f4c81;padding-top:10px;font-size:10px;line-height:2;color:#333}
.footer strong{color:#0f4c81}
@media print{body{padding:0}tr,td,th{page-break-inside:avoid}}
</style></head><body>
<h1>${title}</h1>
<h2>كلية الهندسة المدنية - الجامعة التكنولوجية</h2>
<div class="info">عدد السجلات: ${rows.length} | تاريخ التقرير: ${new Date().toLocaleDateString('ar-IQ')}</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<div class="footer">
<div><strong>برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
<div><strong>تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
<div><strong>إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>
</div>
<script>window.onafterprint=()=>window.close();window.print();<\/script>
</body></html>`);
  w.document.close();
}

/* ───── Stat Card ───── */
interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  color: string;
  active?: boolean;
  onClick?: () => void;
}

export const StatCard = ({ label, value, icon, color, active, onClick }: StatCardProps) => (
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

/* ───── Compute lecture duration ───── */
export function computeDurationHours(row: ScheduleRow): number {
  const start = parseTimeToMinutes(row['بدء المحاضرة'] || '');
  const end = parseTimeToMinutes(row['نهاية المحاضرة'] || '');
  if (start === null || end === null) return 0;
  return (end - start) / 60;
}

export const FOOTER_HTML = `
<div><strong>برمجة :</strong> المدرس الدكتور احمد عبدالامير جبار عيسى - كلية الهندسة المدنية</div>
<div><strong>تصميم :</strong> الاستاذ الدكتور وائل شوقي عبد الصاحب - معاون العميد للشؤون الادارية</div>
<div><strong>إشراف :</strong> الأستاذ الدكتور علي مجيد خضير الدهوي - عميد كلية الهندسة المدنية</div>`;

export { universityLogo, TIME_OPTIONS_ARABIC };
export type { ScheduleRow, SystemConfig };
