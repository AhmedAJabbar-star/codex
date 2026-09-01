/**
 * تحويل الأعداد إلى كلمات عربية + تفقيط المبالغ بالدينار العراقي.
 * دالة عامة تعمل مع أي قيمة رقمية (وحتى المليارات والتريليونات).
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TEENS = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** صيغ المقاييس: [مفرد, مثنى, جمع (3-10), تمييز مفرد منصوب (11+)] */
const SCALES: [string, string, string, string][] = [
  ['', '', '', ''],
  ['ألف', 'ألفان', 'آلاف', 'ألفاً'],
  ['مليون', 'مليونان', 'ملايين', 'مليوناً'],
  ['مليار', 'ملياران', 'مليارات', 'ملياراً'],
  ['ترليون', 'ترليونان', 'ترليونات', 'ترليوناً'],
  ['كوادرليون', 'كوادرليونان', 'كوادرليونات', 'كوادرليوناً'],
];

/** يحوّل عدداً من 1 إلى 999 إلى كلمات. */
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 10) parts.push(ONES[rest]);
    else if (rest < 20) parts.push(TEENS[rest - 10]);
    else {
      const u = rest % 10;
      const t = Math.floor(rest / 10);
      parts.push(u ? `${ONES[u]} و${TENS[t]}` : TENS[t]);
    }
  }
  return parts.join(' و');
}

/** صيغة المقياس (ألف/مليون/...) حسب عدد المجموعة. */
function scaleWord(group: number, scaleIndex: number): string {
  const [one, two, few, many] = SCALES[scaleIndex];
  if (!one) return '';
  if (group === 1) return one;
  if (group === 2) return two;
  // التمييز يتبع آخر خانتين: 3-10 جمع، 11-99 مفرد منصوب، والمضاعفات (100، 200...) مفرد مجرور.
  const rem = group % 100;
  if (rem === 0) return one;
  if (rem >= 3 && rem <= 10) return few;
  return many;
}

/** تحويل أي عدد صحيح غير سالب إلى كلمات عربية. */
export function integerToArabicWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'صفر';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const chunks: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i];
    if (!g) continue;
    if (i === 0) {
      chunks.push(below1000(g));
    } else if (g === 1 || g === 2) {
      chunks.push(scaleWord(g, i));
    } else {
      chunks.push(`${below1000(g)} ${scaleWord(g, i)}`);
    }
  }
  return chunks.join(' و');
}

/** تنسيق رقمي بفواصل الآلاف (أرقام لاتينية) مع كسور عند وجودها فقط. */
export function formatAmountDigits(value: number): string {
  const abs = Math.abs(value);
  const hasFraction = Math.round(abs * 100) % 100 !== 0;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
}

/**
 * تفقيط مبلغ بالدينار العراقي، مثال:
 * 38551500 → «ثمانية وثلاثون مليوناً وخمسمائة وواحد وخمسون ألفاً وخمسمائة دينار عراقي لا غير»
 */
export function amountToIraqiDinarWords(value: number): string {
  if (!isFinite(value)) return '';
  const negative = value < 0;
  const abs = Math.abs(value);
  const dinars = Math.floor(abs + 1e-9);
  const fils = Math.round((abs - dinars) * 100);

  let text = `${integerToArabicWords(dinars)} ${dinars === 1 ? 'دينار عراقي' : dinars === 2 ? 'ديناران عراقيان' : dinars >= 3 && dinars <= 10 ? 'دنانير عراقية' : 'ديناراً عراقياً'}`;
  if (fils > 0) text += ` و${integerToArabicWords(fils)} ${fils <= 10 ? 'فلساً' : 'فلساً'}`;
  if (negative) text = `سالب ${text}`;
  return `${text} لا غير`;
}

/** يستخرج أول قيمة رقمية من نص (يتجاهل الفواصل والرموز). */
export function parseAmount(text: string): number | null {
  const cleaned = String(text ?? '').replace(/[^\d.\-]/g, '');
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
