import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import type { ScheduleRow } from '@/data/scheduleData';
import type { PrintPrefs, SignatureItem } from '@/data/customSystemsRegistry';
import { buildPrintDocHtml } from '@/components/shared/ScheduleHelpers';

interface DirectoryHandle {
  getFileHandle(name: string, options: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

interface DirectPdfOptions {
  title: string;
  headers: string[];
  rows: ScheduleRow[];
  department?: string;
  filtersInfo?: { label: string; value: string }[];
  signatures?: SignatureItem[];
  printPrefs?: PrintPrefs;
  totals?: Record<string, string>;
  onProgress?: (completed: number, total: number, part: number, parts: number) => void;
  signal?: AbortSignal;
}

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'تقرير';
}

async function saveBlob(directory: DirectoryHandle | null, blob: Blob, filename: string) {
  if (directory) {
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface ExportApi { ready?: boolean; build?: () => number }

/**
 * يُنتج ملف PDF بنفس جودة «طباعة الجدول» تماماً: نُشغّل محرّك الطباعة الرسمي
 * نفسه داخل إطار مخفي (بانر + علامة مائية + تواقيع + تذييل لكل ورقة)، ثم
 * نلتقط كل ورقة A4 بدقة عالية ونضعها في ملف PDF واحد.
 */
export async function exportOfficialPdfToPc(options: DirectPdfOptions): Promise<{ files: number; folderMode: boolean }> {
  const picker = (window as unknown as { showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker;
  let directory: DirectoryHandle | null = null;
  if (picker) {
    try {
      directory = await picker.call(window, { mode: 'readwrite' });
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') throw error;
      directory = null;
    }
  }

  const total = options.rows.length;
  const reportName = safeName(options.printPrefs?.title || options.title);

  const html = buildPrintDocHtml(
    options.title,
    options.headers,
    options.rows,
    '',
    false,
    options.department,
    options.filtersInfo,
    options.signatures,
    options.printPrefs,
    false,
    options.totals,
  );

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1600px;height:1200px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument;
    const win = frame.contentWindow as (Window & { __reportExport?: ExportApi }) | null;
    if (!doc || !win) throw new Error('تعذر تجهيز محرك التقرير');
    doc.open();
    doc.write(html);
    doc.close();

    options.onProgress?.(0, total, 0, 1);

    // ننتظر جاهزية المستند (إدراج كل الصفوف + الخطوط)
    const deadline = Date.now() + 180_000;
    while (!win.__reportExport?.ready) {
      if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
      if (Date.now() > deadline) throw new Error('استغرق تجهيز التقرير وقتاً طويلاً');
      await wait(120);
    }
    try { await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* الخط الافتراضي كافٍ */ }
    await wait(350);

    // إخفاء عناصر المعاينة التي لا تُطبع، وإظهار صفحات الطباعة الفعلية
    const style = doc.createElement('style');
    style.textContent = `
      .preview-bar,#repeat-banner-preview,.print-area,.pdf-tip,#prep{display:none!important}
      body{background:#fff!important;margin:0!important;padding:0!important}
      #print-pages{display:block!important}
      .print-sheet{margin:0!important;padding:0!important;box-shadow:none!important;border-radius:0!important;max-width:none!important;background:#fff!important}
    `;
    doc.head.appendChild(style);

    const sheetCount = win.__reportExport?.build?.() || 0;
    await nextPaint();
    const sheets = Array.from(doc.querySelectorAll<HTMLElement>('#print-pages .print-sheet'));
    if (!sheets.length || !sheetCount) throw new Error('تعذر تقسيم التقرير إلى صفحات');

    const first = sheets[0];
    const widthPx = first.offsetWidth;
    const heightPx = first.offsetHeight;
    const pxToMm = 25.4 / 96;
    const pageW = widthPx * pxToMm;
    const pageH = heightPx * pxToMm;

    const pdf = new jsPDF({
      orientation: pageW >= pageH ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pageW, pageH],
      compress: true,
    });

    // دقة أعلى للتقارير القصيرة، وأخف للتقارير الضخمة حفاظاً على الذاكرة
    const scale = sheets.length > 120 ? 1.6 : sheets.length > 40 ? 2 : 2.6;

    for (let i = 0; i < sheets.length; i += 1) {
      if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
      const canvas = await html2canvas(sheets[i], {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        windowWidth: widthPx,
        windowHeight: heightPx,
      });
      const image = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) pdf.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait');
      pdf.addImage(image, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
      canvas.width = 0;
      canvas.height = 0;
      options.onProgress?.(
        Math.round((total * (i + 1)) / sheets.length),
        total,
        i + 1,
        sheets.length,
      );
      await nextPaint();
    }

    await saveBlob(directory, pdf.output('blob'), `${reportName}.pdf`);
    return { files: 1, folderMode: Boolean(directory) };
  } finally {
    frame.remove();
  }
}
