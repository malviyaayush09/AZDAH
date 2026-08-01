'use client';

import { useEffect, useRef } from 'react';

export type ToastMsg = { text: string; ok: boolean } | null;

/**
 * Feedback used to render as an inline banner at the top of the page, so
 * confirming an action further down the page (booking a class, cancelling,
 * saving a template) showed a message the user never saw without scrolling
 * back up. This pins it to the viewport instead and dismisses itself.
 */
export function Toast({ msg, onClose }: { msg: ToastMsg; onClose: () => void }) {
  // Held in a ref so a new inline arrow function from the parent doesn't
  // restart the dismiss timer on every re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const key = msg ? `${msg.ok}|${msg.text}` : null;

  useEffect(() => {
    if (!key) return;
    // Errors linger — they usually need reading and acting on.
    const ms = key.startsWith('true|') ? 4000 : 8000;
    const t = setTimeout(() => onCloseRef.current(), ms);
    return () => clearTimeout(t);
  }, [key]);

  if (!msg) return null;

  const accent = msg.ok ? '#4ade80' : '#f87171';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 200,
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        maxWidth: 'min(440px, calc(100vw - 32px))',
        width: 'max-content',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '13px 14px 13px 16px',
        background: '#191512',
        border: '1px solid #2A2118',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        boxShadow: '0 12px 32px -12px rgba(0,0,0,.75)',
        animation: 'toast-in .22s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          background: `${accent}22`, color: accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, lineHeight: 1,
        }}
      >
        {msg.ok ? '✓' : '!'}
      </span>

      <span style={{ fontSize: 13, lineHeight: 1.45, color: '#F5F0E8' }}>{msg.text}</span>

      <button
        onClick={() => onCloseRef.current()}
        aria-label="Dismiss"
        style={{
          background: 'none', border: 'none', color: '#8A7A6A', cursor: 'pointer',
          fontSize: 17, lineHeight: 1, padding: '0 2px', marginLeft: 4, flexShrink: 0,
        }}
      >
        ×
      </button>

      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="status"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
