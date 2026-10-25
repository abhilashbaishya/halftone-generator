export const MOTION_FPS = { min: 4, max: 12, default: 8 };

// Out and back. A photo is not periodic, so a one-way crawl would not meet
// itself; returning to phase 0 makes the first frame follow the last.
const STEPS = 12;
export const MOTION_FRAME_COUNT = STEPS * 2;

export function motionPhase(frame) {
  const step = ((frame % MOTION_FRAME_COUNT) + MOTION_FRAME_COUNT) % MOTION_FRAME_COUNT;
  return (step <= STEPS ? step : MOTION_FRAME_COUNT - step) / STEPS;
}

export function clampMotionFps(value) {
  const fps = Math.round(Number(value));
  if (!Number.isFinite(fps)) return MOTION_FPS.default;
  return Math.min(MOTION_FPS.max, Math.max(MOTION_FPS.min, fps));
}
