/**
 * 🔤 تطبيع ومطابقة النصوص العربية
 * يعالج فروقات الهمزات والتاء المربوطة والألف المقصورة والتشكيل والمسافات،
 * ويوفّر أوضاع مطابقة متعددة (تام / يحتوي / أول N حرف / نسبة تشابه).
 * مكافئ للمعادلة:
 * =LEFT(SUBSTITUTE(...TRIM(R7)," ","")...,15)
 */

export type ArabicMatchMode = 'exact' | 'contains' | 'prefix' | 'similarity' | 'tokens';

/** يزيل الفوارق الشكلية المعروفة في العربية ويهمل المسافات (اختياري). */
export function normalizeArabic(input: string, ignoreSpaces = true): string {
  let s = String(input ?? '').trim();
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, ''); // تشكيل + تطويل
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/گ/g, 'ك')
    .replace(/[پ]/g, 'ب')
    .replace(/[چ]/g, 'ج');
  s = s.replace(/[\u200f\u200e\u061c]/g, '');
  s = s.replace(/[.,،؛;:_\-]/g, ' ');
  s = ignoreSpaces ? s.replace(/\s+/g, '') : s.replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}

/** أول N حرفاً بعد التطبيع (مكافئ لدالة LEFT في المعادلة). */
export function normalizedPrefix(input: string, len = 15, ignoreSpaces = true): string {
  const n = normalizeArabic(input, ignoreSpaces);
  return len > 0 ? n.slice(0, len) : n;
}

/** مسافة ليفنشتاين (محدودة الحجم لتفادي البطء). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = tmp;
    }
  }
  return prev[b.length];
}

/** نسبة التشابه 0..100 بعد التطبيع. */
export function similarityPct(a: string, b: string, ignoreSpaces = true): number {
  const x = normalizeArabic(a, ignoreSpaces);
  const y = normalizeArabic(b, ignoreSpaces);
  if (!x && !y) return 100;
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.length > 400 || y.length > 400) return x.includes(y) || y.includes(x) ? 100 : 0;
  const d = levenshtein(x, y);
  return Math.max(0, Math.round((1 - d / Math.max(x.length, y.length)) * 100));
}

export interface ArabicMatchOptions {
  /** وضع المطابقة. الافتراضي 'exact'. */
  mode?: ArabicMatchMode;
  /** تفعيل تطبيع الحروف العربية. الافتراضي true. */
  normalize?: boolean;
  /** إهمال المسافات. الافتراضي true. */
  ignoreSpaces?: boolean;
  /** عدد الحروف في وضع «أول N حرف». الافتراضي 15. */
  prefixLen?: number;
  /** الحد الأدنى للتشابه في وضع النسبة. الافتراضي 85. */
  threshold?: number;
  /** أقل عدد أجزاء اسم متطابقة في وضع «أجزاء الاسم». الافتراضي 2. */
  minTokens?: number;
}

/** يقسّم النص إلى أجزاء (كلمات) مطبّعة، مع تجاهل الألقاب الشائعة. */
const TITLES = new Set(['د', 'دكتور', 'الدكتور', 'ا', 'أ', 'است', 'استاذ', 'الاستاذ', 'م', 'مهندس', 'السيد', 'السيده', 'ام', 'ابو']);
export function arabicTokens(input: string): string[] {
  return normalizeArabic(input, false)
    .split(' ')
    .map((t) => t.replace(/^ال(?=.{3,})/, ''))
    .filter((t) => t.length > 1 && !TITLES.has(t));
}

/** يعيد أجزاء النص قبل إزالة التعريف «ال»؛ مفيد للمقارنة الملتصقة/المفصولة. */
function arabicTokensRaw(input: string): string[] {
  return normalizeArabic(input, false)
    .split(' ')
    .filter((t) => t.length > 1 && !TITLES.has(t));
}

/** كلمات وصل/سرد شائعة: لا تُعتبر أجزاء اسم أبداً. */
const FILLERS = new Set(['الى', 'إلى', 'من', 'ومن', 'ثم', 'كان', 'كانت', 'في', 'على', 'عن', 'مع', 'الذي', 'التي', 'يذهب', 'ذهب', 'و', 'او', 'ال']);

/** يطابق تتابع أجزاء الاسم داخل مصفوفة كلمات، مع السماح بفاصل كلمة واحدة
 *  ودمج كلمتين متتاليتين («عبد» + «الامير» = «عبدالامير»). يعيد أطول تتابع مطابق. */
function orderedRun(hay: string[], needle: string[]): number {
  let best = 0;
  for (let start = 0; start < hay.length; start++) {
    let i = start;
    let j = 0;
    let matched = 0;
    let gapUsed = false;
    while (i < hay.length && j < needle.length) {
      const one = hay[i];
      const two = i + 1 < hay.length ? hay[i] + hay[i + 1] : '';
      if (one === needle[j]) {
        matched++; i += 1; j += 1; gapUsed = false; continue;
      }
      if (two && two === needle[j]) {
        matched++; i += 2; j += 1; gapUsed = false; continue;
      }
      if (!gapUsed && matched > 0) {
        gapUsed = true; i += 1; continue;
      }
      break;
    }
    if (matched > best) best = matched;
    if (best >= needle.length) break;
  }
  return best;
}

/** يطابق الأسماء الجزئية: «هبة أحمد» ↔ «هبه أحمد علي حسن».
 *  كما يتعامل مع الأسماء الملتصقة مقابل المفصولة: «عبدالامير» ↔ «عبد الامير».
 *  عند `requireAdjacent` (الافتراضي) يجب أن تكون أجزاء الاسم متتابعة داخل النص،
 *  فلا تتحقّق المطابقة إذا كانت الكلمات متفرّقة في جملة سردية طويلة.
 */
export function tokensMatch(cell: string, needle: string, minTokens = 2, requireAdjacent = true): boolean {
  const a = arabicTokens(cell);
  const b = arabicTokens(needle);
  if (!a.length || !b.length) return false;

  // ✅ حالة خاصة: الاسم الملتصق مقابل المفصول (عبدالامير vs عبد الامير)
  const rawA = arabicTokensRaw(cell).join('');
  const rawB = arabicTokensRaw(needle).join('');
  if (rawA.includes(rawB) || rawB.includes(rawA)) return true;

  const nameA = arabicTokensRaw(cell).filter((t) => !FILLERS.has(t));
  const nameB = arabicTokensRaw(needle).filter((t) => !FILLERS.has(t));
  if (!nameA.length || !nameB.length) return false;
  const need = Math.max(1, Math.min(minTokens, Math.min(nameA.length, nameB.length)));

  if (requireAdjacent) {
    const hayA = arabicTokensRaw(cell);
    const hayB = arabicTokensRaw(needle);
    const run = Math.max(orderedRun(hayA, nameB), orderedRun(hayB, nameA));
    return run >= need;
  }

  const setA = new Set(a);
  const common = b.filter((t) => setA.has(t)).length;
  return common >= need;
}





/**
 * يقارن قيمة خلية بقيمة هوية المستخدم وفق الخيارات.
 * `cell` قد يكون نصاً طويلاً (مثل عمود «النصوص») يحتوي الاسم ضمنه.
 */
export function arabicMatch(cell: string, needle: string, opts: ArabicMatchOptions = {}): boolean {
  const mode = opts.mode || 'exact';
  const ignoreSpaces = opts.ignoreSpaces !== false;
  const useNorm = opts.normalize !== false;
  const prep = (v: string) =>
    useNorm ? normalizeArabic(v, ignoreSpaces) : String(v ?? '').replace(/\s+/g, ' ').trim();
  const c = prep(cell);
  const n = prep(needle);
  if (!n) return false;
  switch (mode) {
    case 'contains':
      return !!c && (c.includes(n) || n.includes(c));
    case 'prefix': {
      const len = opts.prefixLen && opts.prefixLen > 0 ? opts.prefixLen : 15;
      const cp = c.slice(0, len);
      const np = n.slice(0, len);
      return !!cp && (cp === np || c.includes(np));
    }
    case 'tokens':
      return tokensMatch(cell, needle, opts.minTokens ?? 2);
    case 'similarity': {
      const th = typeof opts.threshold === 'number' ? opts.threshold : 85;
      if (!c) return false;
      if (c.includes(n) || n.includes(c)) return true;
      if (tokensMatch(cell, needle, opts.minTokens ?? 2)) return true;
      return similarityPct(c, n, ignoreSpaces) >= th;
    }

    case 'exact':
    default:
      return !!c && c === n;
  }
}
