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

/** حجم الدفعة الداخلية: تجهيز 45 ألف صف دفعة واحدة يُجمّد المتصفح، لذا نعالجها مقاطع. */
function chunkSizeFor(total: number): number {
  if (total <= 1200) return total || 1;
  if (total <= 6000) return 800;
  return 600;
}

/**
 * يُنتج ملف PDF بنفس جودة «طباعة الجدول» تماماً: نُشغّل محرّك الطباعة الرسمي
 * نفسه داخل إطار مخفي (بانر + علامة مائية + تواقيع + تذييل لكل ورقة)، ثم
 * نلتقط كل ورقة A4 بدقة عالية ونضعها في ملف PDF واحد.
 * البيانات الضخمة تُعالَج على مقاطع داخلية حتى لا تتجمّد الصفحة.
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
  const chunk = chunkSizeFor(total);
  const chunks: ScheduleRow[][] = [];
  for (let i = 0; i < total; i += chunk) chunks.push(options.rows.slice(i, i + chunk));
  if (!chunks.length) chunks.push([]);

  let pdf: jsPDF | null = null;
  let pageW = 0;
  let pageH = 0;
  let processedRows = 0;
  let pageIndex = 0;

  const renderChunk = async (rows: ScheduleRow[], isLast: boolean) => {
    const html = buildPrintDocHtml(
      options.title,
      options.headers,
      rows,
      '',
      false,
      options.department,
      options.filtersInfo,
      options.signatures,
      options.printPrefs,
      false,
      isLast ? options.totals : undefined,
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

      const deadline = Date.now() + 120_000;
      while (!win.__reportExport?.ready) {
        if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
        if (Date.now() > deadline) throw new Error('استغرق تجهيز التقرير وقتاً طويلاً');
        await wait(80);
      }
      try { await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready; } catch { /* الخط الافتراضي كافٍ */ }
      await wait(200);

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

      if (!pdf) {
        const first = sheets[0];
        const pxToMm = 25.4 / 96;
        pageW = first.offsetWidth * pxToMm;
        pageH = first.offsetHeight * pxToMm;
        pdf = new jsPDF({
          orientation: pageW >= pageH ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [pageW, pageH],
          compress: true,
        });
      }

      // دقة أعلى للتقارير القصيرة، وأخف للتقارير الضخمة حفاظاً على الذاكرة والوقت
      const scale = total > 8000 ? 1.5 : total > 2500 ? 1.9 : 2.6;

      for (let i = 0; i < sheets.length; i += 1) {
        if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
        const canvas = await html2canvas(sheets[i], {
          scale,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          windowWidth: sheets[i].offsetWidth,
          windowHeight: sheets[i].offsetHeight,
        });
        const image = canvas.toDataURL('image/jpeg', 0.92);
        if (pageIndex > 0) pdf.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait');
        pdf.addImage(image, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
        pageIndex += 1;
        canvas.width = 0;
        canvas.height = 0;
        const done = processedRows + Math.round((rows.length * (i + 1)) / sheets.length);
        options.onProgress?.(Math.min(total, done), total, pageIndex, pageIndex);
        await nextPaint();
      }
      processedRows += rows.length;
    } finally {
      frame.remove();
    }
  };

  options.onProgress?.(0, total, 0, 1);
  for (let c = 0; c < chunks.length; c += 1) {
    if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
    await renderChunk(chunks[c], c === chunks.length - 1);
  }

  if (!pdf) throw new Error('تعذر إنشاء الملف');
  await saveBlob(directory, pdf.output('blob'), `${reportName}.pdf`);
  return { files: 1, folderMode: Boolean(directory) };
}

