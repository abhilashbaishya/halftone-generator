import { TOUCH_LAYOUT } from './mobile-layout.js';

const THEME_KEY = 'halftone.theme';

export function mountStudioTheme(onChange = () => {}) {
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const touch = window.matchMedia(TOUCH_LAYOUT);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.getElementById('themeToggle');
  const root = document.documentElement;
  let desktopChoice;
  let transitionId = 0;
  let activeTransition = null;
  try { desktopChoice = localStorage.getItem(THEME_KEY); } catch { /* System default when storage is unavailable. */ }
  if (!['light', 'dark'].includes(desktopChoice)) desktopChoice = null;

  const applyTheme = () => {
    const theme = !touch.matches && desktopChoice ? desktopChoice : system.matches ? 'dark' : 'light';
    const isLight = theme === 'light';
    root.classList.toggle('light', isLight);
    root.style.colorScheme = theme;
    toggle.hidden = touch.matches;
    document.getElementById('iconSun').style.display = isLight ? 'none' : '';
    document.getElementById('iconMoon').style.display = isLight ? '' : 'none';
    toggle.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#f6f5f1' : '#1e1d1e');
    onChange();
  };

  const applyThemeAtomically = () => {
    root.classList.add('theme-switching');
    applyTheme();
    void root.offsetWidth;
    root.classList.remove('theme-switching');
  };

  const sync = (animate = false) => {
    const nextTheme = !touch.matches && desktopChoice ? desktopChoice : system.matches ? 'dark' : 'light';
    const themeChanges = root.classList.contains('light') !== (nextTheme === 'light');
    if (!animate || !themeChanges || reducedMotion.matches || typeof document.startViewTransition !== 'function') {
      if (animate && themeChanges) applyThemeAtomically();
      else applyTheme();
      return;
    }

    const id = ++transitionId;
    activeTransition?.skipTransition?.();
    try {
      const transition = document.startViewTransition(() => {
        root.classList.add('theme-switching');
        applyTheme();
      });
      activeTransition = transition;
      const release = () => {
        if (id === transitionId) root.classList.remove('theme-switching');
      };
      transition.ready.then(release, release);
      transition.finished.then(() => {
        if (activeTransition === transition) activeTransition = null;
        release();
      }, release);
    } catch {
      applyThemeAtomically();
    }
  };

  const choose = () => {
    if (touch.matches) return;
    desktopChoice = root.classList.contains('light') ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, desktopChoice); } catch { /* Keep the choice for this session. */ }
    sync(true);
  };
  const syncAnimated = () => sync(true);
  toggle.addEventListener('click', choose);
  system.addEventListener('change', syncAnimated);
  touch.addEventListener('change', syncAnimated);
  sync();
  return () => {
    transitionId += 1;
    activeTransition?.skipTransition?.();
    root.classList.remove('theme-switching');
    toggle.removeEventListener('click', choose);
    system.removeEventListener('change', syncAnimated);
    touch.removeEventListener('change', syncAnimated);
  };
}
