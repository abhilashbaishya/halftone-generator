export const MOTION_FPS = { min: 4, max: 12, default: 8 };
export const MOTION_FRAME_COUNT = 24;
// How many screen cells the drift travels before turning back. Its fastest
// step is travel * pi / frames ≈ .39 cell; nearer half a cell the dots strobe.
export const MOTION_TRAVEL = 3;

// Out and back. A photo is not periodic, so a one-way crawl would not meet
// itself; returning to phase 0 makes the first frame follow the last. A cosine
// eases the screen into each turn instead of reversing it abruptly.
export function motionPhase(frame) {
  return MOTION_TRAVEL * (1 - Math.cos(2 * Math.PI * frame / MOTION_FRAME_COUNT)) / 2;
}

export function clampMotionFps(value) {
  const fps = Math.round(Number(value));
  if (!Number.isFinite(fps)) return MOTION_FPS.default;
  return Math.min(MOTION_FPS.max, Math.max(MOTION_FPS.min, fps));
}
