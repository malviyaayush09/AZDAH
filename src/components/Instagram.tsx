'use client';

// One home for the studio's Instagram, so the handle is not spelled out in
// four separate files.
export const INSTAGRAM = 'https://instagram.com/polewithazdah';
export const INSTAGRAM_HANDLE = '@polewithazdah';

// Instagram's glyph, inline: one more network request for a logo is not worth it.
export function IgIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.1" fill={color} stroke="none" />
    </svg>
  );
}

// The handle as it sits in a page header: glyph, handle, then a hairline rule
// separating it from the login and join buttons. It belongs with the actions
// rather than among the text links, where a lone glyph reads as a slip.
//
// Narrow screens drop the handle text and keep the glyph, so the link survives
// everywhere. Pass className="mob-hide" on the home page, whose hamburger menu
// already carries the handle in full.
export function IgChip({ className = '' }: { className?: string }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer"
        className={`ig-chip ${className}`.trim()}
        aria-label={`AZDAH on Instagram, ${INSTAGRAM_HANDLE}`}>
        <IgIcon size={15} />
        <span>{INSTAGRAM_HANDLE}</span>
      </a>
      <span className={`act-rule ${className}`.trim()} aria-hidden="true" />
    </>
  );
}

const CSS = `
  .ig-chip { display: inline-flex; align-items: center; gap: 7px; color: rgba(241,233,218,0.62);
    font-size: 12.5px; letter-spacing: 0.015em; font-weight: 500; white-space: nowrap;
    transition: color 0.25s ease }
  .ig-chip:hover { color: #F83433 }
  .act-rule { display: block; width: 1px; height: 20px; background: rgba(241,233,218,0.14) }
  @media (max-width: 1080px) { .ig-chip span { display: none } .ig-chip { gap: 0 } }
`;
