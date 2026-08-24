import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

/** تحويل أي صيغة تاريخ (ISO / سنة/شهر/يوم / شهر/يوم/سنة / طابع عربي مع وقت) إلى ISO yyyy-mm-dd. */
export const anyToIso = (v: string): string => {
  let s = (v || '').trim();
  if (!s) return '';
  s = s
    .replace(/[\u200f\u200e]/g, '')
    .replace(/\d{1,2}:\d{2}(:\d{2})?\s*(ص|م|صباحاً|مساءً|AM|PM|am|pm)?/g, ' ')
    .replace(/\b(ص|م|AM|PM|am|pm)\b/g, ' ')
    .trim();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = s.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (ymd) {
    const y = +ymd[1], m = +ymd[2], d = +ymd[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`;
  }
  const other = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (other) {
    const a = +other[1], b = +other[2];
    let y = +other[3];
    if (y < 100) y += 2000;
    const d = a > 12 ? a : b;
    const m = a > 12 ? b : a;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${pad(m)}-${pad(d)}`;
  }
  return '';
};

/** العرض المعتمد في النظام: سنة/شهر/يوم — مثال 2021/08/24 */
export const isoToDisplay = (v: string): string => {
  const iso = anyToIso(v);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}/${m}/${d}`;
};

/** توافق خلفي مع الاستدعاءات القديمة. */
export const isoToDmy = isoToDisplay;
export const dmyToIso = (text: string): string | null => anyToIso(text) || null;

/**
 * حقل تاريخ عربي: يعرض ويكتب بصيغة «سنة/شهر/يوم» (2021/08/24) مع إدراج الفواصل
 * تلقائياً أثناء الكتابة، بالإضافة إلى أيقونة 📅 تفتح تقويم المتصفح لاختيار التاريخ.
 * القيمة الخارجية تبقى ISO (yyyy-mm-dd) لسلامة المقارنات والتخزين.
 */
export const DateInputDMY = ({ value, onChange, placeholder, className, style, ...rest }: {
  value: string;
  onChange: (iso: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [focused, setFocused] = useState(false);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!focused) setText(isoToDisplay(value)); }, [value, focused]);

  const handle = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 4)}/${digits.slice(4)}`;
    if (digits.length > 6) out = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
    setText(out);
    if (!digits) { onChange(''); return; }
    if (digits.length === 8) {
      const iso = anyToIso(out);
      if (iso) onChange(iso);
    }
  };

  const blur = () => {
    setFocused(false);
    const iso = anyToIso(text);
    if (iso) {
      if (iso !== value) onChange(iso);
      setText(isoToDisplay(iso));
    } else {
      setText(isoToDisplay(value));
    }
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    el.value = anyToIso(value) || '';
    try { (el as any).showPicker?.(); } catch { /* المتصفح لا يدعم showPicker */ }
  };

  return (
    <div className="relative flex items-stretch" style={{ minWidth: 0 }}>
      <input
        {...rest}
        className={className}
        style={{ ...(style || {}), paddingInlineStart: 38 }}
        value={text}
        inputMode="numeric"
        dir="ltr"
        placeholder={placeholder ?? 'سنة/شهر/يوم'}
        title="اكتب التاريخ بصيغة سنة/شهر/يوم — مثال: 2021/08/24 — أو اضغط 📅 لاختياره من التقويم"
        onFocus={() => setFocused(true)}
        onChange={(e) => handle(e.target.value)}
        onBlur={blur}
      />
      {/* زر التقويم: أيقونة مرئية + حقل تاريخ أصلي شفاف فوقها ليعمل النقر في كل المتصفحات */}
      <span
        title="اختيار التاريخ من التقويم"
        className="absolute top-1/2 -translate-y-1/2 grid place-items-center rounded-lg text-base pointer-events-none"
        style={{ insetInlineStart: 4, width: 30, height: 30, background: 'rgba(37,99,235,.10)', border: '1px solid rgba(37,99,235,.25)', zIndex: 2 }}
      >📅</span>
      <input
        ref={pickerRef}
        type="date"
        aria-label="اختيار التاريخ من التقويم"
        className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
        style={{ insetInlineStart: 4, width: 30, height: 30, opacity: 0, zIndex: 3, padding: 0, border: 0, background: 'transparent' }}
        onMouseDown={(e) => { e.preventDefault(); openPicker(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
        onChange={(e) => { if (e.target.value) { onChange(e.target.value); setText(isoToDisplay(e.target.value)); } }}
      />
    </div>
  );
};

