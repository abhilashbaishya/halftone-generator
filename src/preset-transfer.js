import { safePresetName } from './export-filename.js';
import { DOT_SHAPES, SCREEN_DEFAULTS } from './screen-settings.js';
import { MAX_TEXTURE_SEED } from './texture-settings.js';

export const MAX_PRESET_FILE_BYTES = 64 * 1024;
const FORMAT = 'halftone-studio-preset';
const RANGES = {
  cellSize: [3, 12], contrast: [.5, 2.5], gamma: [.4, 2.4],
  screenAngle: [-75, 75], toneCurve: [.45, 2.2],
  grainStrength: [0, 100], bloomStrength: [0, 100], crtStrength: [0, 100]
};
// Files exported before these settings existed omit them, so they default.
const OPTIONAL_RANGES = { jitter: [0, 50], microDot: [0, 50], seed: [0, MAX_TEXTURE_SEED] };
const OPTIONAL_DEFAULTS = { ...SCREEN_DEFAULTS, jitter: 0, microDot: 0, seed: 0 };
const FIELDS = ['quality', ...Object.keys(RANGES), 'inkColor', 'paperColor'];
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function serializePreset(name, settings) {
  // Deliberately exclude thumbnails and source images, including any future
  // fields the editor might add to its saved preset records.
  const recipe = {
    ...Object.fromEntries(FIELDS.map((key) => [key, settings[key]])),
    ...Object.fromEntries(Object.entries(OPTIONAL_DEFAULTS).map(([key, fallback]) => [key, settings[key] ?? fallback]))
  };
  return {
    filename: `Halftone Studio - ${safePresetName(name)}.json`,
    text: JSON.stringify({ format: FORMAT, version: 1, name, settings: recipe }, null, 2) + '\n'
  };
}

export function parsePreset(text, isColor) {
  const invalid = () => { throw new Error('Choose a valid Halftone Studio preset file.'); };
  let file;
  try { file = JSON.parse(text); } catch { return invalid(); }
  if (!plain(file) || file.format !== FORMAT) return invalid();
  if (file.version !== 1) throw new Error('This preset version isn’t supported.');
  if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 40
    || /[\u0000-\u001f\u007f]/.test(file.name)) return invalid();
  const name = file.name.trim().normalize('NFC');
  if (['__proto__', 'prototype', 'constructor'].includes(name.toLowerCase())) return invalid();
  const s = file.settings;
  if (!plain(s) || !['draft', 'high', 'ultra', 'print'].includes(s.quality)) return invalid();
  const inRange = (value, [min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  for (const [key, range] of Object.entries(RANGES)) {
    if (!inRange(s[key], range)) return invalid();
  }
  for (const [key, range] of Object.entries(OPTIONAL_RANGES)) {
    if (s[key] !== undefined && !inRange(s[key], range)) return invalid();
  }
  if (!isColor(s.inkColor) || !isColor(s.paperColor)) return invalid();
  if (s.dotShape !== undefined && !DOT_SHAPES.includes(s.dotShape)) return invalid();
  if (s.invert !== undefined && typeof s.invert !== 'boolean') return invalid();
  return { name, settings: {
    ...Object.fromEntries(FIELDS.map((key) => [key, s[key]])),
    ...Object.fromEntries(Object.entries(OPTIONAL_DEFAULTS).map(([key, fallback]) => [key, s[key] ?? fallback])),
    minDot: 0
  } };
}

export function uniquePresetName(name, existing) {
  const names = new Set(existing.map((value) => value.toLocaleLowerCase()));
  if (!names.has(name.toLocaleLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, 40 - suffix.length).trimEnd() + suffix;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
}
