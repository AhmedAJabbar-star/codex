import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ScheduleRow } from '@/data/scheduleData';
import type { PrintPrefs, SignatureItem } from '@/data/customSystemsRegistry';
import universityLogo from '@/assets/university-logo.jpg';
import arabicFontAsset from '@/assets/noto-naskh-arabic.ttf.asset.json';

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
  onProgress?: (completed: number, total: number, part: number, parts: number) => void;
  signal?: AbortSignal;
}

const PART_ROWS = 2_000;

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function safeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90) || 'تقرير';
}

async function asDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('تعذر تحميل أحد أصول التقرير');
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64Body(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
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

/**
 * Generates bounded-size PDF parts and writes each part immediately. This keeps
 * memory stable even for 40k+ rows and never creates a giant printable DOM tree.
 */
export async function exportOfficialPdfToPc(options: DirectPdfOptions): Promise<{ files: number; folderMode: boolean }> {
  const picker = (window as unknown as { showDirectoryPicker?: (options?: { mode: 'readwrite' }) => Promise<DirectoryHandle> }).showDirectoryPicker;
  let directory: DirectoryHandle | null = null;
  if (picker) {
    try {
      directory = await picker.call(window, { mode: 'readwrite' });
    } catch (error) {
      const name = (error as DOMException)?.name;
      // المستخدم ألغى الاختيار => نوقف العملية. أي خطأ آخر (مثل التشغيل داخل إطار
      // معاينة cross-origin) => نتابع بالتنزيل العادي إلى مجلد التنزيلات.
      if (name === 'AbortError') throw error;
      directory = null;
    }
  }


  const [fontDataUrl, logoDataUrl] = await Promise.all([
    asDataUrl(arabicFontAsset.url),
    asDataUrl(universityLogo),
  ]);

  const total = options.rows.length;
  const chunks = Math.max(1, Math.ceil(total / PART_ROWS));
  const reportName = safeName(options.printPrefs?.title || options.title);
  const date = new Date().toLocaleDateString('en-GB');
  const signatures = options.signatures?.length
    ? options.signatures
    : [{ label: 'مقرر القسم' }, { label: 'رئيس القسم' }, { label: 'مصادقة العميد' }];

  const wide = options.headers.length > 12;
  const doc = new jsPDF({
    orientation: options.printPrefs?.orient || 'landscape',
    unit: 'mm',
    format: wide ? 'a3' : (options.printPrefs?.size?.toLowerCase() || 'a4'),
    compress: true,
    putOnlyUsedFonts: true,
  });
  doc.addFileToVFS('NotoNaskhArabic.ttf', base64Body(fontDataUrl));
  doc.addFont('NotoNaskhArabic.ttf', 'NotoNaskhArabic', 'normal');
  doc.setFont('NotoNaskhArabic', 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = Number(options.printPrefs?.margin || 8);
  const headerHeight = options.printPrefs?.compactRepeat ? 29 : 37;

  // jsPDF لا يطبّق خوارزمية bidi على النص المختلط (عربي + أرقام + رموز)،
  // فتظهر أسطر الترويسة مبعثرة. لذلك نقسّم النص إلى مقاطع متجانسة
  // (عربية / غير عربية) ونرسمها يميناً إلى يسار مع فراغات ثابتة.
  const GAP = 1.8;
  const WIDE_GAP = 7; // فاصل بصري بدل رموز الفصل التي تربك ترتيب النص
  const toSegments = (text: string): string[] =>
    (text.match(/[\u0600-\u06FF\u0750-\u077F]+(?:\s+[\u0600-\u06FF\u0750-\u077F]+)*|[^\u0600-\u06FF\u0750-\u077F\s]+/g) || []);
  // القيمة '' تعني فاصلاً واسعاً بلا رموز.
  const drawRtlSegments = (segments: string[], centerX: number, y: number) => {
    const widths = segments.map((segment) => (segment === '' ? WIDE_GAP : doc.getTextWidth(segment)));
    const totalWidth = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, segments.length - 1);
    let x = centerX + totalWidth / 2;
    segments.forEach((segment, index) => {
      x -= widths[index];
      if (segment !== '') doc.text(segment, x, y, { align: 'left' });
      x -= GAP;
    });
  };
  const drawRtlText = (text: string, centerX: number, y: number) => drawRtlSegments(toSegments(text), centerX, y);

  const drawHeader = () => {
    doc.setFont('NotoNaskhArabic', 'normal');
    doc.setDrawColor(15, 76, 129);
    doc.setLineWidth(0.45);
    doc.line(margin, headerHeight, pageWidth - margin, headerHeight);
    if (options.printPrefs?.showLogo !== false) doc.addImage(logoDataUrl, 'JPEG', pageWidth / 2 - 8, 3, 16, 25, undefined, 'FAST');
    doc.setTextColor(15, 76, 129);
    doc.setFontSize(10);
    doc.text('جمهورية العراق\nوزارة التعليم العالي والبحث العلمي', pageWidth - margin, 8, { align: 'right' });
    doc.text(`الجامعة التكنولوجية\nكلية الهندسة المدنية${options.department ? `\n${options.department}` : ''}`, margin, 8, { align: 'left' });
    if (options.printPrefs?.showTitle !== false) {
      doc.setFontSize(13);
      doc.text(options.printPrefs?.title || options.title, pageWidth / 2, 31, { align: 'center' });
    }
    doc.setFontSize(7.5);
    doc.setTextColor(65, 82, 102);
    drawRtlSegments(['التاريخ', date, '', 'عدد السجلات', String(total)], pageWidth / 2, headerHeight - 2);
    if (options.printPrefs?.showFilters !== false && options.filtersInfo?.length) {
      doc.setFontSize(6.5);
      const filterSegments: string[] = [];
      options.filtersInfo.slice(0, 8).forEach((item, index) => {
        if (index > 0) filterSegments.push('');
        filterSegments.push(...toSegments(item.label), ...toSegments(item.value));
      });
      drawRtlSegments(filterSegments, pageWidth / 2, headerHeight + 1.5);
    }

  };


  // الجدول في PDF يُرسم من اليسار لليمين، لذلك نعكس ترتيب الأعمدة
  // كي تظهر القراءة من اليمين إلى اليسار مثل زر الطباعة.
  const rtlHeaders = [...options.headers].reverse();

  for (let chunk = 0; chunk < chunks; chunk += 1) {
    if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
    const start = chunk * PART_ROWS;
    const end = Math.min(total, start + PART_ROWS);
    if (chunk > 0) doc.addPage();

    autoTable(doc, {
      head: [rtlHeaders],
      body: options.rows.slice(start, end).map((row) => rtlHeaders.map((header) => String(row[header] ?? ''))),
      startY: headerHeight + 2,
      margin: { top: headerHeight + 2, right: margin, bottom: 15, left: margin },
      theme: 'grid',
      styles: {
        font: 'NotoNaskhArabic',
        fontStyle: 'normal',
        fontSize: wide ? 5.4 : options.headers.length > 8 ? 6.2 : 7,
        cellPadding: 1.15,
        halign: 'center',
        valign: 'middle',
        overflow: 'linebreak',
        lineColor: [197, 211, 227],
        lineWidth: 0.15,
        textColor: [11, 31, 51],
      },
      headStyles: { fillColor: [15, 76, 129], textColor: [255, 255, 255], fontSize: wide ? 5.8 : 7.2 },
      alternateRowStyles: { fillColor: [244, 248, 253] },
      didDrawPage: () => drawHeader(),
    });

    options.onProgress?.(end, total, chunk + 1, chunks);
    await nextPaint();
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('NotoNaskhArabic', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(75, 91, 110);
    drawRtlText(`صفحة ${page} من ${pageCount}`, pageWidth / 2, pageHeight - 5);
  }
  if (options.printPrefs?.showSigs !== false && signatures.length) {
    doc.setPage(pageCount);
    doc.setFontSize(8);
    const y = pageHeight - 10;
    signatures.forEach((signature, index) => {
      const x = margin + ((pageWidth - margin * 2) * (index + 0.5)) / signatures.length;
      drawRtlText(`${signature.label}${signature.name ? `: ${signature.name}` : ''}`, x, y);
    });
  }

  await saveBlob(directory, doc.output('blob'), `${reportName}.pdf`);
  return { files: 1, folderMode: Boolean(directory) };
}
