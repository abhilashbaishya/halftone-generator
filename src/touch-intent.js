// Give scrolling priority until a clearly horizontal drag starts. Once locked,
// callers keep that direction for the rest of the gesture.
export const TOUCH_SLOP = 6;

export function touchIntent(start, event) {
  const dx = Math.abs(event.clientX - start.x);
  const dy = Math.abs(event.clientY - start.y);
  if (Math.max(dx, dy) < TOUCH_SLOP) return 'pending';
  if (dy >= dx) return 'vertical';
  return dx >= dy * 1.2 ? 'horizontal' : 'pending';
}
