// Frames per second of the 48-frame loop. The preview keeps the same clock
// and skips frames when a render takes longer than one frame.
export const MOTION_FPS = { min: 8, max: 24, default: 16 };
export const MOTION_FRAME_COUNT = 48;
// Cells the screen travels per loop. The screen repeats every cell, so a whole
// number of cells lands on the starting frame: the drift runs one way at a
// steady pace and loops without stopping or turning back.
export const MOTION_TRAVEL = 6;

export function motionPhase(frame) {
  const step = ((frame % MOTION_FRAME_COUNT) + MOTION_FRAME_COUNT) % MOTION_FRAME_COUNT;
  return MOTION_TRAVEL * step / MOTION_FRAME_COUNT;
}

export function clampMotionFps(value) {
  const fps = Math.round(Number(value));
  if (!Number.isFinite(fps)) return MOTION_FPS.default;
  return Math.min(MOTION_FPS.max, Math.max(MOTION_FPS.min, fps));
}
