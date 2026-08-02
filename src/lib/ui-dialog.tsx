import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * نوافذ حوار احترافية بديلة عن confirm/prompt/alert الأصلية للمتصفح.
 * تُستدعى بشكل أمري (imperative) وتُعيد Promise.
 */

export type DialogTone = 'default' | 'danger' | 'success';

interface BaseOptions {
  title: string;
  message?: string;
  icon?: string;
  tone?: DialogTone;
  confirmText?: string;
  cancelText?: string;
}

interface PromptOptions extends BaseOptions {
  placeholder?: string;
  password?: boolean;
  defaultValue?: string;
}

type Mode = 'confirm' | 'prompt' | 'alert';

const TONES: Record<DialogTone, { accent: string; ring: string; btn: string }> = {
  default: { accent: 'hsl(215 72% 32%)', ring: 'hsl(215 72% 32% / 0.18)', btn: 'hsl(215 72% 32%)' },
  danger: { accent: 'hsl(0 66% 44%)', ring: 'hsl(0 66% 44% / 0.18)', btn: 'hsl(0 66% 44%)' },
  success: { accent: 'hsl(152 55% 30%)', ring: 'hsl(152 55% 30% / 0.18)', btn: 'hsl(152 55% 30%)' },
};

function DialogShell({
  mode, options, resolve,
}: { mode: Mode; options: PromptOptions; resolve: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(options.defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const tone = TONES[options.tone || 'default'];

  useEffect(() => {
    const t = window.setTimeout(() => setOpen(true), 10);
    const f = window.setTimeout(() => inputRef.current?.focus(), 90);
    return () => { window.clearTimeout(t); window.clearTimeout(f); };
  }, []);

  const finish = (v: unknown) => {
    setOpen(false);
    window.setTimeout(() => resolve(v), 140);
  };

  const onCancel = () => finish(mode === 'prompt' ? null : false);
  const onOk = () => {
    if (mode === 'prompt') { finish(value); return; }
    finish(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
      if (e.key === 'Enter' && mode !== 'alert') { e.preventDefault(); e.stopPropagation(); onOk(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={options.title}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(9, 18, 33, 0.55)',
        backdropFilter: 'blur(6px)',
        opacity: open ? 1 : 0,
        transition: 'opacity .16s ease',
        fontFamily: 'inherit',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          background: '#ffffff',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(6, 18, 38, .35), 0 2px 0 rgba(255,255,255,.6) inset',
          border: '1px solid rgba(15, 33, 60, .10)',
          transform: open ? 'translateY(0) scale(1)' : 'translateY(12px) scale(.97)',
          transition: 'transform .18s cubic-bezier(.2,.8,.3,1)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ height: 5, background: tone.accent }} />
        <div style={{ padding: '20px 22px 4px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            style={{
              width: 46, height: 46, flex: '0 0 auto', borderRadius: 14,
              display: 'grid', placeItems: 'center', fontSize: 22,
              background: tone.ring, color: tone.accent,
            }}
          >{options.icon || (options.tone === 'danger' ? '⚠️' : options.tone === 'success' ? '✅' : 'ℹ️')}</div>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#0e1b2e', lineHeight: 1.5 }}>{options.title}</h2>
            {options.message && (
              <p style={{ margin: '6px 0 0', fontSize: 13.5, fontWeight: 600, color: '#4a5a70', lineHeight: 1.9, whiteSpace: 'pre-line' }}>
                {options.message}
              </p>
            )}
          </div>
        </div>

        {mode === 'prompt' && (
          <div style={{ padding: '14px 22px 0' }}>
            <input
              ref={inputRef}
              type={options.password ? 'password' : 'text'}
              value={value}
              placeholder={options.placeholder || ''}
              onChange={(e) => setValue(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: '2px solid #dfe6f0', outline: 'none', fontSize: 15, fontWeight: 700,
                color: '#0e1b2e', background: '#f8fafc', textAlign: 'center', letterSpacing: options.password ? 3 : 0,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = tone.accent; e.currentTarget.style.background = '#fff'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#dfe6f0'; e.currentTarget.style.background = '#f8fafc'; }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start', padding: '18px 22px 20px' }}>
          <button
            type="button"
            onClick={onOk}
            style={{
              padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: tone.btn, color: '#fff', fontWeight: 900, fontSize: 14,
              boxShadow: `0 8px 20px ${tone.ring}`,
            }}
          >{options.confirmText || (mode === 'alert' ? 'حسناً' : 'تأكيد')}</button>
          {mode !== 'alert' && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
                background: '#eef2f7', color: '#31425c', fontWeight: 800, fontSize: 14,
                border: '1px solid #dbe3ee',
              }}
            >{options.cancelText || 'إلغاء'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function show(mode: Mode, options: PromptOptions): Promise<unknown> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: unknown) => {
      resolve(v);
      window.setTimeout(() => { root.unmount(); host.remove(); }, 0);
    };
    root.render(<DialogShell mode={mode} options={options} resolve={done} />);
  });
}

/** نافذة تأكيد احترافية — تُعيد true عند الموافقة. */
export const uiConfirm = (options: BaseOptions): Promise<boolean> =>
  show('confirm', options).then((v) => v === true);

/** نافذة إدخال احترافية — تُعيد النص أو null عند الإلغاء. */
export const uiPrompt = (options: PromptOptions): Promise<string | null> =>
  show('prompt', options).then((v) => (typeof v === 'string' ? v : null));

/** نافذة إعلام احترافية. */
export const uiAlert = (options: BaseOptions): Promise<void> =>
  show('alert', options).then(() => undefined);
