import { useEffect, useState } from 'react';
import { getBranding, SYSTEM_ACCESS_RULES_UPDATED_EVENT, type Branding } from '@/lib/systemAccess';

/** هوية الواجهة (الشعار/الاسم/البانر) مع تحديث فوري بعد الحفظ من لوحة التحكم. */
export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(() => getBranding());
  useEffect(() => {
    const refresh = () => setBranding(getBranding());
    window.addEventListener('storage', refresh);
    window.addEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(SYSTEM_ACCESS_RULES_UPDATED_EVENT, refresh);
    };
  }, []);
  return branding;
}
