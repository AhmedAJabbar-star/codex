import { useEffect, useState } from 'react';

const KEY = 'ui-3d-enabled';
const EVENT = 'ui-3d-changed';

export const get3DEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === '1';
};

export const apply3DEnabled = (on: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-3d', on ? '1' : '0');
};

export const set3DEnabled = (on: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, on ? '1' : '0');
  apply3DEnabled(on);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
};

export const use3DEnabled = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = useState<boolean>(get3DEnabled);
  useEffect(() => {
    const sync = () => setOn(get3DEnabled());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [on, set3DEnabled];
};
