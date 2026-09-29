import { createStudioIcon } from './icons.js';

// Keep the choice list separate from file actions for assistive technology.
export function mountPresetMenuActions(popup, trigger, getProps) {
  const list = document.createElement('div');
  list.className = 'studio-preset-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Presets');
  list.append(...popup.querySelectorAll('.dialkit-select-option'));
  const footer = document.createElement('div');
  footer.className = 'studio-preset-menu-actions';
  const row = document.createElement('div');
  row.className = 'studio-preset-file-actions';
  const hint = document.createElement('p');
  hint.className = 'studio-preset-transfer-hint';
  const buttons = [['onExport', 'Export preset', 'download'], ['onImport', 'Import preset…', 'upload']].map(([action, label, icon]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'studio-preset-file-action';
    const text = document.createElement('span');
    text.textContent = label;
    button.append(createStudioIcon(icon, { width: 16, height: 16 }), text);
    button.addEventListener('click', (event) => {
      if (event.detail === 0) trigger.focus({ preventScroll: true });
      trigger.click();
      getProps()[action]?.(); // Keep the native file picker within this tap.
    });
    row.append(button);
    return button;
  });
  footer.append(row, hint);
  popup.append(list, footer);
  const semantics = () => {
    if (popup.getAttribute('role') !== 'dialog') popup.setAttribute('role', 'dialog');
    trigger.setAttribute('aria-haspopup', 'dialog');
  };
  // DialKit attaches its keyboard behavior on the next frame and assigns a
  // listbox role. The inner list owns that role now; the outer popup also has actions.
  const observer = new MutationObserver(semantics);
  observer.observe(popup, { attributes: true, attributeFilter: ['role'] });
  semantics();
  const keydown = (event) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return;
    const options = [...list.querySelectorAll('.dialkit-select-option')];
    const actions = buttons.filter((button) => !button.disabled);
    const target = document.activeElement;
    let next;
    if (options.includes(target)) {
      if ((event.key === 'Tab' && !event.shiftKey)
        || (event.key === 'ArrowDown' && target === options.at(-1))) next = actions[0];
    } else if (actions.includes(target)) {
      const index = actions.indexOf(target);
      if (event.key === 'Tab') next = event.shiftKey ? actions[index - 1] ?? options.at(-1) : actions[index + 1];
      if (['ArrowUp', 'ArrowLeft'].includes(event.key)) next = actions[index - 1] ?? options.at(-1);
      if (['ArrowDown', 'ArrowRight'].includes(event.key)) next = actions[index + 1] ?? actions[index];
    }
    if (next) {
      event.preventDefault();
      event.stopImmediatePropagation();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest' });
    }
  };
  popup.addEventListener('keydown', keydown, true);
  const update = () => {
    const props = getProps();
    buttons[0].disabled = !props.canExport;
    buttons[1].disabled = Boolean(props.importing);
    hint.hidden = Boolean(props.canExport);
    hint.textContent = props.exportHint || 'Save a custom preset to export';
  };
  update();
  return {
    update,
    destroy() { observer.disconnect(); popup.removeEventListener('keydown', keydown, true); }
  };
}
