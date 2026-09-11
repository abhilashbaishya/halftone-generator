import { TOUCH_LAYOUT } from './mobile-layout.js';

const DESKTOP_DRAG_LAYOUT = '(min-width: 981px) and (hover: hover) and (pointer: fine)';
const VIEWPORT_GUTTER = 16;

function viewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight
  };
}

export function mountDesktopPanelDrag(rail, handle) {
  if (!rail || !handle) return () => {};

  const desktop = window.matchMedia(DESKTOP_DRAG_LAYOUT);
  const touch = window.matchMedia(TOUCH_LAYOUT);
  let enabled = false;
  let drag = null;
  let position = null;
  let pendingPosition = null;
  let moveFrame = 0;
  let layoutFrame = 0;

  const basePosition = () => {
    const style = getComputedStyle(rail);
    return {
      x: Number.parseFloat(style.left) || VIEWPORT_GUTTER,
      y: Number.parseFloat(style.top) || VIEWPORT_GUTTER
    };
  };

  const applyPosition = (requested) => {
    const rect = rail.getBoundingClientRect();
    const viewport = viewportSize();
    const maxX = Math.max(VIEWPORT_GUTTER, viewport.width - rect.width - VIEWPORT_GUTTER);
    const maxY = Math.max(VIEWPORT_GUTTER, viewport.height - rect.height - VIEWPORT_GUTTER);
    const x = Math.min(Math.max(requested.x, VIEWPORT_GUTTER), maxX);
    const y = Math.min(Math.max(requested.y, VIEWPORT_GUTTER), maxY);
    const base = basePosition();
    position = { x, y };
    rail.style.setProperty('--studio-panel-drag-x', `${x - base.x}px`);
    rail.style.setProperty('--studio-panel-drag-y', `${y - base.y}px`);
  };

  const flushMove = () => {
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    if (!pendingPosition) return;
    const next = pendingPosition;
    pendingPosition = null;
    applyPosition(next);
  };

  const finishDrag = (event) => {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
    flushMove();
    const pointerId = drag.pointerId;
    drag = null;
    rail.classList.remove('is-panel-dragging');
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
  };

  const onPointerDown = (event) => {
    if (!enabled || event.button !== 0 || event.isPrimary === false) return;
    const rect = rail.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panelX: rect.left,
      panelY: rect.top
    };
    position = { x: rect.left, y: rect.top };
    rail.classList.add('is-panel-dragging');
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    pendingPosition = {
      x: drag.panelX + event.clientX - drag.pointerX,
      y: drag.panelY + event.clientY - drag.pointerY
    };
    if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
  };

  const onPointerEnd = (event) => finishDrag(event);

  const clampPosition = () => {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    if (!enabled || !position || drag) return;
    applyPosition(position);
  };

  const scheduleClamp = () => {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(clampPosition);
  };

  const clearPlacement = () => {
    rail.classList.remove('is-panel-dragging');
    rail.removeAttribute('data-panel-draggable');
    rail.style.removeProperty('--studio-panel-drag-x');
    rail.style.removeProperty('--studio-panel-drag-y');
    position = null;
  };

  const sync = () => {
    const nextEnabled = desktop.matches && !touch.matches;
    if (nextEnabled === enabled) return;
    enabled = nextEnabled;
    finishDrag();
    cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
    if (!enabled) {
      clearPlacement();
      return;
    }
    rail.dataset.panelDraggable = 'true';
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerEnd);
  handle.addEventListener('pointercancel', onPointerEnd);
  handle.addEventListener('lostpointercapture', onPointerEnd);
  desktop.addEventListener('change', sync);
  touch.addEventListener('change', sync);
  window.addEventListener('resize', scheduleClamp);
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleClamp) : null;
  resizeObserver?.observe(rail);
  sync();

  return () => {
    finishDrag();
    cancelAnimationFrame(moveFrame);
    cancelAnimationFrame(layoutFrame);
    resizeObserver?.disconnect();
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerEnd);
    handle.removeEventListener('pointercancel', onPointerEnd);
    handle.removeEventListener('lostpointercapture', onPointerEnd);
    desktop.removeEventListener('change', sync);
    touch.removeEventListener('change', sync);
    window.removeEventListener('resize', scheduleClamp);
    clearPlacement();
  };
}
