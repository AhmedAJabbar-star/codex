import { useEffect, useState } from 'react';

export type UiTheme =
  | 'vivid3d'
  | 'glass'
  | 'aurora'
  | 'nebula'
  | 'quantum'
  | 'holographic'
  | 'obsidian'
  | 'emerald'
  | 'crimson'
  | 'platinum';

export const UI_THEMES: { id: UiTheme; label: string; description: string; swatch: string }[] = [
  { id: 'vivid3d',      label: '✨ ثلاثي الأبعاد النابض',  description: 'بطاقات نابضة بميلان ثلاثي الأبعاد وألوان حيوية.',           swatch: 'linear-gradient(135deg,#2563eb,#7c3aed)' },
  { id: 'glass',        label: '🪟 زجاجي احترافي',         description: 'شفافية، blur زجاجي، حواف لامعة بإحساس Apple.',             swatch: 'linear-gradient(135deg,#7dd3fc,#a78bfa)' },
  { id: 'aurora',       label: '🌌 شفق ثلاثي الأبعاد',     description: 'تدرجات شفق قطبية مع توهج عميق بظلال ملونة.',                swatch: 'linear-gradient(135deg,#22d3ee,#10b981,#a78bfa)' },
  { id: 'nebula',       label: '🌠 سديم كوني',             description: 'خلفية فلكية داكنة مع توهج نيون أرجواني/وردي.',              swatch: 'linear-gradient(135deg,#7c3aed,#db2777,#f97316)' },
  { id: 'quantum',      label: '⚡ كمّي تقني',             description: 'شبكة سايبر، أزرق كهربائي وسماوي مع توهج Tron.',             swatch: 'linear-gradient(135deg,#06b6d4,#3b82f6,#8b5cf6)' },
  { id: 'holographic',  label: '💿 هولوجرام كروم',         description: 'انعكاس هولوغرافي قزحي بألوان متغيرة.',                       swatch: 'linear-gradient(135deg,#f0abfc,#67e8f9,#fde68a)' },
  { id: 'obsidian',     label: '🖤 أوبسيديان ذهبي',        description: 'فاخر — أسود لامع مع لمسات ذهبية ثلاثية الأبعاد.',           swatch: 'linear-gradient(135deg,#0a0a0a,#c9a84c)' },
  { id: 'emerald',      label: '💎 زمرّدي تقني',          description: 'زمرّدي/تركواز عميق مع ظلال خضراء وميل ثلاثي.',              swatch: 'linear-gradient(135deg,#059669,#0d9488,#0ea5e9)' },
  { id: 'crimson',      label: '🔥 قرمزي ناري',           description: 'برتقالي/قرمزي تقني بظلال نارية حيوية.',                     swatch: 'linear-gradient(135deg,#f97316,#dc2626,#9333ea)' },
  { id: 'platinum',     label: '🪙 بلاتيني صقيع',          description: 'فضي/أزرق فولاذي راقي مع انعكاسات معدنية.',                 swatch: 'linear-gradient(135deg,#cbd5e1,#64748b,#3b82f6)' },
];

const KEY = 'ui-theme';
const EVENT = 'ui-theme-changed';

export const getUiTheme = (): UiTheme => {
  if (typeof window === 'undefined') return 'vivid3d';
  const v = window.localStorage.getItem(KEY) as UiTheme | null;
  return (v && UI_THEMES.some(t => t.id === v)) ? v : 'vivid3d';
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
