import { renderHalftoneSync } from './halftone-renderer.js';
import { BloomPass } from '../bloom-pass.js';

export const PRESET_THUMBNAIL_VERSION = 3;
const cache = new WeakMap();

// Use the same close-up tonal ramp for built-in, saved, and imported presets.
// A preset describes a treatment, so its sample should not depend on a photo
// crop, the current viewport, or whether an asynchronous preview has finished.
export function renderPresetPreview(preset) {
  const size = 112;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const ramp = ctx.createLinearGradient(0, size, size, 0);
  ramp.addColorStop(0, '#171717');
  ramp.addColorStop(1, '#ededed');
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  renderHalftoneSync(ctx, pixels, size, size, {
    cellSize: preset.cellSize,
    contrast: preset.contrast,
    gamma: preset.gamma,
    angle: preset.screenAngle * Math.PI / 180,
    toneCurve: preset.toneCurve,
    dotShape: preset.dotShape,
    invert: preset.invert,
    jitter: (preset.jitter ?? 0) / 100,
    microDotAmount: (preset.microDot ?? 0) / 100,
    seed: preset.seed ?? 0,
    ink: preset.inkColor,
    paper: preset.paperColor
  });
  // Match the deterministic grain approximation in the built-in samples.
  if (preset.grainStrength) {
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const random = Math.sin(i * 12.9898 + (preset.seed ?? 0) * 78.233) * 43758.5453;
      const noise = ((random - Math.floor(random)) * 2 - 1) * preset.grainStrength / 100 * .15 * 255;
      for (let channel = 0; channel < 3; channel++) image.data[i + channel] += noise;
    }
    ctx.putImageData(image, 0, 0);
  }
  return new BloomPass().apply(canvas, (preset.bloomStrength ?? 0) / 100);
}

export function getPresetThumbnail(preset) {
  if (preset.thumbnailVersion === PRESET_THUMBNAIL_VERSION && preset.thumbnail) return preset.thumbnail;
  if (cache.has(preset)) return cache.get(preset);
  let thumbnail = '';
  try {
    thumbnail = renderPresetPreview(preset).toDataURL('image/png');
  } catch { /* A missing sample must never prevent saving or opening a preset. */ }
  cache.set(preset, thumbnail);
  return thumbnail;
}
