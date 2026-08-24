import { useEffect, useState, type InputHTMLAttributes } from 'react';

/** تحويل قيمة مخزّنة (ISO yyyy-mm-dd أو صيغة Sheets M/D/YYYY) إلى عرض يوم/شهر/سنة. */
export const isoToDmy = (v: string): string => {
  const s = (v || '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  const mdy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (mdy) {
    const a = parseInt(mdy[1], 10);
    const b = parseInt(mdy[2], 10);
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    // إذا كان الجزء الأول أكبر من 12 فهو اليوم قطعاً، وإلا نفترض صيغة Sheets (شهر/يوم)
    const d = a > 12 ? a : b;
    const m = a > 12 ? b : a;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
  }
  return '';
};

/** تحويل نص يوم/شهر/سنة إلى ISO yyyy-mm-dd (أو null إذا كان غير صالح). */
export const dmyToIso = (text: string): string | null => {
  const m = (text || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // تحقق فعلي من صحة التاريخ (مثلاً 31/02 مرفوض)
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/**
 * حقل تاريخ بصيغة «يوم/شهر/سنة» — القيمة الخارجية تبقى ISO (yyyy-mm-dd)
 * حتى تبقى المقارنات والتخزين متوافقة، بينما يرى المستخدم ويكتب بالصيغة العربية.
 * يدعم الإدخال بالأرقام فقط مع إدراج الفواصل تلقائياً (مثال: 24082026 ← 24/08/2026).
 */
export const DateInputDMY = ({ value, onChange, placeholder, ...rest }: {
  value: string;
  onChange: (iso: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
  const [text, setText] = useState(() => isoToDmy(value));
  const [focused, setFocused] = useState(false);

  // مزامنة العرض من القيمة الخارجية فقط عندما لا يكون الحقل قيد التحرير
  useEffect(() => { if (!focused) setText(isoToDmy(value)); }, [value, focused]);

  const handle = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setText(out);
    if (!digits) { onChange(''); return; }
    if (digits.length === 8) {
      const iso = dmyToIso(out);
      if (iso) onChange(iso);
    }
  };

  const blur = () => {
    setFocused(false);
    const iso = dmyToIso(text);
    if (iso) {
      if (iso !== value) onChange(iso);
      setText(isoToDmy(iso));
    } else {
      // نص غير مكتمل/غير صالح → إعادة العرض إلى آخر قيمة صحيحة
      setText(isoToDmy(value));
    }
  };

  return (
    <input
      {...rest}
      value={text}
      inputMode="numeric"
      dir="ltr"
      placeholder={placeholder ?? 'يوم/شهر/سنة'}
      title="اكتب التاريخ بصيغة يوم/شهر/سنة — مثال: 24/08/2026"
      onFocus={() => setFocused(true)}
      onChange={(e) => handle(e.target.value)}
      onBlur={blur}
    />
  );
};
