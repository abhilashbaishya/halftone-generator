import { safePresetName } from './export-filename.js';

export const MAX_PRESET_FILE_BYTES = 64 * 1024;
const FORMAT = 'halftone-studio-preset';
const RANGES = {
  cellSize: [3, 12], contrast: [.5, 2.5], gamma: [.4, 2.4],
  screenAngle: [-75, 75], toneCurve: [.45, 2.2],
  grainStrength: [0, 100], bloomStrength: [0, 100], crtStrength: [0, 100]
};
const FIELDS = ['quality', ...Object.keys(RANGES), 'inkColor', 'paperColor'];
const plain = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function serializePreset(name, settings) {
  // Deliberately exclude thumbnails and source images, including any future
  // fields the editor might add to its saved preset records.
  const recipe = Object.fromEntries(FIELDS.map((key) => [key, settings[key]]));
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
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max) return invalid();
  }
  if (!isColor(s.inkColor) || !isColor(s.paperColor)) return invalid();
  return { name, settings: {
    ...Object.fromEntries(FIELDS.map((key) => [key, s[key]])),
    minDot: 0, microDot: 0, jitter: 0, seed: 0
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
