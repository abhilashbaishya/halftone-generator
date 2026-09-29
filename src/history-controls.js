import { createStudioIcon } from './icons.js';

export function mountHistoryControls(studio, toolbar) {
  const group = document.createElement('div');
  group.className = 'studio-history';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Edit history');
  const buttons = ['undo', 'redo'].map((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dialkit-button studio-history-button';
    const label = action === 'undo' ? 'Undo' : 'Redo';
    button.title = label;
    button.setAttribute("aria-label", label);
    button.append(createStudioIcon(`${action}-2`, { width: 16, height: 16 }));
    button.addEventListener('click', () => studio[action]());
    group.append(button);
    return button;
  });
  toolbar.append(group);
  const pointers = new Set();
  const update = () => {
    const history = studio.getState().history;
    buttons[0].disabled = pointers.size > 0 || !history?.canUndo;
    buttons[1].disabled = pointers.size > 0 || !history?.canRedo;
  };
  const finish = () => {
    if (!pointers.size) return;
    pointers.clear();
    studio.endEdit();
  };
  const start = (event) => {
    if (event.button !== 0 || pointers.has(event.pointerId) || event.target.closest('input:not([type="range"])')) return;
    if (!event.target.closest('.halftone-dialkit .dialkit-slider, .halftone-dialkit .dialkit-color-plane, .halftone-dialkit .dialkit-color-track')) return;
    // Commit an edited numeric/color field before starting a different drag.
    if (document.activeElement?.matches('.halftone-dialkit input:not([type="range"])')) document.activeElement.blur();
    if (!pointers.size) studio.beginEdit();
    pointers.add(event.pointerId);
    update();
  };
  const end = (event) => {
    if (!pointers.has(event.pointerId)) return;
    // Let the control commit its final sample before closing this undo step.
    queueMicrotask(() => {
      if (pointers.delete(event.pointerId) && !pointers.size) studio.endEdit();
    });
  };
  const keydown = (event) => {
    if (pointers.size > 0 || event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return;
    // Text fields keep their native editing history.
    if (event.target.closest('input:not([type="range"]), textarea, [contenteditable]:not([contenteditable="false"])')) return;
    if (event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    studio[event.shiftKey ? 'redo' : 'undo']();
  };
  document.addEventListener('pointerdown', start, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, end, true);
  document.addEventListener('keydown', keydown);
  window.addEventListener('blur', finish);
  window.addEventListener(studio.eventName, update);
  studio.setHistoryEnabled?.(true);
  update();
  return () => {
    finish();
    document.removeEventListener('pointerdown', start, true);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.removeEventListener(type, end, true);
    document.removeEventListener('keydown', keydown);
    window.removeEventListener('blur', finish);
    window.removeEventListener(studio.eventName, update);
    studio.setHistoryEnabled?.(false);
    group.remove();
  };
}
