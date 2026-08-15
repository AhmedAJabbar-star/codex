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

/** لا نعتمد على requestAnimationFrame وحده: المتصفح يوقفه عند تصغير النافذة أو تبديل التبويب. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    try { requestAnimationFrame(finish); } catch { /* تجاهل */ }
    window.setTimeout(finish, 24);
  });
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'تقرير';
}

/* ── تذكّر مجلد الحفظ: يُطلب أول مرة فقط ثم يُعاد استخدامه ── */
const DB_NAME = 'report-export';
const STORE = 'handles';
const KEY = 'pdf-folder';

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function loadSavedDirectory(): Promise<DirectoryHandle | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DirectoryHandle) || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function saveDirectory(handle: DirectoryHandle) {
  const db = await idb();
  if (!db) return;
  try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(handle, KEY); } catch { /* تجاهل */ }
}

async function ensurePermission(handle: DirectoryHandle | null): Promise<boolean> {
  if (!handle) return false;
  const h = handle as unknown as {
    queryPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  try {
    if ((await h.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
    return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch { return false; }
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
  let pagesInFile = 0;
  let fileIndex = 0;
  let savedFiles = 0;

  /** حد أقصى لعدد الصفحات في الملف الواحد: تجاوزه يفجّر ذاكرة النصوص في jsPDF (Invalid string length). */
  const PAGES_PER_FILE = 120;

  const flushPdf = async () => {
    if (!pdf || !pagesInFile) return;
    fileIndex += 1;
    const blob = pdf.output('blob');
    const name = `${reportName}${fileIndex > 1 || pagesInFile >= PAGES_PER_FILE ? ` - جزء ${fileIndex}` : ''}.pdf`;
    await saveBlob(directory, blob, name);
    savedFiles += 1;
    pdf = null;
    pagesInFile = 0;
  };


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

      if (!pageW || !pageH) {
        const first = sheets[0];
        const pxToMm = 25.4 / 96;
        pageW = first.offsetWidth * pxToMm;
        pageH = first.offsetHeight * pxToMm;
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
        if (pagesInFile >= PAGES_PER_FILE) await flushPdf();
        if (!pdf) {
          pdf = new jsPDF({
            orientation: pageW >= pageH ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [pageW, pageH],
            compress: true,
          });
        } else {
          pdf.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait');
        }
        pdf.addImage(image, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
        pageIndex += 1;
        pagesInFile += 1;
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

  await flushPdf();
  if (!savedFiles) throw new Error('تعذر إنشاء الملف');
  return { files: savedFiles, folderMode: Boolean(directory) };

}

