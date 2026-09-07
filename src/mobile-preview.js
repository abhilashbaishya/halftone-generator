import { PHONE_LAYOUT } from './mobile-layout.js';

// Keep the split preview fitted on mobile, where zoom controls are hidden.
export function mountMobilePreview(resetView) {
  const media = window.matchMedia(PHONE_LAYOUT);
  const source = document.getElementById('sourceCanvas');
  const sync = () => {
    if (media.matches) resetView();
    source.setAttribute('aria-hidden', 'false');
  };
  media.addEventListener('change', sync);
  sync();
  return () => media.removeEventListener('change', sync);
}
