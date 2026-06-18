import { useEffect, useState } from 'react';

export type UiTheme =
  | 'original'   // Original system look (colored side rails, pastel pills)
  | 'vivid3d'    // Vibrant 3D with depth and orbs
  | 'glasspro'   // Premium professional frosted glass
  | 'royal'      // Royal Navy + Gold
  | 'sapphire'   // Deep Sapphire + Silver
  | 'burgundy'   // Burgundy + Cream
  | 'forest'     // Forest Green + Bronze
  | 'slate'      // Charcoal Slate + Steel
  | 'bronze'     // Antique Bronze + Ivory
  | 'pearl'      // Pearl + Navy
  | 'emerald'    // Emerald + Gold
  | 'onyx'       // Onyx + Platinum
  | 'glass';     // Crystal Glass

export const UI_THEMES: { id: UiTheme; label: string; description: string; swatch: string }[] = [
  { id: 'original', label: '🏛️ الأصلي — تصميم النظام',     description: 'الواجهة الأصلية للنظام: بطاقات بيضاء بأشرطة جانبية ملوّنة وشارات باستيل.', swatch: 'linear-gradient(135deg,#e0f2fe,#fae8ff)' },
  { id: 'vivid3d',  label: '✨ ثلاثي الأبعاد النابض',        description: 'بطاقات ثلاثية الأبعاد بمنظور حيوي وألوان نابضة وهالات ضوئية.',              swatch: 'linear-gradient(135deg,#6366f1,#ec4899)' },
  { id: 'glasspro', label: '🪟 زجاجي احترافي',              description: 'زجاج مصقول احترافي بضبابية عالية وحواف لامعة — مظهر أبل-بريميوم.',         swatch: 'linear-gradient(135deg,#bfdbfe,#e0e7ff)' },
  { id: 'royal',    label: '👑 الملكي — كحلي وذهبي',       description: 'كحلي عميق مع ذهب دافئ وخلفية كريمية — الطابع الجامعي الرسمي.', swatch: 'linear-gradient(135deg,#0b2545,#c9a24a)' },
  { id: 'sapphire', label: '💠 الياقوت الأزرق',             description: 'أزرق ياقوتي عميق مع لمسات فضية — أكاديمي راقٍ.',                swatch: 'linear-gradient(135deg,#0a1f44,#94a3b8)' },
  { id: 'burgundy', label: '🍷 العنابي الكلاسيكي',          description: 'عنابي أكاديمي مع عاجي دافئ ولمسات ذهبية.',                       swatch: 'linear-gradient(135deg,#6e1423,#b8860b)' },
  { id: 'forest',   label: '🌲 الأخضر الحرجي',              description: 'أخضر حرجي عميق مع برونزي عتيق — هيبة طبيعية.',                  swatch: 'linear-gradient(135deg,#1f3a2e,#8a6f3a)' },
  { id: 'slate',    label: '🪨 الأردوازي المعدني',          description: 'رمادي فحمي مع أزرق فولاذي — هندسي رسمي.',                       swatch: 'linear-gradient(135deg,#1f2937,#475569)' },
  { id: 'bronze',   label: '🏺 البرونزي العتيق',            description: 'برونز عتيق مع عاجي وبني جلدي — طابع تاريخي.',                   swatch: 'linear-gradient(135deg,#6b4423,#c9a172)' },
  { id: 'pearl',    label: '🤍 اللؤلؤي الرسمي',             description: 'لؤلؤي فاتح مع كحلي ولمسات ذهب وردي — أنيق ومريح.',              swatch: 'linear-gradient(135deg,#f3f0eb,#1e3a5f)' },
  { id: 'emerald',  label: '💚 الزمرّدي الكلاسيكي',         description: 'زمرّدي عميق مع ذهبي — هيبة وفخامة.',                            swatch: 'linear-gradient(135deg,#064e3b,#c9a84c)' },
  { id: 'onyx',     label: '⚫ الأونيكس البلاتيني',          description: 'أسود أونيكس مع بلاتيني وأزرق ياقوتي — راقٍ ومميز.',             swatch: 'linear-gradient(135deg,#0d0d0d,#d4d4d8)' },
  { id: 'glass',    label: '🪟 الكريستال الزجاجي',           description: 'زجاجي شفاف بضباب أزرق رمادي — حداثة هادئة.',                    swatch: 'linear-gradient(135deg,#dbeafe,#cbd5e1)' },
];

const KEY = 'ui-theme';
const EVENT = 'ui-theme-changed';

const ALL_IDS: UiTheme[] = UI_THEMES.map(t => t.id);
const LEGACY_MAP: Record<string, UiTheme> = {
  vivid3d: 'royal', executive: 'royal', neumorphic: 'pearl', editorial: 'onyx',
  aurora: 'emerald', nebula: 'sapphire', quantum: 'slate', holographic: 'glass',
  obsidian: 'onyx', crimson: 'burgundy', platinum: 'slate',
};

export const getUiTheme = (): UiTheme => {
  if (typeof window === 'undefined') return 'royal';
  const v = window.localStorage.getItem(KEY);
  if (!v) return 'royal';
  if (ALL_IDS.includes(v as UiTheme)) return v as UiTheme;
  return LEGACY_MAP[v] || 'royal';
};

export const applyUiTheme = (t: UiTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-ui-theme', t);
};

export const setUiTheme = (t: UiTheme) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, t);
  applyUiTheme(t);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
};

export const useUiTheme = (): [UiTheme, (t: UiTheme) => void] => {
  const [theme, setTheme] = useState<UiTheme>(getUiTheme);
  useEffect(() => {
    const sync = () => setTheme(getUiTheme());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [theme, setUiTheme];
};
