import { useEffect, useState } from 'react';

const KEY = 'ui-dark-mode';
const EVENT = 'ui-dark-mode-changed';

export const getDarkMode = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(KEY) === '1';
};

export const applyDarkMode = (on: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', on);
};

export const setDarkMode = (on: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, on ? '1' : '0');
  applyDarkMode(on);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
};

export const useDarkMode = (): [boolean, (on: boolean) => void] => {
  const [dark, setDark] = useState<boolean>(getDarkMode);
  useEffect(() => {
    const sync = () => setDark(getDarkMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [dark, setDarkMode];
};
