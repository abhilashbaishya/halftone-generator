import { PHONE_LAYOUT } from './mobile-layout.js';

const THEME_KEY = 'halftone.theme';

export function mountStudioTheme(onChange = () => {}) {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const phone = window.matchMedia(PHONE_LAYOUT);
  const toggle = document.getElementById('themeToggle');
  let desktopChoice;
  try { desktopChoice = localStorage.getItem(THEME_KEY); } catch { /* System default when storage is unavailable. */ }
  if (!['light', 'dark'].includes(desktopChoice)) desktopChoice = null;

  const sync = () => {
    const theme = !phone.matches && desktopChoice ? desktopChoice : system.matches ? 'dark' : 'light';
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light', isLight);
    document.documentElement.style.colorScheme = theme;
    toggle.hidden = phone.matches;
    document.getElementById('iconSun').style.display = isLight ? 'none' : '';
    document.getElementById('iconMoon').style.display = isLight ? '' : 'none';
    toggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#f6f5f1' : '#1e1d1e');
    onChange();
  };
  const choose = () => {
    if (phone.matches) return;
    desktopChoice = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, desktopChoice); } catch { /* Keep the choice for this session. */ }
    sync();
  };
  toggle.addEventListener('click', choose);
  system.addEventListener('change', sync);
  phone.addEventListener('change', sync);
  sync();
  return () => {
    toggle.removeEventListener('click', choose);
    system.removeEventListener('change', sync);
    phone.removeEventListener('change', sync);
  };
}
