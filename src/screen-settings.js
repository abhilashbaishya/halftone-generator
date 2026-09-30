export const DOT_SHAPES = ['round', 'square', 'diamond', 'line'];

// Presets saved before these settings existed render as round, un-inverted dots.
export const SCREEN_DEFAULTS = { dotShape: 'round', invert: false };

export function normalizeScreenValue(key, value) {
  if (key === 'dotShape') return DOT_SHAPES.includes(value) ? value : SCREEN_DEFAULTS.dotShape;
  if (key === 'invert') return value === true || value === 'true';
  return null;
}
