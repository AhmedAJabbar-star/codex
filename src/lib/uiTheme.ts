import { useEffect, useState } from 'react';

export type UiTheme = 'vivid3d' | 'executive' | 'glass' | 'neumorphic' | 'editorial';

export const UI_THEMES: { id: UiTheme; label: string; description: string; swatch: string }[] = [
  { id: 'vivid3d', label: '✨ ثلاثي الأبعاد النابض', description: 'بطاقات بارزة بظلال ملونة وحركة ميل عند المرور (الافتراضي).', swatch: 'linear-gradient(135deg,#2563eb,#7c3aed)' },
  { id: 'executive', label: '🏛️ رسمي تنفيذي', description: 'حواف هادئة، خلفية بيضاء، ألوان كحلي وذهبي، طابع أكاديمي.', swatch: 'linear-gradient(135deg,#0f1b3d,#c9a84c)' },
  { id: 'glass', label: '🪟 زجاجي احترافي', description: 'شفافية، blur، حواف لامعة، إحساس Apple-like.', swatch: 'linear-gradient(135deg,#e0f2fe,#a5b4fc)' },
  { id: 'neumorphic', label: '🧊 نيومورفيك ناعم', description: 'ظلال داخلية/خارجية متطابقة، خلفية موحدة، حواف منحنية.', swatch: 'linear-gradient(135deg,#e6e9f0,#cfd4dc)' },
  { id: 'editorial', label: '📰 تحريري مونوكروم', description: 'أبيض وأسود، خطوط Serif للعناوين، شريط جانبي ملون.', swatch: 'linear-gradient(135deg,#0d0d0d,#f5f3ee)' },
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
