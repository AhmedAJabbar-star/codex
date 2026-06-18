import { useEffect, useState } from 'react';

export type UiTheme =
  | 'original'   // Original system look — LOCKED to base styles, matches civilacademi.com
  | 'vivid3d'    // Vibrant 3D with depth and orbs
  | 'royal'      // Royal Navy + Gold
  | 'sapphire'   // Deep Sapphire + Silver
  | 'burgundy'   // Burgundy + Cream
  | 'forest'     // Forest Green + Bronze
  | 'slate'      // Charcoal Slate + Steel
  | 'bronze'     // Antique Bronze + Ivory
  | 'pearl'      // Pearl + Navy
  | 'emerald'    // Emerald + Gold
  | 'onyx'       // Onyx + Platinum
  | 'crimson'    // Academic Crimson + Gold
  | 'oxford'     // Oxford Blue + Pale Gold
  | 'ivory'      // Ivory + Espresso + Brass
  | 'cobalt'     // Cobalt + Silver
  // ===== YOUTH / MODERN (5 extra) =====
  | 'glasspro'   // Premium Frosted Glass 3D
  | 'neon'       // Cyber Neon
  | 'gradient'   // Youth Gradient
  | 'holo'       // Holographic Iridescent
  | 'mesh';      // Vibrant Color Mesh

export const UI_THEMES: { id: UiTheme; label: string; description: string; swatch: string }[] = [
  { id: 'original', label: '🏛️ الأصلي — تصميم النظام',     description: 'الواجهة الأصلية للنظام كما هي على civilacademi.com — مقفلة ولن تتغير.', swatch: 'linear-gradient(135deg,#e0f2fe,#fae8ff)' },
  { id: 'vivid3d',  label: '✨ ثلاثي الأبعاد النابض',        description: 'بطاقات ثلاثية الأبعاد بمنظور حيوي وألوان نابضة وهالات ضوئية.',              swatch: 'linear-gradient(135deg,#6366f1,#ec4899)' },
  { id: 'royal',    label: '👑 الملكي — كحلي وذهبي',       description: 'كحلي عميق مع ذهب دافئ وخلفية كريمية — الطابع الجامعي الرسمي.', swatch: 'linear-gradient(135deg,#0b2545,#c9a24a)' },
  { id: 'sapphire', label: '💠 الياقوت الأزرق',             description: 'أزرق ياقوتي عميق مع لمسات فضية — أكاديمي راقٍ.',                swatch: 'linear-gradient(135deg,#0a1f44,#94a3b8)' },
  { id: 'burgundy', label: '🍷 العنابي الكلاسيكي',          description: 'عنابي أكاديمي مع عاجي دافئ ولمسات ذهبية.',                       swatch: 'linear-gradient(135deg,#6e1423,#b8860b)' },
  { id: 'forest',   label: '🌲 الأخضر الحرجي',              description: 'أخضر حرجي عميق مع برونزي عتيق — هيبة طبيعية.',                  swatch: 'linear-gradient(135deg,#1f3a2e,#8a6f3a)' },
  { id: 'slate',    label: '🪨 الأردوازي المعدني',          description: 'رمادي فحمي مع أزرق فولاذي — هندسي رسمي.',                       swatch: 'linear-gradient(135deg,#1f2937,#475569)' },
  { id: 'bronze',   label: '🏺 البرونزي العتيق',            description: 'برونز عتيق مع عاجي وبني جلدي — طابع تاريخي.',                   swatch: 'linear-gradient(135deg,#6b4423,#c9a172)' },
  { id: 'pearl',    label: '🤍 اللؤلؤي الرسمي',             description: 'لؤلؤي فاتح مع كحلي ولمسات ذهب وردي — أنيق ومريح.',              swatch: 'linear-gradient(135deg,#f3f0eb,#1e3a5f)' },
  { id: 'emerald',  label: '💚 الزمرّدي الكلاسيكي',         description: 'زمرّدي عميق مع ذهبي — هيبة وفخامة.',                            swatch: 'linear-gradient(135deg,#064e3b,#c9a84c)' },
  { id: 'onyx',     label: '⚫ الأونيكس البلاتيني',          description: 'أسود أونيكس مع بلاتيني وأزرق ياقوتي — راقٍ ومميز.',             swatch: 'linear-gradient(135deg,#0d0d0d,#d4d4d8)' },
  { id: 'crimson',  label: '🎓 القرمزي الأكاديمي',            description: 'قرمزي جامعي كلاسيكي مع ذهبي فاخر — هيبة أكاديمية عالمية.',      swatch: 'linear-gradient(135deg,#8b1a2e,#c9a84c)' },
  { id: 'oxford',   label: '📘 الأزرق الأكسفوردي',           description: 'أزرق أكسفوردي عميق مع ذهبي فاتح — رسمية عالمية متجذرة.',        swatch: 'linear-gradient(135deg,#0a1e3d,#d4af37)' },
  { id: 'ivory',    label: '🦢 العاجي الفاخر',               description: 'عاجي ناصع مع بني غامق ونحاسي — أناقة كلاسيكية جامعية.',          swatch: 'linear-gradient(135deg,#fdfbf7,#3c2415)' },
  { id: 'cobalt',   label: '🔷 الكوبالت الأزرق',              description: 'أزرق كوبالتي حديث مع فضي لامع — عصري ومهني أكاديمياً.',          swatch: 'linear-gradient(135deg,#0047ab,#c0c0c0)' },
  // ===== YOUTH / MODERN (5 extra) =====
  { id: 'glasspro', label: '💎 الزجاجي الاحترافي 3D',          description: 'زجاج مصنفر فاخر ثلاثي الأبعاد، بطاقات متعددة الألوان مع وهج بنفسجي/أزرق.', swatch: 'linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6)' },
  { id: 'neon',     label: '🌃 نيون سايبر',                    description: 'خلفية داكنة مع حواف نيون متوهجة بألوان مختلفة لكل بطاقة — طابع شبابي تقني.', swatch: 'linear-gradient(135deg,#0ff,#f0f,#ff0)' },
  { id: 'gradient', label: '🌈 التدرج الشبابي',                 description: 'تدرجات نابضة (برتقالي/وردي/أزرق/أخضر) متفرّدة لكل بطاقة — حيوي وعصري.',  swatch: 'linear-gradient(135deg,#fb923c,#ec4899,#8b5cf6)' },
  { id: 'holo',     label: '🦋 الهولوجرام البلوري',              description: 'انعكاسات قزحية متلألئة — تأثير الهولوجرام/الصدف بتدرّجات مختلفة لكل بطاقة.',  swatch: 'linear-gradient(135deg,#a5f3fc,#c4b5fd,#fbcfe8,#fde68a)' },
  { id: 'mesh',     label: '🎨 شبكة الألوان النابضة',           description: 'شبكة Mesh ملونة بألوان مختلفة لكل بطاقة — تصميم Y2K حديث وجريء.',          swatch: 'linear-gradient(135deg,#22d3ee,#a855f7,#f43f5e,#facc15)' },
];

const KEY = 'ui-theme';
const EVENT = 'ui-theme-changed';

const ALL_IDS: UiTheme[] = UI_THEMES.map(t => t.id);
const LEGACY_MAP: Record<string, UiTheme> = {
  executive: 'royal', neumorphic: 'pearl', editorial: 'onyx',
  aurora: 'emerald', nebula: 'sapphire', quantum: 'slate',
  holographic: 'holo', glass: 'glasspro', liquid: 'glasspro',
  obsidian: 'onyx', crimson: 'crimson', platinum: 'slate',
};

export const getUiTheme = (): UiTheme => {
  if (typeof window === 'undefined') return 'original';
  const v = window.localStorage.getItem(KEY);
  if (!v) return 'original';
  if (ALL_IDS.includes(v as UiTheme)) return v as UiTheme;
  return LEGACY_MAP[v] || 'original';
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
