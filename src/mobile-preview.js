import { PHONE_LAYOUT } from './mobile-layout.js';

// Mobile always shows the fitted halftone. Desktop retains its split preview.
export function mountMobilePreview(resetView) {
  const media = window.matchMedia(PHONE_LAYOUT);
  const source = document.getElementById('sourceCanvas');
  const sync = () => {
    if (media.matches) resetView();
    source.setAttribute('aria-hidden', String(media.matches));
  };
  media.addEventListener('change', sync);
  sync();
  return () => media.removeEventListener('change', sync);
}
