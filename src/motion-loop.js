export const MOTION_FPS = { min: 4, max: 12, default: 8 };
export const MOTION_STRENGTH = { min: 0, max: 100, default: 70 };
export const MOTION_FRAME_COUNT = 24;

// Scales the tone-curve exponent, so every dot swells and shrinks while paper
// stays clean and solids stay solid. A sine meets its own start with matching
// velocity, so the breath eases at both extremes and loops without a seam.
export function motionPulse(frame, strength) {
  const amount = clampMotionStrength(strength) / 100;
  return 2 ** (-amount * Math.sin(2 * Math.PI * frame / MOTION_FRAME_COUNT));
}

export function clampMotionFps(value) {
  const fps = Math.round(Number(value));
  if (!Number.isFinite(fps)) return MOTION_FPS.default;
  return Math.min(MOTION_FPS.max, Math.max(MOTION_FPS.min, fps));
}

export function clampMotionStrength(value) {
  const strength = Math.round(Number(value));
  if (!Number.isFinite(strength)) return MOTION_STRENGTH.default;
  return Math.min(MOTION_STRENGTH.max, Math.max(MOTION_STRENGTH.min, strength));
}
