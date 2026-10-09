export const DOT_SHAPES = ['round', 'square', 'diamond', 'line'];

// Presets saved before these settings existed render as round, un-inverted dots.
export const SCREEN_STYLES = ['classic', 'paper'];
export const SCREEN_DEFAULTS = { dotShape: 'round', invert: false, screenStyle: 'classic' };

export function normalizeScreenValue(key, value) {
  if (key === 'dotShape') return ['square', 'diamond'].includes(value) ? 'round' : DOT_SHAPES.includes(value) ? value : SCREEN_DEFAULTS.dotShape;
  if (key === 'screenStyle') return SCREEN_STYLES.includes(value) ? value : SCREEN_DEFAULTS.screenStyle;
  if (key === 'invert') return value === true || value === 'true';
  return null;
}

// Preserve recipes saved during the first local Paper trial.
export function screenValue(preset, key) {
  // Retired shapes become Dots, including restored sessions and imported recipes.
  if (['square', 'diamond'].includes(preset.dotShape)) {
    if (key === 'dotShape') return 'round';
    if (key === 'screenStyle') return 'classic';
  }
  if (preset.dotShape === 'gooey') {
    if (key === 'dotShape') return 'round';
    if (key === 'screenStyle') return 'paper';
  }
  return normalizeScreenValue(key, preset[key]);
}

export function patternSettings(pattern) {
  if (pattern === 'organic') return { dotShape: 'round', screenStyle: 'paper' };
  if (['round', 'line'].includes(pattern)) return { dotShape: pattern, screenStyle: 'classic' };
  return null;
}

export function selectedPattern(settings) {
  const shape = screenValue(settings, 'dotShape');
  return shape === 'round' && screenValue(settings, 'screenStyle') === 'paper' ? 'organic' : shape;
}
