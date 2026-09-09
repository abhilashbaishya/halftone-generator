import { TOUCH_LAYOUT } from './mobile-layout.js';

const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 18;
const MIN_TOUCH_ZOOM = 1;
const MAX_TOUCH_ZOOM = 4;

function midpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  };
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

// Touch devices keep the artwork fitted by default, then allow temporary
// inspection without adding zoom controls to the preview.
export function mountMobilePreview(resetView, {
  target = document.querySelector('.canvas-wrap'),
  getView = () => ({ zoom: 1, panX: 0, panY: 0 }),
  setView = () => {},
  isBlocked = () => false
} = {}) {
  const media = window.matchMedia(TOUCH_LAYOUT);
  const source = document.getElementById('sourceCanvas');
  const pointers = new Map();
  let gesture = null;
  let lastTap = null;
  let pendingView = null;
  let viewFrame = null;

  const flushView = () => {
    if (viewFrame !== null) cancelAnimationFrame(viewFrame);
    viewFrame = null;
    if (!pendingView) return;
    const next = pendingView;
    pendingView = null;
    setView(next);
  };

  const queueView = (next) => {
    pendingView = next;
    if (viewFrame !== null) return;
    viewFrame = requestAnimationFrame(() => {
      viewFrame = null;
      if (!pendingView) return;
      const latest = pendingView;
      pendingView = null;
      setView(latest);
    });
  };

  const beginPan = (pointer) => {
    const view = getView();
    gesture = view.zoom > MIN_TOUCH_ZOOM
      ? { type: 'pan', id: pointer.id, startX: pointer.x, startY: pointer.y, view }
      : null;
  };

  const beginPinch = () => {
    flushView();
    const [first, second] = [...pointers.values()].slice(0, 2);
    const startDistance = distance(first, second);
    if (startDistance <= 0) return;
    gesture = {
      type: 'pinch',
      startDistance,
      startCenter: midpoint(first, second),
      view: getView()
    };
  };

  const clearGesture = () => {
    pointers.clear();
    gesture = null;
    lastTap = null;
    pendingView = null;
    if (viewFrame !== null) cancelAnimationFrame(viewFrame);
    viewFrame = null;
  };

  const sync = () => {
    clearGesture();
    if (media.matches) resetView();
    source?.setAttribute('aria-hidden', 'false');
  };

  const onPointerDown = (event) => {
    if (!media.matches || event.pointerType !== 'touch' || event.button !== 0
      || event.target.closest('.split-handle') || isBlocked()) return;
    const pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    pointers.set(event.pointerId, pointer);
    target.setPointerCapture?.(event.pointerId);
    if (pointers.size === 2) beginPinch();
    else if (pointers.size === 1) beginPan(pointer);
  };

  const onPointerMove = (event) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) > TAP_SLOP) {
      pointer.moved = true;
    }

    if (gesture?.type === 'pinch' && pointers.size >= 2) {
      const [first, second] = [...pointers.values()].slice(0, 2);
      const center = midpoint(first, second);
      const zoom = Math.max(MIN_TOUCH_ZOOM, Math.min(MAX_TOUCH_ZOOM,
        gesture.view.zoom * distance(first, second) / gesture.startDistance));
      const bounds = target.getBoundingClientRect();
      const wrapCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const contentX = (gesture.startCenter.x - wrapCenter.x - gesture.view.panX) / gesture.view.zoom;
      const contentY = (gesture.startCenter.y - wrapCenter.y - gesture.view.panY) / gesture.view.zoom;
      event.preventDefault();
      queueView({
        zoom,
        panX: center.x - wrapCenter.x - contentX * zoom,
        panY: center.y - wrapCenter.y - contentY * zoom
      });
      return;
    }

    if (gesture?.type === 'pan' && gesture.id === event.pointerId) {
      event.preventDefault();
      queueView({
        zoom: gesture.view.zoom,
        panX: gesture.view.panX + event.clientX - gesture.startX,
        panY: gesture.view.panY + event.clientY - gesture.startY
      });
    }
  };

  const finishPointer = (event, cancelled = false) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const wasPinching = gesture?.type === 'pinch';
    pointers.delete(event.pointerId);
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId);
    flushView();

    if (!cancelled && !wasPinching && !pointer.moved) {
      const now = performance.now();
      if (lastTap && now - lastTap.time <= DOUBLE_TAP_MS
        && Math.hypot(pointer.x - lastTap.x, pointer.y - lastTap.y) <= TAP_SLOP * 1.5) {
        lastTap = null;
        resetView();
      } else {
        lastTap = { time: now, x: pointer.x, y: pointer.y };
      }
    } else if (wasPinching || cancelled) {
      lastTap = null;
    }

    const remaining = pointers.values().next().value;
    if (remaining) beginPan(remaining);
    else gesture = null;
  };

  const onPointerUp = (event) => finishPointer(event);
  const onPointerCancel = (event) => finishPointer(event, true);
  const onBlur = () => {
    flushView();
    clearGesture();
  };

  media.addEventListener('change', sync);
  target?.addEventListener('pointerdown', onPointerDown);
  target?.addEventListener('pointermove', onPointerMove);
  target?.addEventListener('pointerup', onPointerUp);
  target?.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', onBlur);
  sync();

  return () => {
    clearGesture();
    media.removeEventListener('change', sync);
    target?.removeEventListener('pointerdown', onPointerDown);
    target?.removeEventListener('pointermove', onPointerMove);
    target?.removeEventListener('pointerup', onPointerUp);
    target?.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
  };
}
