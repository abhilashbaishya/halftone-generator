export const MOTION_FPS = { min: 4, max: 12, default: 8 };
export const MOTION_STRENGTH = { min: 0, max: 100, default: 70 };
export const MOTION_FRAME_COUNT = 24;
// Crest spacing as a fraction of the long edge: about two crests on screen.
const WAVELENGTH = .7;

export function motionWave(frame, strength) {
  return { amount: clampMotionStrength(strength) / 100 * 1.5, phase: frame / MOTION_FRAME_COUNT };
}

// A band of swelling dots rolls from top left to bottom right. Scaling the
// tone-curve exponent keeps paper clean and solids solid. Position is measured
// against the long edge, so drafts, previews, and GIF frames show the same wave,
// and one full phase moves exactly one wavelength, so the loop has no seam.
// px and py are measured from the image centre.
export function toneCurveAt(settings, px, py, width, height) {
  const wave = settings.wave;
  if (!wave?.amount) return settings.toneCurve;
  const along = (px + py) / (Math.SQRT2 * Math.max(width, height));
  return settings.toneCurve * 2 ** (-wave.amount * Math.sin(2 * Math.PI * (along / WAVELENGTH - wave.phase)));
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
