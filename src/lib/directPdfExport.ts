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
  if (picker) directory = await picker({ mode: 'readwrite' });

  const [fontDataUrl, logoDataUrl] = await Promise.all([
    asDataUrl(arabicFontAsset.url),
    asDataUrl(universityLogo),
  ]);

  const total = options.rows.length;
  const parts = Math.max(1, Math.ceil(total / PART_ROWS));
  const reportName = safeName(options.printPrefs?.title || options.title);
  const date = new Date().toLocaleDateString('ar-IQ');
  const signatures = options.signatures?.length
    ? options.signatures
    : [{ label: 'مقرر القسم' }, { label: 'رئيس القسم' }, { label: 'مصادقة العميد' }];

  for (let part = 0; part < parts; part += 1) {
    if (options.signal?.aborted) throw new DOMException('تم إلغاء إنشاء التقرير', 'AbortError');
    const start = part * PART_ROWS;
    const end = Math.min(total, start + PART_ROWS);
    const partRows = options.rows.slice(start, end);
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
    const drawHeader = () => {
      doc.setDrawColor(15, 76, 129);
      doc.setLineWidth(0.45);
      doc.line(margin, headerHeight, pageWidth - margin, headerHeight);
      if (options.printPrefs?.showLogo !== false) doc.addImage(logoDataUrl, 'JPEG', pageWidth / 2 - 8, 3, 16, 25, undefined, 'FAST');
      doc.setTextColor(15, 76, 129);
      doc.setFontSize(10);
      doc.text('جمهورية العراق\nوزارة التعليم العالي والبحث العلمي', pageWidth - margin, 8, { align: 'right' });
      doc.text('الجامعة التكنولوجية\nكلية الهندسة المدنية', margin, 8, { align: 'left' });
      if (options.printPrefs?.showTitle !== false) {
        doc.setFontSize(13);
        doc.text(options.printPrefs?.title || options.title, pageWidth / 2, 31, { align: 'center' });
      }
      doc.setFontSize(7.5);
      doc.setTextColor(65, 82, 102);
      doc.text(`التاريخ: ${date}   |   السجلات: ${start + 1}–${end} من ${total}   |   الجزء ${part + 1} من ${parts}`, pageWidth / 2, headerHeight - 2, { align: 'center' });
    };

    autoTable(doc, {
      head: [options.headers],
      body: partRows.map((row) => options.headers.map((header) => String(row[header] ?? ''))),
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

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont('NotoNaskhArabic', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(75, 91, 110);
      doc.text(`صفحة ${page} من ${pageCount}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    }
    if (options.printPrefs?.showSigs !== false && signatures.length) {
      doc.setPage(pageCount);
      doc.setFontSize(8);
      const y = pageHeight - 10;
      signatures.forEach((signature, index) => {
        const x = margin + ((pageWidth - margin * 2) * (index + 0.5)) / signatures.length;
        doc.text(`${signature.label}${signature.name ? `: ${signature.name}` : ''}`, x, y, { align: 'center' });
      });
    }

    const suffix = parts > 1 ? ` - الجزء ${String(part + 1).padStart(2, '0')} من ${String(parts).padStart(2, '0')}` : '';
    await saveBlob(directory, doc.output('blob'), `${reportName}${suffix}.pdf`);
    doc.deletePage(1);
    options.onProgress?.(end, total, part + 1, parts);
    await nextPaint();
  }
  return { files: parts, folderMode: Boolean(directory) };
}