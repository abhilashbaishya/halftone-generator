export const EDITOR_SESSION_KEY = 'halftone.editor.v1';

// Image bytes stay in the existing IndexedDB store. Only the edit recipe is
// written here, after a pause in editing or when the page is leaving/hidden.
export function mountEditorSession({ capture, restore, browser = window }) {
  try {
    const saved = JSON.parse(browser.localStorage.getItem(EDITOR_SESSION_KEY) || 'null');
    if (saved?.version === 1) restore(saved);
  } catch {
    // A corrupt entry or unavailable storage must never block the editor.
  }

  let pending = null;
  let lastSaved = '';
  let timer;
  const flush = () => {
    browser.clearTimeout(timer);
    if (pending === null) return;
    try {
      browser.localStorage.setItem(EDITOR_SESSION_KEY, pending);
      lastSaved = pending;
      pending = null;
    } catch {
      // Keep editing usable when browser storage is full or disabled.
    }
  };
  const schedule = () => {
    const next = JSON.stringify({ version: 1, ...capture() });
    if (next === (pending ?? lastSaved)) return;
    pending = next;
    browser.clearTimeout(timer);
    timer = browser.setTimeout(flush, 250);
  };
  const onVisibilityChange = () => {
    if (browser.document.visibilityState === 'hidden') flush();
  };
  browser.addEventListener('pagehide', flush);
  browser.document.addEventListener('visibilitychange', onVisibilityChange);
  return {
    schedule,
    flush,
    destroy() {
      flush();
      browser.removeEventListener('pagehide', flush);
      browser.document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}
