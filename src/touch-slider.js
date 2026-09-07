import { touchIntent, TOUCH_SLOP } from './touch-intent.js';

// One touch path per slider. Pointer capture keeps a horizontal drag attached
// to the control; pan-y lets Safari cancel it when the user scrolls vertically.
export function mountTouchSlider(track, { min, max, step, onChange, onInteraction = () => {} }) {
  let gesture;
  let frame = null;
  let pendingX;
  const flush = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (gesture && pendingX !== undefined) apply(pendingX);
    pendingX = undefined;
  };
  const listeners = [];
  const listen = (type, fn) => {
    track.addEventListener(type, fn, { capture: true, passive: true });
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
    // Commit the latest sample before asking for the final-quality render.
    flush();
    const { id, horizontal } = gesture;
    gesture = null;
    delete track.dataset.touchDragging;
    if (track.hasPointerCapture(id)) track.releasePointerCapture(id);
    if (horizontal) onInteraction(false);
  };
  listen('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || event.button !== 0 || event.target.closest('input')) return;
    event.stopImmediatePropagation();
    if (gesture) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
      rect: track.getBoundingClientRect(), horizontal: false, moved: false };
    track.setPointerCapture(event.pointerId);
  });
  listen('pointermove', (event) => {
    if (gesture?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= TOUCH_SLOP) gesture.moved = true;
    if (!gesture.horizontal) {
      const intent = touchIntent(gesture, event);
      if (intent === 'vertical') { finish(); return; }
      if (intent !== 'horizontal') return;
      gesture.horizontal = true;
      track.dataset.touchDragging = 'true';
      onInteraction(true);
    }
    pendingX = event.clientX;
    if (frame === null) frame = window.requestAnimationFrame(flush);
  });
  listen('pointerup', (event) => {
    if (gesture?.id !== event.pointerId) return;
    event.stopImmediatePropagation();
    const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    if (gesture.horizontal || (!gesture.moved && distance < TOUCH_SLOP)) pendingX = event.clientX;
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
