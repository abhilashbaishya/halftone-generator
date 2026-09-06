// One touch path per slider. Pointer capture keeps a horizontal drag attached
// to the control; pan-y lets Safari cancel it when the user scrolls vertically.
export function mountTouchSlider(track, { min, max, step, onChange, onInteraction = () => {} }) {
  let gesture;
  const listeners = [];
  const listen = (type, fn) => {
    track.addEventListener(type, fn, true);
    listeners.push([type, fn]);
  };
  const apply = (x) => {
    const fraction = Math.max(0, Math.min(1, (x - gesture.rect.left) / gesture.rect.width));
    const raw = min + fraction * (max - min);
    const value = Number(Math.max(min, Math.min(max, min + Math.round((raw - min) / step) * step)).toFixed(6));
    if (gesture.value === value) return;
    gesture.value = value;
    onChange(value);
  };
  const finish = () => {
    if (!gesture) return;
    const { id, horizontal } = gesture;
    gesture = null;
    delete track.dataset.touchDragging;
    if (track.hasPointerCapture(id)) track.releasePointerCapture(id);
    if (horizontal) onInteraction(false);
  };
  listen('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || event.target.closest('input')) return;
    event.stopImmediatePropagation();
    if (gesture) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
      rect: track.getBoundingClientRect(), horizontal: false };
    track.setPointerCapture(event.pointerId);
  });
  listen('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
    if (!gesture.horizontal) {
      if (dy >= 8 && dy > dx * 1.5) { finish(); return; }
      if (dx < 4 || dx < dy * 1.2) return;
      gesture.horizontal = true;
      track.dataset.touchDragging = 'true';
      onInteraction(true);
    }
    event.preventDefault();
    apply(event.clientX);
  });
  listen('pointerup', (event) => {
    if (gesture?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (gesture.horizontal || distance < 8) apply(event.clientX);
    finish();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(type, (event) => {
    if (gesture?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    finish();
  });
  window.addEventListener("blur", finish);
  return () => {
    window.removeEventListener("blur", finish);
    finish();
    listeners.forEach(([type, fn]) => track.removeEventListener(type, fn, true));
  };
}
