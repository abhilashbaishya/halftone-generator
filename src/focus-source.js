// Browsers promote focus to :focus-visible after any keypress, including
// modifier and screenshot shortcuts that follow a click. Rings are shown only
// once the user actually navigates with the keyboard.
const NAVIGATION_KEYS = new Set(['Tab', 'Enter', 'Escape', ' ', 'ArrowUp', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

export function mountFocusSource(root = document.documentElement) {
  const set = (keyboard) => { root.dataset.keyboardFocus = String(keyboard); };
  const pointer = () => set(false);
  const keydown = (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (NAVIGATION_KEYS.has(event.key) || event.key.length === 1) set(true);
  };
  set(false);
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keydown, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keydown, true);
    delete root.dataset.keyboardFocus;
  };
}
