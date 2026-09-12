// Keep the editable range restrained: even at 50%, jitter moves each dot by
// at most one eighth of a cell in each direction.
export const TEXTURE_CONTROLS = [
  { key: 'jitter', label: 'Dot irregularity', min: 0, max: 50 },
  { key: 'microDot', label: 'Micro-dots', min: 0, max: 50 }
];
export const MAX_TEXTURE_SEED = 999999;

export function normalizeTextureValue(key, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const range = TEXTURE_CONTROLS.find((control) => control.key === key);
  if (!range && key !== 'seed') return null;
  return Math.round(Math.min(range?.max ?? MAX_TEXTURE_SEED, Math.max(0, numeric)));
}
