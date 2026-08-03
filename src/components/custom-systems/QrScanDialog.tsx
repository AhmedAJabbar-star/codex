import { useEffect, useRef, useState } from 'react';

/**
 * 📷 قارئ QR / باركود بالكاميرا — يعتمد على BarcodeDetector المدمج في المتصفح،
 * مع بديل يدوي (لصق النص) للمتصفحات التي لا تدعمه.
 *
 * صيغ النص المدعومة:
 *  - JSON:  {"F":"أحمد","G":"هندسة"}
 *  - أزواج: F=أحمد; G=هندسة
 *  - نص عادي: يُوضع في أول حقل ضمن حقول QR المحددة.
 */
export interface QrScanDialogProps {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}

export default function QrScanDialog({ open, onClose, onResult }: QrScanDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let raf = 0;
    const Detector = (window as any).BarcodeDetector;

    const stop = () => {
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      if (!Detector) { setSupported(false); return; }
      try {
        const detector = new Detector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const val = codes?.[0]?.rawValue;
            if (val) { stop(); onResult(String(val)); return; }
          } catch { /* ignore frame errors */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(e?.message || 'تعذر الوصول إلى الكاميرا');
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, onResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" dir="rtl"
         style={{ background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden bg-white shadow-2xl border-2" style={{ borderColor: '#0891b240' }}>
        <header className="px-4 py-3 flex items-center justify-between text-white"
                style={{ background: 'linear-gradient(135deg,#0891b2,#0e7490)' }}>
          <h3 className="text-sm font-black">📷 المسح بالكاميرا (QR / باركود)</h3>
          <button className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-lg" onClick={onClose} aria-label="إغلاق">✕</button>
        </header>
        <div className="p-4 space-y-3">
          {supported && !error && (
            <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video object-cover" muted playsInline />
          )}
          {(!supported || error) && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              {error || 'متصفحك لا يدعم قراءة الرموز بالكاميرا — يمكنك لصق محتوى الرمز يدوياً أدناه.'}
            </p>
          )}
          <div>
            <label className="block text-xs font-black mb-1.5 text-slate-700">إدخال يدوي لمحتوى الرمز</label>
            <input
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 text-sm focus:outline-none focus:border-slate-400"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder='مثال: F=أحمد علي; G=هندسة مدنية'
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="px-4 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold hover:bg-slate-50" onClick={onClose}>إلغاء</button>
            <button
              className="px-5 py-2 rounded-lg text-sm font-black text-white disabled:opacity-50"
              style={{ background: '#0891b2' }}
              disabled={!manual.trim()}
              onClick={() => onResult(manual.trim())}
            >✅ تطبيق</button>
          </div>
        </div>
      </div>
    </div>
  );
}
