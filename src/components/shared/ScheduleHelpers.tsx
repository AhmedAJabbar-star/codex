import type { CSSProperties } from 'react';
import type { SystemConfig, ScheduleRow } from '@/data/scheduleData';
import { TIME_OPTIONS_ARABIC } from '@/data/timeOptions';
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

/* ───── Official Print helper (Unified University Schedule) ───── */
export function openPrintWindow(title: string, headers: string[], rows: ScheduleRow[], _footerHtml: string, singlePage?: boolean, department?: string, filtersInfo?: { label: string; value: string }[], customSignatures?: { label: string; name?: string }[], printPrefs?: import('@/data/customSystemsRegistry').PrintPrefs, autoPrint?: boolean, totals?: Record<string, string>) {
  const w = window.open('', '_blank');
  if (!w) return;

  const isNotes = (h: string) => (h || '').trim() === 'الملاحظات';
  const esc = (v: unknown) => (v == null ? '' : String(v)).replace(/</g, '&lt;');
  // Build once as an array join — far cheaper than string concatenation for large sets.
  const rowChunks: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    let cells = '';
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      cells += `<td${isNotes(h) ? ' class="notes-col"' : ''}>${esc(r[h])}</td>`;
    }
    rowChunks[i] = `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
  }
  const tableRows = rowChunks.join('');

  /* 📊 صف المجاميع (ذيل المجاميع) — يُطبع في نهاية الجدول داخل tbody منفصل
     حتى لا يُحسب ضمن صفوف البيانات عند الطباعة على دفعات. */
  const hasTotals = !!totals && Object.values(totals).some((v) => String(v || '').trim() !== '');
  const totalsRowHtml = hasTotals
    ? `<tbody class="totals-body"><tr class="totals-row">${headers
        .map((h) => `<td>${esc((totals as Record<string, string>)[h] || '')}</td>`)
        .join('')}</tr></tbody>`
    : '';

  const colCount = headers.length;
  const rowCount = rows.length;

  /* Column widths: sampling the content lets us use table-layout:fixed, which is
     dramatically faster to lay out than `auto` on thousands of rows — and it also
     stops columns from being squeezed/clipped unpredictably.

     ✦ مشكلة هدر المساحة: القياس الخام بطول النص يعطي عمود «الاسم» مساحة ضخمة
       ويترك أعمدة فارغة (مثل «التوقيع») بعرض مجهري. الحل: ثلاثة أوضاع للعرض
       (ذكي / بالمحتوى / متساوٍ) + عرض يدوي لكل عمود من منشئ الأنظمة، مع
       تخميد (damping) بالجذر التربيعي وحد أدنى للأعمدة الفارغة. */
  const sample = Math.min(rows.length, 400);
  const rawWeights = headers.map((h) => {
    let max = (h || '').length;
    let filled = 0;
    for (let i = 0; i < sample; i++) {
      const len = String(rows[i][h] ?? '').length;
      if (len > 0) filled++;
      if (len > max) max = len;
    }
    // عمود شبه فارغ (توقيع / ملاحظات يدوية) => يستحق مساحة كتابة لا عرضاً مجهرياً
    const empty = sample > 0 && filled / sample < 0.05;
    return { max: Math.min(Math.max(max, 3), 60), empty };
  });
  // وزن المحتوى الخام (الوضع القديم)
  const contentWeights = rawWeights.map((w) => Math.min(Math.max(w.max, 4), 42));
  // الوزن الذكي: جذر تربيعي يقلّص هيمنة الأعمدة الطويلة + أرضية 14 للأعمدة الفارغة
  const smartWeights = rawWeights.map((w) => {
    const damped = 4 + Math.sqrt(w.max) * 3.2;
    return Number((w.empty ? Math.max(damped, 14) : damped).toFixed(2));
  });
  const prefWidths = printPrefs?.col_widths || {};
  const manualWeights = headers.map((h, i) => Number(prefWidths[h] ?? prefWidths[String(i)] ?? 0));
  const hasManual = manualWeights.some((v) => v > 0);
  const widthMode = printPrefs?.col_width_mode || (hasManual ? 'manual' : 'smart');
  const pickWeights = (mode: string): number[] => {
    if (mode === 'equal') return headers.map(() => 1);
    if (mode === 'content') return contentWeights;
    if (mode === 'manual' && hasManual) {
      const auto = smartWeights;
      const fixedSum = manualWeights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
      const rest = Math.max(100 - fixedSum, headers.length * 2);
      const autoSum = headers.reduce((a, _h, i) => a + (manualWeights[i] > 0 ? 0 : auto[i]), 0) || 1;
      return headers.map((_h, i) => (manualWeights[i] > 0 ? manualWeights[i] : (auto[i] / autoSum) * rest));
    }
    return smartWeights;
  };
  const weights = pickWeights(widthMode);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const colgroupHtml = `<colgroup>${weights.map((w) => `<col style="width:${((w / weightSum) * 100).toFixed(3)}%"/>`).join('')}</colgroup>`;


  /* Very large reports are streamed into the table in chunks after the window paints,
     so the preview opens instantly instead of freezing the browser. */
  const DEFER_ROWS = rowCount > 600;

  const baseFont = colCount > 16 ? 7 : colCount > 14 ? 7.8 : colCount > 12 ? 8.6 : colCount > 10 ? 9.4 : colCount > 8 ? 10.2 : 11;
  const rowFactor = rowCount > 40 ? 0.9 : rowCount > 25 ? 0.95 : 1;
  const fontSize = singlePage ? '7.5px' : `${(baseFont * rowFactor).toFixed(1)}px`;
  const cellPadV = singlePage ? 2 : rowCount > 30 ? 3 : 5;
  const cellPadH = colCount > 14 ? 1.5 : colCount > 12 ? 2 : 4;

  const today = new Date().toLocaleDateString('ar-IQ');
  const docNumber = `${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const sigItems = (customSignatures && customSignatures.length > 0)
    ? customSignatures
    : [{ label: 'مقرر القسم' }, { label: 'رئيس القسم' }, { label: 'مصادقة العميد' }];
  const sigCols = sigItems.length || 3;
  const signaturesHtml = (Array.isArray(customSignatures) && customSignatures.length === 0) ? '' : `
    <div class="signatures" style="grid-template-columns:repeat(${sigCols},1fr)">
      ${sigItems.map((s) => `
      <div class="sig-box">
        <div class="sig-sub">التوقيع &amp; الختم</div>
        <div class="sig-space"></div>
        <div class="sig-name">${s.name || '............................'}</div>
        <div class="sig-label">${s.label}</div>
      </div>`).join('')}
    </div>`;

  // Full first-page banner — official header + info-band + filters (renders once at top)
  const bannerHtml = `
<div class="banner" id="full-banner">
  <div class="official-header">
    <div class="header-side">
      <strong>جمهورية العراق</strong>
      <span>وزارة التعليم العالي</span>
      <span>والبحث العلمي</span>
    </div>
    <div class="header-text">
      <img src="${universityLogo}" alt="شعار الجامعة" class="hdr-logo"/>
      <div class="ar1">الجامعة التكنولوجية</div>
      <div class="ar2">كلية الهندسة المدنية</div>
      ${department ? `<div class="ar3">${department}</div>` : ''}
    </div>
    <div class="header-side">
      <strong>Republic of Iraq</strong>
      <span>Ministry of Higher Education</span>
      <span>&amp; Scientific Research</span>
      <span>University of Technology</span>
    </div>
  </div>
  <h1 class="doc-h1">${title}</h1>
  <div class="info-band">
    <div class="info-cell cell-date"><strong>تاريخ الإصدار</strong><span>${today}</span></div>
    <div class="info-cell cell-docnum"><strong>رقم الوثيقة</strong><span>${docNumber}</span></div>
    <div class="info-cell cell-count"><strong>عدد السجلات</strong><span>${rows.length}</span></div>
  </div>
  ${(filtersInfo && filtersInfo.length > 0) ? `
  <div class="filters-band">
    <div class="filters-band-title">معايير التصفية المطبّقة</div>
    <div class="filters-band-grid">
      ${filtersInfo.map(f => `<div class="filter-chip"><span class="chip-label">${f.label}</span><span class="chip-value">${f.value}</span></div>`).join('')}
    </div>
  </div>` : ''}
</div>`;

  // No separate "running header" — we repeat the SAME full banner via <thead>.

  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style id="page-style">@page{size:A4 landscape;margin:8mm}</style>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Cairo',sans-serif;color:#0b1f33;background:#eef2f7}
body.in-preview{padding:0}

/* ===== PREVIEW TOOLBAR ===== */
.preview-bar{position:sticky;top:0;z-index:1000;display:flex;gap:6px;justify-content:flex-start;align-items:center;flex-wrap:wrap;padding:10px 14px;background:linear-gradient(135deg,#0f4c81 0%,#0b3558 100%);color:#fff;font-family:'Cairo',sans-serif;box-shadow:0 8px 24px rgba(15,76,129,.35)}
.preview-bar .pv-title{font-weight:800;font-size:14px;letter-spacing:.2px}
.preview-bar input[type="text"]{padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.97);color:#0f4c81;font-weight:700;font-family:'Cairo',sans-serif;font-size:12.5px;min-width:240px}
.preview-bar select{padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.97);color:#0f4c81;font-weight:700;font-family:'Cairo',sans-serif;font-size:12px;cursor:pointer}
.preview-bar label{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.1);padding:6px 9px;border-radius:6px;border:1px solid rgba(255,255,255,.2);transition:background .15s}
.preview-bar label:hover{background:rgba(255,255,255,.18)}
.preview-bar label input{width:14px;height:14px;cursor:pointer;accent-color:#fff}
.preview-bar button{font-family:'Cairo',sans-serif;border:0;border-radius:8px;font-weight:800;padding:8px 16px;cursor:pointer;font-size:12.5px;transition:transform .1s, box-shadow .15s}
.preview-bar button:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.2)}
.preview-bar .btn-print{background:#fff;color:#0f4c81;margin-inline-start:auto}
.preview-bar .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)}
.preview-bar .sep{width:1px;height:26px;background:rgba(255,255,255,.25);margin:0 4px}

/* When system has locked print prefs, collapse the bar so ONLY print + close + the gear toggle remain visible. */
body.toolbar-hidden .preview-bar > *{display:none!important}
body.toolbar-hidden .preview-bar > .btn-print,
body.toolbar-hidden .preview-bar > .btn-close,
body.toolbar-hidden .preview-bar > .pv-toggle{display:inline-flex!important}
body.toolbar-hidden .preview-bar{justify-content:flex-end;gap:8px}
@media print{.preview-bar,.pv-toggle,#cols-panel{display:none!important}}

/* ===== لوحة ضبط عرض الأعمدة ===== */
#cols-panel{position:sticky;top:56px;z-index:999;max-width:297mm;margin:10px auto 0;background:#fff;border:1.5px solid #c5d3e3;border-radius:12px;box-shadow:0 14px 34px rgba(15,76,129,.16);font-family:'Cairo',sans-serif;overflow:hidden}
#cols-panel[hidden]{display:none}
#cols-panel .cp-head{display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0f4c81,#0b3558);color:#fff;padding:8px 12px;font-size:13px}
#cols-panel .cp-head span{margin-inline-start:auto;font-size:11.5px;font-weight:700;opacity:.9}
#cols-panel .cp-head button{font-family:'Cairo',sans-serif;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.14);color:#fff;border-radius:7px;font-weight:800;font-size:11.5px;padding:5px 10px;cursor:pointer}
#cols-panel .cp-hint{font-size:11.5px;color:#52657c;font-weight:600;padding:8px 12px 0;line-height:1.8}
#cols-panel .cp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;padding:10px 12px 14px}
#cols-panel .cp-row{display:flex;align-items:center;gap:6px;background:#f5f8fc;border:1px solid #dbe5f0;border-radius:8px;padding:6px 9px;font-size:11.5px;font-weight:700;color:#0b1f33}
#cols-panel .cp-row > span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f4c81}
#cols-panel .cp-row input{width:62px;padding:5px 6px;border:1px solid #c5d3e3;border-radius:6px;font-family:'Cairo',sans-serif;font-weight:800;text-align:center;color:#0b1f33}
#cols-panel .cp-row em{font-style:normal;color:#7b8ca0}
.pdf-tip{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(8,25,45,.55);backdrop-filter:blur(3px);font-family:'Cairo',sans-serif;direction:rtl}
.pdf-tip-box{background:#fff;max-width:520px;width:calc(100% - 32px);border-radius:14px;padding:22px 24px;box-shadow:0 24px 60px rgba(8,25,45,.35);border-top:6px solid #0f4c81;color:#12324f}
.pdf-tip-box h3{margin:0 0 10px;font-size:18px;color:#0f4c81}
.pdf-tip-box p{margin:0 0 10px;font-size:13.5px;line-height:1.9}
.pdf-tip-box ol{margin:0 0 10px;padding-inline-start:20px;font-size:13.5px;line-height:2}
.pdf-tip-note{font-size:12.5px!important;color:#5b7189}
.pdf-tip-actions{display:flex;gap:8px;justify-content:flex-start;margin-top:14px}
.pdf-tip-actions button{font-family:'Cairo',sans-serif;border:0;border-radius:9px;font-weight:800;padding:9px 16px;cursor:pointer;font-size:13px;background:#0f4c81;color:#fff}
.pdf-tip-actions #pdf-tip-close{background:#eef3f8;color:#0f4c81;border:1px solid #cbd9e6}
@media print{.pdf-tip{display:none!important}}


/* ===== PRINT AREA ===== */
.print-area{max-width:297mm;margin:14px auto;background:#fff;padding:8mm 6mm;box-shadow:0 12px 32px rgba(0,0,0,.12);border-radius:6px;position:relative;overflow:hidden}
.print-area > *{position:relative;z-index:1}
.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-family:'Amiri',serif;font-size:140px;color:rgba(15,76,129,0.09);font-weight:700;white-space:nowrap;pointer-events:none;z-index:0;letter-spacing:4px}
body.hide-watermark .watermark{display:none!important}
@media print{ .watermark{position:fixed;top:50%;left:50%;color:rgba(15,76,129,0.08)} }

/* ===== FULL FIRST-PAGE BANNER ===== */
.banner{background:#fff;margin-bottom:6px}
.official-header{display:grid;grid-template-columns:1fr 1.4fr 1fr;align-items:center;gap:14px;padding:8px 12px 10px;border-bottom:3px double #0f4c81}
.header-side{font-size:9.5px;text-align:center;color:#445;line-height:1.55;display:flex;flex-direction:column;gap:1px}
.header-side strong{color:#0f4c81;font-size:10.5px;font-weight:800;margin-bottom:2px}
.header-text{text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px}
.hdr-logo{width:64px;height:64px;object-fit:contain;margin-bottom:3px}
.header-text .ar1{font-family:'Amiri',serif;font-size:15px;font-weight:700;color:#0f4c81}
.header-text .ar2{font-size:13px;font-weight:800;color:#0b1f33}
.header-text .ar3{font-size:10.5px;font-weight:700;color:#445;margin-top:1px}

.doc-h1{font-family:'Amiri',serif;font-size:17px;font-weight:700;color:#0b3558;text-align:center;margin:8px 0 6px;padding:6px 16px;background:linear-gradient(180deg,#f7faff,#eaf1fb);border-radius:6px;border:1px solid #c5d3e3;line-height:1.4;word-break:break-word}

.info-band{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0;padding:0}
.info-cell{display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;color:#222;padding:6px 10px;background:linear-gradient(180deg,#fff,#f3f7fd);border:1px solid #c5d3e3;border-top:3px solid #0f4c81;border-radius:5px}
.info-cell strong{color:#0f4c81;display:block;font-size:9.5px;margin-bottom:3px;font-weight:800;letter-spacing:.3px}
.info-cell span{font-size:11px;color:#0b1f33;font-weight:700}

/* Filters band — flow layout (no overflowing absolute badge) */
.filters-band{margin:8px 0 4px;padding:0;background:linear-gradient(180deg,#fff,#eef4fc);border:1.5px solid #0f4c81;border-radius:8px;overflow:hidden}
.filters-band-title{background:linear-gradient(135deg,#0f4c81,#0b3558);color:#fff;font-size:10px;font-weight:800;padding:5px 12px;letter-spacing:.3px;text-align:right;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.filters-band-grid{display:flex;flex-wrap:wrap;gap:6px 10px;padding:8px 12px}
.filter-chip{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #c5d3e3;border-radius:14px;padding:3px 10px;font-size:10px;font-weight:700;color:#222}
.chip-label{color:#0f4c81;font-weight:800}
.chip-label::after{content:" :"}
.chip-value{color:#0b1f33}

/* Banner spacing hygiene — no awkward gaps when any sub-element is hidden */
.banner > *:first-child{margin-top:0}
.banner > *:last-child{margin-bottom:0}
.info-band:empty,.filters-band:empty{display:none}

/* ===== REPEATING BANNER CONTROL =====
   The banner is now part of the SAME data table header, not a wrapper table.
   This is the reliable Chrome/PDF path: banner + column titles repeat together and data starts on page 1. */
.first-banner{margin-bottom:6px}
body.repeat-header .first-banner{display:none}
body:not(.repeat-header) table.data > thead .repeat-banner-row{display:none}
body.repeat-header table.data > thead .repeat-banner-row{display:table-row}
table.data .banner-cell{background:#fff!important;color:#0b1f33!important;padding:0 0 5px!important;border:0!important;text-align:initial!important;font-weight:400!important;line-height:normal!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* Compact look ONLY for the repeated banner — applied to repeat-banner-preview and to thead. */
body.compact-repeat table.data > thead .banner,
body.compact-repeat #repeat-banner-preview .banner{padding-top:2px}
body.compact-repeat table.data > thead .official-header,
body.compact-repeat #repeat-banner-preview .official-header{padding:4px 12px 6px}
body.compact-repeat table.data > thead .hdr-logo,
body.compact-repeat #repeat-banner-preview .hdr-logo{width:48px;height:48px}
body.compact-repeat table.data > thead .doc-h1,
body.compact-repeat #repeat-banner-preview .doc-h1{font-size:14px;padding:3px 14px;margin:5px 0 4px}

/* Per-element banner toggles — apply to BOTH real banner and preview clone */
body.hide-banner-logo    .banner .hdr-logo{display:none}
body.hide-banner-title   .banner .doc-h1{display:none}
body.hide-banner-info    .banner .info-band{display:none}
body.hide-banner-filters .banner .filters-band{display:none}
body.hide-date    .banner .cell-date{display:none}
body.hide-docnum  .banner .cell-docnum{display:none}
body.hide-count   .banner .cell-count{display:none}

/* ===== DATA TABLE ===== */
table.data{width:100%;border-collapse:collapse;font-size:${fontSize};table-layout:fixed;margin-top:4px}
table.data thead{display:table-header-group}
table.data th{background:linear-gradient(180deg,#0f4c81,#0b3558);color:#fff;padding:${cellPadV + 2}px ${cellPadH}px;font-weight:800;border:1px solid #0b3558;text-align:center;line-height:1.2;-webkit-print-color-adjust:exact;print-color-adjust:exact;word-break:break-word;white-space:normal}
table.data td{padding:${cellPadV}px ${cellPadH}px;border:1px solid #c5d3e3;text-align:center;font-weight:600;vertical-align:middle;line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
table.data .notes-col{min-width:38mm;white-space:pre-wrap;text-align:right}
table.data tr.even{background:#f4f8fd;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table.data tr.odd{background:#fff}
table.data > tbody.totals-body{display:table-row-group}
table.data > tbody.totals-body > tr > td{background:#e2e8f0;font-weight:900;border-top:2px solid #0f4c81;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* No :hover rule on data rows — it forces a full repaint pass on very large tables. */

/* ===== BUILD PROGRESS OVERLAY (large reports) ===== */
#prep{position:fixed;inset:0;z-index:2000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(238,242,247,.96);font-family:'Cairo',sans-serif}
#prep .pbox{background:#fff;border:1.5px solid #c5d3e3;border-radius:14px;padding:26px 34px;box-shadow:0 18px 44px rgba(15,76,129,.18);text-align:center;min-width:320px}
#prep .ptitle{font-weight:800;color:#0f4c81;font-size:16px;margin-bottom:12px}
#prep .ptrack{height:10px;border-radius:99px;background:#e3ebf5;overflow:hidden}
#prep .pfill{height:100%;width:0;background:linear-gradient(90deg,#0f4c81,#2d7dc4);transition:width .12s linear}
#prep .pnum{margin-top:10px;font-size:12.5px;font-weight:700;color:#44566b}
body.ready #prep{display:none}
@media print{#prep{display:none!important}}

table.data > tfoot{display:table-footer-group}
table.data .footer-cell{padding:0!important;border:0!important;background:#fff!important}
table.data > tfoot .signatures-wrap{margin-top:4px}
table.data > tfoot .signatures{padding:2px 4px 0;gap:14px}
table.data > tfoot .sig-box{padding-top:4px}
table.data > tfoot .sig-sub{font-size:8px;margin-bottom:2px}
table.data > tfoot .sig-space{height:12px}
table.data > tfoot .sig-name{font-size:8.5px;min-height:9px;margin-bottom:2px}
table.data > tfoot .sig-label{font-size:8.5px}

/* ===== SIGNATURES — الترتيب: التوقيع والختم ← الاسم ← المنصب ===== */
.signatures-wrap{margin-top:8px;page-break-inside:avoid;break-inside:avoid}
.signatures{display:grid;gap:18px;padding:4px 4px 2px}
.sig-box{text-align:center;border-top:2px solid #0f4c81;padding-top:5px}
.sig-sub{font-size:9px;font-weight:800;color:#0f4c81;margin-bottom:3px}
.sig-space{height:16px}
.sig-name{font-size:9.5px;color:#333;border-bottom:1px dotted #888;min-height:12px;padding-bottom:1px;margin-bottom:3px;font-weight:700}
.sig-label{font-size:9px;color:#555;font-weight:700}
.doc-meta{margin-top:5px;display:flex;justify-content:center;font-size:8.5px;color:#666;padding:3px 10px;border-top:1px solid #c5d3e3}
.doc-meta strong{color:#0f4c81}

/* tfoot is built DYNAMICALLY by JS only when "repeat-sigs" is enabled — never present in the DOM otherwise (was causing every page to reserve footer space and push the table to the next page). */
body.repeat-sigs #sigs-end{display:none}

/* ===== ON-SCREEN SIMULATION OF PAGE 2 (visualizes repetition without printing) ===== */
#repeat-banner-preview{max-width:297mm;margin:8px auto 30px;background:transparent}
#repeat-banner-preview .page2-label{background:linear-gradient(135deg,#0f4c81,#0b3558);color:#fff;font-weight:800;padding:8px 14px;border-radius:8px 8px 0 0;font-size:12.5px;text-align:center;letter-spacing:.3px;box-shadow:0 4px 12px rgba(15,76,129,.25)}
#repeat-banner-preview .page2-paper{background:#fff;padding:8mm 6mm;box-shadow:0 12px 32px rgba(0,0,0,.12);border-radius:0 0 8px 8px;border-top:3px dashed #0f4c81;position:relative;min-height:120px}
#repeat-banner-preview .page2-paper::after{content:"⋯ بقية بيانات التقرير ⋯";display:block;text-align:center;color:#94a3b8;font-weight:700;padding:18px 0 6px;font-size:12px;font-style:italic}
body:not(.repeat-header) #repeat-banner-preview .banner{display:none}
body:not(.repeat-header) #repeat-banner-preview .page2-paper::before{content:"🚫 تكرار البانر معطّل — الصفحات التالية تبدأ مباشرةً ببيانات الجدول";display:block;text-align:center;color:#dc2626;font-weight:800;padding:16px;font-size:13px;background:#fef2f2;border:1.5px dashed #fca5a5;border-radius:6px;margin-bottom:8px}

@media print{
  body{background:#fff!important}
  .preview-bar{display:none!important}
  #repeat-banner-preview{display:none!important}
  .print-area{margin:0;padding:0;box-shadow:none;border-radius:0;max-width:none}
  table.data{page-break-inside:auto;break-inside:auto}
  table.data > thead{display:table-header-group!important}
  table.data > tbody{display:table-row-group!important}
  table.data > tbody.totals-body > tr > td{background:#e2e8f0!important;font-weight:900;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  table.data > tfoot{display:table-footer-group!important}
  table.data > tbody > tr{page-break-inside:avoid;break-inside:avoid}
  table.data > thead .repeat-banner-row,
  table.data > thead .columns-row{break-inside:avoid;page-break-inside:avoid}
  .signatures-wrap{page-break-inside:avoid}
}
</style>
</head><body class="in-preview repeat-header compact-repeat">

<div class="preview-bar">
  <span class="pv-title">📄 المعاينة</span>
  <input type="text" id="pv-title-input" value="${title.replace(/"/g, '&quot;')}" placeholder="عنوان التقرير"/>
  <div class="sep"></div>
  <select id="pv-orient" title="اتجاه الصفحة">
    <option value="landscape">أفقي</option>
    <option value="portrait">عمودي</option>
  </select>
  <select id="pv-size" title="حجم الورق">
    <option value="A4">A4</option>
    <option value="A3">A3</option>
    <option value="Letter">Letter</option>
  </select>
  <select id="pv-margin" title="الهوامش">
    <option value="5">هوامش ضيقة (5مم)</option>
    <option value="8" selected>هوامش عادية (8مم)</option>
    <option value="12">هوامش واسعة (12مم)</option>
  </select>
  <div class="sep"></div>
  <label title="تكرار البانر الكامل في أعلى كل صفحة عند الطباعة"><input type="checkbox" id="pv-repeat-header" checked/> تكرار البانر بكل صفحة</label>
  <label title="تصغير البانر قليلاً عند التكرار لتوفير المساحة"><input type="checkbox" id="pv-compact-repeat" checked/> بانر مضغوط عند التكرار</label>
  <label><input type="checkbox" id="pv-repeat-sigs"/> تكرار التواقيع</label>
  <div class="sep"></div>
  <span class="pv-title" style="font-size:12px;opacity:.85">📌 محتويات البانر:</span>
  <label><input type="checkbox" id="pv-show-logo" checked/> الشعار</label>
  <label><input type="checkbox" id="pv-show-title" checked/> العنوان</label>
  <label><input type="checkbox" id="pv-show-info" checked/> شريط المعلومات</label>
  <label><input type="checkbox" id="pv-show-date" checked/> التاريخ</label>
  <label><input type="checkbox" id="pv-show-docnum" checked/> رقم الوثيقة</label>
  <label><input type="checkbox" id="pv-show-count" checked/> عدد السجلات</label>
  <label><input type="checkbox" id="pv-show-filters" checked/> معايير التصفية</label>
  <div class="sep"></div>
  <label><input type="checkbox" id="pv-show-sigs" checked/> التواقيع</label>
  <label><input type="checkbox" id="pv-show-watermark" checked/> العلامة المائية</label>
  <label><input type="checkbox" id="pv-fit"/> ملاءمة الأعمدة</label>
  <div class="sep"></div>
  <span class="pv-title" style="font-size:12px;opacity:.85">📐 عرض الأعمدة:</span>
  <select id="pv-colmode" title="طريقة توزيع عرض الأعمدة على عرض الصفحة">
    <option value="smart">ضبط تلقائي ذكي (موصى به)</option>
    <option value="content">حسب طول المحتوى</option>
    <option value="equal">أعمدة متساوية</option>
    <option value="manual">نسب يدوية</option>
  </select>
  <button class="btn-close" id="pv-cols-btn" title="تحديد نسبة عرض كل عمود يدوياً">🎛️ ضبط الأعمدة</button>

  <div class="sep"></div>
  <span class="pv-title" style="font-size:12px;opacity:.85">🧾 تقسيم اختياري (للطابعات الضعيفة فقط):</span>
  <select id="pv-batch" title="يبقى الوضع الافتراضي: طباعة كل السجلات في ملف واحد">
    <option value="0">كل السجلات (ملف واحد كامل)</option>
    <option value="200">200 سجل / دفعة</option>
    <option value="300">300 سجل / دفعة</option>
    <option value="500">500 سجل / دفعة</option>
    <option value="1000">1000 سجل / دفعة</option>
  </select>
  <select id="pv-batch-page" title="اختر الدفعة المعروضة"></select>
  <button class="btn-close" id="pv-batch-all" title="طباعة الدفعات واحدة تلو الأخرى بالتتابع">🖨️ طباعة كل الدفعات</button>
  <span id="pv-batch-info" style="font-size:11.5px;font-weight:700;opacity:.9"></span>
  <button class="pv-toggle btn-close" id="pv-toggle" title="إظهار/إخفاء شريط إعدادات الطباعة">⚙️ الإعدادات</button>

  <button class="btn-print" id="pv-print-full" title="طباعة/حفظ PDF لكامل السجلات في ملف واحد">🖨️ طباعة الكل / حفظ PDF</button>
  <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
</div>

<!-- لوحة ضبط عرض الأعمدة يدوياً (نِسَب مئوية من عرض الجدول) -->
<div id="cols-panel" hidden>
  <div class="cp-head">
    <strong>🎛️ ضبط عرض الأعمدة</strong>
    <span id="cp-sum"></span>
    <button id="cp-auto" type="button">↺ تلقائي ذكي</button>
    <button id="cp-close" type="button">✕</button>
  </div>
  <div class="cp-hint">اضبط نسبة عرض كل عمود (٪). اتركها 0 ليُوزَّع الباقي تلقائياً على الأعمدة غير المحددة — بذلك لا تُهدر أي مساحة.</div>
  <div class="cp-grid">
    ${headers.map((h, i) => `<label class="cp-row"><span>${h}</span><input type="number" min="0" max="90" step="1" data-idx="${i}" value="${(manualWeights[i] || 0)}"/><em>٪</em></label>`).join('')}
  </div>
</div>



<div id="prep">
  <div class="pbox">
    <div class="ptitle">⏳ جاري تجهيز التقرير الرسمي…</div>
    <div class="ptrack"><div class="pfill" id="prep-fill"></div></div>
    <div class="pnum" id="prep-num">0 من ${rowCount}</div>
  </div>
</div>

<div class="print-area">
  <div class="watermark">${(printPrefs?.watermarkText) || 'الجامعة التكنولوجية'}</div>
  <div class="first-banner">${bannerHtml}</div>
  <table class="data">
    ${colgroupHtml}
    <thead>
      <tr class="repeat-banner-row"><th class="banner-cell" colspan="${colCount}">${bannerHtml}</th></tr>
      <tr class="columns-row">${headers.map(h => `<th>${h}</th>`).join('')}</tr>
    </thead>
    <tbody>${DEFER_ROWS ? '' : tableRows}</tbody>
    ${totalsRowHtml}
  </table>
  <div id="sigs-end" class="signatures-wrap">
    ${signaturesHtml}
    <div class="doc-meta"><span><strong>وثيقة رسمية</strong> &nbsp;صادرة عن كلية الهندسة المدنية / الجامعة التكنولوجية</span></div>
  </div>
</div>
${DEFER_ROWS ? `<script type="text/html" id="rows-src">${tableRows.replace(/<\/script/gi, '<\\/script')}</script>` : ''}


<!-- محاكاة شكل الصفحة الثانية أثناء الطباعة — للمعاينة فقط -->
<div id="repeat-banner-preview">
  <div class="page2-label">🔁 معاينة الصفحة الثانية وما بعدها — بانر التكرار</div>
  <div class="page2-paper">
    ${bannerHtml}
  </div>
</div>

<script>
(function(){
  var STORAGE_KEY='lovable-print-prefs-v4';
  var SYSTEM_PREFS = ${JSON.stringify(printPrefs || null)};
  var body=document.body;
  function $(id){ return document.getElementById(id); }
  function loadPrefs(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); }catch(e){ return {}; } }
  function savePrefs(p){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }catch(e){} }
  var prefs=loadPrefs();
  // Map snake_case system prefs onto the toolbar's camelCase keys, then merge — system overrides.
  if(SYSTEM_PREFS){
    var SP = SYSTEM_PREFS;
    var mapped = {
      orient: SP.orient, size: SP.size, margin: SP.margin,
      repeatHeader: SP.repeatHeader, compactRepeat: SP.compactRepeat, repeatSigs: SP.repeatSigs,
      showLogo: SP.showLogo, showTitle: SP.showTitle, showInfo: SP.showInfo,
      showFilters: SP.showFilters, showDate: SP.showDate, showDocnum: SP.showDocnum,
      showCount: SP.showCount, showSigs: SP.showSigs, fit: SP.fit,
      showWatermark: SP.showWatermark
    };
    Object.keys(mapped).forEach(function(k){ if(mapped[k] !== undefined) prefs[k] = mapped[k]; });
    // Hide the preview toolbar unless the system explicitly asks to keep it visible.
    if(!SP.show_toolbar) body.classList.add('toolbar-hidden');
    // Fixed title override
    if(SP.title){ var _ti=$('pv-title-input'); if(_ti){ _ti.value=SP.title; } }
  }
  // Lock mode: disable ALL preview controls and remove the floating toggle so users
  // cannot re-show or change anything the admin hid/configured.
  var LOCKED = !!(SYSTEM_PREFS && SYSTEM_PREFS.lock_settings);
  var TITLE_EDITABLE = !!(SYSTEM_PREFS && SYSTEM_PREFS.title_editable);
  var TITLE_LOCKED = !!(SYSTEM_PREFS && SYSTEM_PREFS.title) && !TITLE_EDITABLE;
  var tog = $('pv-toggle');
  if(LOCKED){
    if(tog && tog.parentNode) tog.parentNode.removeChild(tog);
    // When the title stays editable, keep the toolbar visible so the user can reach it.
    if(TITLE_EDITABLE) body.classList.remove('toolbar-hidden');
    // Disable every input/select inside the preview bar (keep print & close),
    // but skip the title input when the admin allowed the user to edit it.
    document.querySelectorAll('.preview-bar input, .preview-bar select').forEach(function(el){
      if(TITLE_EDITABLE && el.id === 'pv-title-input') return;
      el.disabled = true;
      el.title = 'مقفل من قبل المسؤول';
      if(el.parentElement) el.parentElement.style.opacity = '0.55';
    });
  } else if(tog){
    tog.addEventListener('click', function(){ body.classList.toggle('toolbar-hidden'); });
  }
  if(TITLE_LOCKED){
    var _ti2=$('pv-title-input'); if(_ti2){ _ti2.readOnly=true; _ti2.title='العنوان مضبوط من قبل المسؤول'; _ti2.style.opacity='0.7'; }
  }


  // Title sync (applies to BOTH banner instances via class selector)
  var ti=$('pv-title-input');
  function syncTitle(){
    var v=ti.value||'';
    document.querySelectorAll('.banner .doc-h1').forEach(function(el){ el.textContent=v; });
    document.title=v;
  }
  if(ti) ti.addEventListener('input', function(){ syncTitle(); prefs.title=ti.value; savePrefs(prefs); });

  // Page settings
  function applyPage(){
    var orient=$('pv-orient').value, size=$('pv-size').value, margin=$('pv-margin').value;
    $('page-style').textContent='@page{size:'+size+' '+orient+';margin:'+margin+'mm}';
    prefs.orient=orient; prefs.size=size; prefs.margin=margin; savePrefs(prefs);
  }
  ['pv-orient','pv-size','pv-margin'].forEach(function(id){ var el=$(id); if(el) el.addEventListener('change', applyPage); });

  // All visibility toggles use body classes → automatically affect BOTH the real thead banner
  // AND the on-screen page-2 preview clone, AND the printed repeated header on every page.
  function bindHide(id, cls, prefKey){
    var cb=$(id); if(!cb) return function(){};
    function apply(){
      if(cb.checked) body.classList.remove(cls); else body.classList.add(cls);
      prefs[prefKey]=cb.checked; savePrefs(prefs);
    }
    cb.addEventListener('change', apply); return apply;
  }
  var togLogo    = bindHide('pv-show-logo',    'hide-banner-logo',    'showLogo');
  var togTitle   = bindHide('pv-show-title',   'hide-banner-title',   'showTitle');
  var togInfo    = bindHide('pv-show-info',    'hide-banner-info',    'showInfo');
  var togFilters = bindHide('pv-show-filters', 'hide-banner-filters', 'showFilters');
  var togDate    = bindHide('pv-show-date',    'hide-date',           'showDate');
  var togDocnum  = bindHide('pv-show-docnum',  'hide-docnum',         'showDocnum');
  var togCount   = bindHide('pv-show-count',   'hide-count',          'showCount');
  var togWM      = bindHide('pv-show-watermark','hide-watermark',     'showWatermark');

  function bindOn(id, cls, prefKey){
    var cb=$(id); if(!cb) return function(){};
    function apply(){
      if(cb.checked) body.classList.add(cls); else body.classList.remove(cls);
      prefs[prefKey]=cb.checked; savePrefs(prefs);
    }
    cb.addEventListener('change', apply); return apply;
  }
  var togRepH    = bindOn('pv-repeat-header', 'repeat-header',  'repeatHeader');
  var togCompact = bindOn('pv-compact-repeat','compact-repeat', 'compactRepeat');

  // Build/destroy <tfoot> dynamically so it NEVER reserves footer space unless explicitly requested.
  var SIG_HTML = ${JSON.stringify(signaturesHtml)};
  function applyRepeatSigs(){
    var on = $('pv-repeat-sigs').checked;
    var dataTable = document.querySelector('table.data');
    var existing = dataTable.querySelector(':scope > tfoot');
    if(on){
      if(!existing){
        var tfoot = document.createElement('tfoot');
        tfoot.innerHTML = '<tr><td class="footer-cell" colspan="${colCount}"><div id="sigs-foot" class="signatures-wrap">'+SIG_HTML+'</div></td></tr>';
        dataTable.appendChild(tfoot);
      }
      body.classList.add('repeat-sigs');
    } else {
      if(existing) existing.remove();
      body.classList.remove('repeat-sigs');
    }
    // Respect the "show signatures" toggle on the foot copy too
    applySigs();
    prefs.repeatSigs = on; savePrefs(prefs);
  }
  $('pv-repeat-sigs').addEventListener('change', applyRepeatSigs);

  // Signatures show/hide — applies to whichever copies currently exist
  function applySigs(){
    var on=$('pv-show-sigs').checked;
    document.querySelectorAll('#sigs-end .signatures, #sigs-foot .signatures').forEach(function(el){ el.style.display = on ? '' : 'none'; });
    prefs.showSigs=on; savePrefs(prefs);
  }
  $('pv-show-sigs').addEventListener('change', applySigs);

  var fit=$('pv-fit');
  function applyFit(){
    document.querySelectorAll('table.data').forEach(function(t){ t.style.tableLayout = fit.checked ? 'fixed' : 'auto'; });
    prefs.fit=fit.checked; savePrefs(prefs);
  }
  if(fit) fit.addEventListener('change', applyFit);

  /* ===== عرض الأعمدة: ضبط تلقائي ذكي / بالمحتوى / متساوٍ / يدوي =====
     الهدف منع هدر المساحة: التوزيع الذكي يخمّد أطوال النصوص بالجذر التربيعي
     فلا يبتلع عمود «الاسم» الصفحة، ويمنح الأعمدة الفارغة (مثل «التوقيع») حداً
     أدنى معقولاً للكتابة اليدوية. النِسَب اليدوية تُحجز أولاً ثم يوزَّع الباقي
     تلقائياً على بقية الأعمدة حتى يبلغ مجموع العرض 100٪ دائماً. */
  var W_SMART   = ${JSON.stringify(smartWeights)};
  var W_CONTENT = ${JSON.stringify(contentWeights)};
  var N_COLS    = ${colCount};
  var manualPct = (prefs.colWidths && prefs.colWidths.length===N_COLS) ? prefs.colWidths.slice() : ${JSON.stringify(manualWeights)};
  var colModeSel = $('pv-colmode');
  function computeWidths(mode){
    var base = mode==='equal' ? W_SMART.map(function(){ return 1; }) : (mode==='content' ? W_CONTENT : W_SMART);
    var out;
    if(mode==='manual'){
      var fixedSum=0, autoSum=0;
      for(var i=0;i<N_COLS;i++){ var v=Number(manualPct[i])||0; if(v>0){ fixedSum+=v; } else { autoSum+=W_SMART[i]; } }
      var rest = Math.max(100-fixedSum, N_COLS*2);
      out = [];
      for(var j=0;j<N_COLS;j++){
        var m=Number(manualPct[j])||0;
        out.push(m>0 ? m : (autoSum ? (W_SMART[j]/autoSum)*rest : rest/N_COLS));
      }
    } else { out = base.slice(); }
    var sum = out.reduce(function(a,b){ return a+b; },0) || 1;
    return out.map(function(v){ return (v/sum)*100; });
  }
  function applyCols(){
    var mode = colModeSel ? colModeSel.value : 'smart';
    var pct = computeWidths(mode);
    document.querySelectorAll('table.data > colgroup').forEach(function(cg){
      var cols = cg.children;
      for(var i=0;i<cols.length && i<pct.length;i++) cols[i].style.width = pct[i].toFixed(3)+'%';
    });
    var sumEl=$('cp-sum');
    if(sumEl){
      var fixed = manualPct.reduce(function(a,b){ return a+(Number(b)||0); },0);
      sumEl.textContent = 'مجموع النِّسَب اليدوية: '+fixed.toFixed(0)+'٪ — الباقي ('+Math.max(0,100-fixed).toFixed(0)+'٪) يُوزَّع تلقائياً';
    }
    prefs.colMode = mode; prefs.colWidths = manualPct; savePrefs(prefs);
  }
  if(colModeSel) colModeSel.addEventListener('change', applyCols);
  var cpPanel=$('cols-panel'), cpBtn=$('pv-cols-btn');
  if(LOCKED && cpBtn){ cpBtn.style.display='none'; if(cpPanel) cpPanel.hidden=true; }
  if(cpBtn && cpPanel){
    cpBtn.addEventListener('click', function(){ cpPanel.hidden = !cpPanel.hidden; if(!cpPanel.hidden) applyCols(); });
    var cpClose=$('cp-close'); if(cpClose) cpClose.addEventListener('click', function(){ cpPanel.hidden = true; });
    var cpAuto=$('cp-auto');
    if(cpAuto) cpAuto.addEventListener('click', function(){
      manualPct = manualPct.map(function(){ return 0; });
      cpPanel.querySelectorAll('input[data-idx]').forEach(function(inp){ inp.value = '0'; });
      if(colModeSel) colModeSel.value='smart';
      applyCols();
    });
    cpPanel.querySelectorAll('input[data-idx]').forEach(function(inp){
      inp.addEventListener('input', function(){
        manualPct[Number(inp.getAttribute('data-idx'))] = Math.max(0, Math.min(90, Number(inp.value)||0));
        if(colModeSel) colModeSel.value='manual';
        applyCols();
      });
    });
  }
  if(colModeSel){
    var startMode = ${JSON.stringify(widthMode)};
    if(prefs.colMode && !LOCKED && !(SYSTEM_PREFS && SYSTEM_PREFS.col_width_mode)) startMode = prefs.colMode;
    colModeSel.value = startMode;
  }
  applyCols();



  /* ===== بناء الجدول تدريجياً للتقارير الضخمة (بدون تجميد المتصفح) ===== */
  var TOTAL_ROWS = ${rowCount};
  var DEFER = ${DEFER_ROWS ? 'true' : 'false'};
  var tbodyEl = document.querySelector('table.data > tbody');
  var dataRows = [];
  var bSel=$('pv-batch'), pSel=$('pv-batch-page'), bInfo=$('pv-batch-info'), bAll=$('pv-batch-all');
  var printBtn=$('pv-print-full');

  function batchSize(){ return parseInt((bSel && bSel.value) || '0', 10) || 0; }
  function batchCount(){ var s=batchSize(); return s>0 ? Math.max(1, Math.ceil(TOTAL_ROWS/s)) : 1; }
  function showBatch(idx){
    var s=batchSize();
    if(s<=0){
      for(var i=0;i<dataRows.length;i++) dataRows[i].style.display='';
      if(bInfo) bInfo.textContent = 'ملف واحد كامل — ' + TOTAL_ROWS + ' سجل';
    } else {
      var from=idx*s, to=Math.min(TOTAL_ROWS, from+s);
      for(var j=0;j<dataRows.length;j++) dataRows[j].style.display=(j>=from && j<to) ? '' : 'none';
      if(bInfo) bInfo.textContent = 'الدفعة ' + (idx+1) + ' من ' + batchCount() + ' (السجلات ' + (from+1) + '–' + to + ')';
    }
    document.querySelectorAll('.banner .cell-count span').forEach(function(el){
      el.textContent = s>0 ? (Math.min(TOTAL_ROWS,(idx*s)+s) - idx*s) + ' من ' + TOTAL_ROWS : String(TOTAL_ROWS);
    });
  }
  function rebuildBatches(){
    if(!pSel) return;
    var n=batchCount(), s=batchSize();
    pSel.innerHTML='';
    for(var i=0;i<n;i++){
      var o=document.createElement('option'); o.value=String(i);
      o.textContent = s>0 ? ('الدفعة ' + (i+1) + ' (' + (i*s+1) + '–' + Math.min(TOTAL_ROWS,(i+1)*s) + ')') : 'كل السجلات';
      pSel.appendChild(o);
    }
    pSel.disabled = s<=0;
    if(bAll) bAll.style.display = s>0 ? '' : 'none';
    showBatch(0);
    prefs.batch = s; savePrefs(prefs);
  }
  if(bSel) bSel.addEventListener('change', rebuildBatches);
  if(pSel) pSel.addEventListener('change', function(){ showBatch(parseInt(pSel.value,10)||0); });

  /* طباعة الدفعات بالتتابع — ننتظر انتهاء كل طباعة قبل الانتقال للتالية */
  if(bAll) bAll.addEventListener('click', function(){
    var n=batchCount(), i=0;
    function step(){
      if(i>=n){ window.onafterprint=null; return; }
      pSel.value=String(i); showBatch(i); i++;
      window.onafterprint=function(){ setTimeout(step, 350); };
      window.print();
    }
    step();
  });

  /* زر «طباعة الكل / حفظ PDF» — يُلغي أي تقسيم ويطبع كامل البيانات في ملف واحد */
  if(printBtn) printBtn.addEventListener('click', function(){
    if(!document.body.classList.contains('ready')) return;
    if(bSel && batchSize()>0){ bSel.value='0'; rebuildBatches(); }
    setTimeout(function(){ window.print(); }, 60);
  });

  function initBatches(){
    dataRows = Array.prototype.slice.call(document.querySelectorAll('table.data > tbody:not(.totals-body) > tr'));
    if(bSel){
      // ترحيل لمرة واحدة: إلغاء التقسيم التلقائي القديم — الافتراضي الآن ملف واحد كامل.
      if(!prefs.batchV2){ prefs.batch = 0; prefs.batchV2 = true; savePrefs(prefs); }
      bSel.value = String(prefs.batch === undefined ? 0 : prefs.batch);
      rebuildBatches();
    }

    document.body.classList.add('ready');

    /* الوضع المباشر: بلا معاينة — نفتح مربع حوار الحفظ/الطباعة فوراً */
    if(${autoPrint ? 'true' : 'false'}){
      var pb=document.querySelector('.preview-bar'); if(pb) pb.style.display='none';
      if(bSel && batchSize()>0){ bSel.value='0'; rebuildBatches(); }
      var tip=document.createElement('div');
      tip.className='pdf-tip';
      tip.innerHTML='<div class="pdf-tip-box">'+
        '<h3>حفظ الملف بصيغة PDF</h3>'+
        '<p>المتصفح لا يسمح لأي موقع بحفظ ملف PDF على جهازك دون إظهار نافذة الطباعة. لذلك تظهر النافذة الآن مباشرة بعد تجهيز التقرير كاملاً.</p>'+
        '<ol>'+
        '<li>في خانة <b>الوجهة / Destination</b> اختر <b>«حفظ بصيغة PDF» (Save as PDF)</b> بدل «حفظ في Google Drive».</li>'+
        '<li>اضغط <b>حفظ</b> ثم اختر مكان الحفظ على الحاسبة.</li>'+
        '</ol>'+
        '<p class="pdf-tip-note">ملاحظة: كروم يتذكر آخر وجهة استخدمتها، لذا بعد اختيار «حفظ بصيغة PDF» مرة واحدة ستبقى هي الافتراضية.</p>'+
        '<div class="pdf-tip-actions">'+
        '<button id="pdf-tip-again">🖨️ فتح نافذة الحفظ مجدداً</button>'+
        '<button id="pdf-tip-close">إغلاق</button>'+
        '</div></div>';
      document.body.appendChild(tip);
      var again=document.getElementById('pdf-tip-again');
      if(again) again.addEventListener('click', function(){ window.print(); });
      var cls=document.getElementById('pdf-tip-close');
      if(cls) cls.addEventListener('click', function(){ window.close(); });
      setTimeout(function(){ window.print(); }, 250);
    }

  }

  if(DEFER && tbodyEl){
    var src = (document.getElementById('rows-src') || {}).textContent || '';
    var parts = src.split('</tr>');
    if(parts.length && parts[parts.length-1].trim()==='') parts.pop();
    var pos = 0, CHUNK = 250;
    var fill = $('prep-fill'), num = $('prep-num');
    function pump(){
      var end = Math.min(parts.length, pos + CHUNK);
      tbodyEl.insertAdjacentHTML('beforeend', parts.slice(pos, end).join('</tr>') + '</tr>');
      pos = end;
      var pct = Math.round((pos/parts.length)*100);
      if(fill) fill.style.width = pct + '%';
      if(num) num.textContent = pos + ' من ' + TOTAL_ROWS;
      if(pos < parts.length) requestAnimationFrame(pump);
      else { var s=document.getElementById('rows-src'); if(s) s.remove(); initBatches(); }
    }
    requestAnimationFrame(pump);
  } else {
    initBatches();
  }




  function setIf(id, val, def){
    var el=$(id); if(!el) return;
    if(val===undefined) val=def;
    if(el.type==='checkbox') el.checked=!!val; else el.value=val;
  }
  setIf('pv-orient', prefs.orient, 'portrait');
  setIf('pv-size', prefs.size, 'A4');
  setIf('pv-margin', prefs.margin, '5');
  setIf('pv-repeat-header',  prefs.repeatHeader===undefined?true:prefs.repeatHeader);
  setIf('pv-repeat-sigs',    prefs.repeatSigs===undefined?true:prefs.repeatSigs);
  setIf('pv-compact-repeat', prefs.compactRepeat===undefined?true:prefs.compactRepeat);
  setIf('pv-show-logo',    prefs.showLogo===undefined?true:prefs.showLogo);
  setIf('pv-show-title',   prefs.showTitle===undefined?true:prefs.showTitle);
  setIf('pv-show-info',    prefs.showInfo===undefined?true:prefs.showInfo);
  setIf('pv-show-filters', prefs.showFilters===undefined?false:prefs.showFilters);
  setIf('pv-show-date',    prefs.showDate===undefined?true:prefs.showDate);
  setIf('pv-show-docnum',  prefs.showDocnum===undefined?false:prefs.showDocnum);
  setIf('pv-show-count',   prefs.showCount===undefined?false:prefs.showCount);
  setIf('pv-show-sigs',    prefs.showSigs===undefined?true:prefs.showSigs);
  setIf('pv-show-watermark', prefs.showWatermark===undefined?true:prefs.showWatermark);
  setIf('pv-fit',          prefs.fit===undefined?true:prefs.fit);

  applyPage();
  togRepH(); togCompact();
  togLogo(); togTitle(); togInfo(); togFilters(); togDate(); togDocnum(); togCount(); togWM();
  applyRepeatSigs(); applyFit();
  // Apply admin-fixed title to the banner and document title
  if(SYSTEM_PREFS && SYSTEM_PREFS.title){ syncTitle(); }
})();
</script>
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
  autoPrint?: boolean;
  headOfDepartment?: string;
}) {
  const { teacherName, semester, department, college, headers: rawHeaders, rows, autoPrint = true, headOfDepartment = '' } = opts;
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
.screen-actions{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;gap:10px;justify-content:center;align-items:center;padding:10px 14px;background:linear-gradient(180deg,#0f4c81,#0b3558);color:#fff;box-shadow:0 6px 20px rgba(15,76,129,.3)}
.screen-actions .pv-title{font-weight:800;font-size:13px}
.screen-actions input[type="text"]{flex:1;max-width:420px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.95);color:#0f4c81;font-weight:700;font-family:'Cairo',sans-serif;font-size:12.5px}
.screen-actions label{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer;color:#fff}
.screen-actions button{font-family:'Cairo',sans-serif;border:0;border-radius:8px;background:#fff;color:#0f4c81;font-weight:800;padding:9px 18px;cursor:pointer;font-size:12.5px}
body{padding-top:54px}
@page{size:A4 portrait;margin:5mm}
@media print{
  body{padding:0;padding-top:0}
  tr,td,th{page-break-inside:avoid}
  .signatures{page-break-inside:avoid}
  .pledge{page-break-inside:avoid}
  .screen-actions{display:none!important}
}
</style></head><body>
<div class="watermark">الجامعة التكنولوجية</div>
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

<div class="doc-title"><h1 id="doc-h1">${title}</h1></div>

<div class="info-band">
  <div class="info-cell"><strong>اسم التدريسي</strong>${teacherName || '—'}</div>
  <div class="info-cell"><strong>الفصل الدراسي</strong>${semester || '—'}</div>
  <div class="info-cell"><strong>القسم</strong>${department || '—'}</div>
  <div class="info-cell"><strong>الكلية</strong>${college || 'كلية الهندسة المدنية'}</div>
</div>

<table><thead><tr>${headers.map(h => `<th class="${isNarrow(h) ? 'narrow' : ''}">${h}</th>`).join('')}</tr></thead>
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
    <div class="sig-name">${headOfDepartment || ''}</div>
    <div class="sig-sub">التوقيع : ............................</div>
  </div>
</div>

<div class="doc-meta">
  <span id="issue-date-cell">تاريخ الإصدار : ${today}</span>
  <span>عدد التكليفات : ${rows.length}</span>
</div>

</div></div>
<div class="screen-actions">
  <span class="pv-title">📄 معاينة —</span>
  <input type="text" id="pv-title-input" value="${title.replace(/"/g, '&quot;')}"/>
  <label><input type="checkbox" id="pv-show-date" checked style="width:16px;height:16px"/> إظهار تاريخ الإصدار</label>
  <button onclick="window.print()">🖨️ طباعة</button>
  <button onclick="window.close()" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)">✕ إغلاق</button>
</div>
<script>
  (function(){
    var ti=document.getElementById('pv-title-input');
    var h1=document.getElementById('doc-h1');
    if(ti&&h1) ti.addEventListener('input',function(){ h1.textContent=ti.value; document.title=ti.value; });
    var cb=document.getElementById('pv-show-date');
    var dc=document.getElementById('issue-date-cell');
    if(cb&&dc) cb.addEventListener('change',function(){ dc.style.display=cb.checked?'':'none'; });
  })();
</script>

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
<style>.preview-bar-sr{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;gap:10px;justify-content:center;align-items:center;padding:10px 14px;background:linear-gradient(180deg,#0f4c81,#0b3558);color:#fff;font-family:'Cairo',sans-serif;box-shadow:0 6px 20px rgba(15,76,129,.3)}.preview-bar-sr .pv-title{font-weight:800;font-size:13px}.preview-bar-sr input[type="text"]{flex:1;max-width:420px;padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.95);color:#0f4c81;font-weight:700;font-family:'Cairo',sans-serif;font-size:12.5px}.preview-bar-sr label{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;cursor:pointer}.preview-bar-sr button{font-family:'Cairo',sans-serif;border:0;border-radius:8px;font-weight:800;padding:9px 18px;cursor:pointer;font-size:12.5px}.preview-bar-sr .btn-print{background:#fff;color:#0f4c81}.preview-bar-sr .btn-close{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.4)}body{padding-top:54px}@media print{.preview-bar-sr{display:none!important}body{padding-top:0!important}}</style>
</style></head><body>
<div class="preview-bar-sr">
  <span class="pv-title">📄 معاينة —</span>
  <input type="text" id="pv-title-input" value="${title.replace(/"/g, '&quot;')}"/>
  <label><input type="checkbox" id="pv-show-date" checked style="width:16px;height:16px"/> إظهار تاريخ الإصدار</label>
  <button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
  <button class="btn-close" onclick="window.close()">✕ إغلاق</button>
</div>
<div class="print-wrap">
<div class="print-header">
<img src="${universityLogo}" alt="شعار الجامعة"/>
<h1>كلية الهندسة المدنية - الجامعة التكنولوجية</h1>
<h2 id="doc-h1">${title}</h2>
<div class="subtitle">عدد السجلات: ${rows.length} <span id="issue-date-cell"> | تاريخ الإصدار: ${new Date().toLocaleDateString('ar-IQ')}</span></div>
</div>
<script>
  (function(){
    var ti=document.getElementById('pv-title-input');
    var h1=document.getElementById('doc-h1');
    if(ti&&h1) ti.addEventListener('input',function(){ h1.textContent=ti.value; document.title=ti.value; });
    var cb=document.getElementById('pv-show-date');
    var dc=document.getElementById('issue-date-cell');
    if(cb&&dc) cb.addEventListener('change',function(){ dc.style.display=cb.checked?'':'none'; });
  })();
</script>
${infoHtml ? `<div class="info-section">${infoHtml}</div>` : ''}
<div class="stats-bar">
<div class="stat">📊 إجمالي: ${rows.length}</div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
<div class="footer">${footerHtml}</div>
</div>
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
.actions{display:flex;gap:10px;justify-content:center;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.actions input[type="text"]{flex:1;max-width:380px;padding:7px 10px;border-radius:8px;border:1px solid #c5d3e3;color:#0f4c81;font-weight:700;font-family:'Cairo',sans-serif;font-size:12.5px}
.actions label{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#0f4c81;cursor:pointer}
.actions button{font-family:'Cairo',sans-serif;border:0;border-radius:8px;background:#0f4c81;color:#fff;font-weight:800;padding:10px 22px;cursor:pointer}
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
@media print{body{padding:0}tr,td,th{page-break-inside:avoid}.actions{display:none!important}}
</style></head><body>
<div class="actions">
  <input type="text" id="pv-title-input" value="${title.replace(/"/g, '&quot;')}"/>
  <label><input type="checkbox" id="pv-show-date" checked style="width:16px;height:16px"/> إظهار تاريخ التقرير</label>
  <button onclick="window.print()">🖨️ طباعة / حفظ PDF</button>
</div>
<h1 id="doc-h1">${title}</h1>
<h2>كلية الهندسة المدنية - الجامعة التكنولوجية</h2>
<div class="info">عدد السجلات: ${rows.length}<span id="issue-date-cell"> | تاريخ التقرير: ${new Date().toLocaleDateString('ar-IQ')}</span></div>
<script>
  (function(){
    var ti=document.getElementById('pv-title-input');
    var h1=document.getElementById('doc-h1');
    if(ti&&h1) ti.addEventListener('input',function(){ h1.textContent=ti.value; document.title=ti.value; });
    var cb=document.getElementById('pv-show-date');
    var dc=document.getElementById('issue-date-cell');
    if(cb&&dc) cb.addEventListener('change',function(){ dc.style.display=cb.checked?'':'none'; });
  })();
</script>
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
    style={{ '--stat-color': color } as CSSProperties}
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
