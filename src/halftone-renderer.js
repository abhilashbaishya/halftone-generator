import { toneLuma } from '../renderer-core.js';

// Area covered by a circle clipped to a unit square. Unlike isolated dots,
// this screen can progress continuously all the way to solid ink.
const thresholds = Float32Array.from({ length: 2049 }, (_, i) => {
  const r = i / 2048 * Math.SQRT1_2;
  return Math.PI * r * r - (r <= 0.5 ? 0 :
    4 * (r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25)));
});

function readColor(ctx, color) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = typeof color === 'string' ? color : `rgb(${color.r} ${color.g} ${color.b})`;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data;
}

function* renderRows(ctx, source, width, height, settings) {
  const ink = readColor(ctx, settings.ink);
  const paper = readColor(ctx, settings.paper);
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const cell = Math.max(1, settings.cellSize);
  const cos = Math.cos(settings.angle), sin = Math.sin(settings.angle);
  const softness = Math.min(0.15, 0.5 / cell);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px = x + 0.5 - width / 2, py = y + 0.5 - height / 2;
      const gx = (px * cos + py * sin) / cell;
      const gy = (-px * sin + py * cos) / cell;
      const distance = Math.hypot(gx - Math.round(gx), gy - Math.round(gy));
      const threshold = thresholds[Math.min(2048, Math.round(distance / Math.SQRT1_2 * 2048))];
      const luma = (source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114) / 255;
      const darkness = Math.pow(1 - toneLuma(luma, settings.contrast, settings.gamma), settings.toneCurve);
      let mask = Math.max(0, Math.min(1, (darkness - threshold + softness) / (2 * softness)));
      mask = darkness === 0 ? 0 : darkness === 1 ? 1 : mask * mask * (3 - 2 * mask);
      const alpha = mask * source[i + 3] / 255 * ink[3] / 255;
      const background = paper[3] / 255 * (1 - alpha);
      const total = alpha + background;
      for (let channel = 0; channel < 3; channel++) {
        out[i + channel] = total ? (ink[channel] * alpha + paper[channel] * background) / total : 0;
      }
      out[i + 3] = total * 255;
    }
    if (y % 24 === 23) yield (y + 1) / height;
  }
  ctx.putImageData(image, 0, 0);
}

export function renderHalftoneSync(...args) {
  for (const _ of renderRows(...args)) { /* Worker owns this work. */ }
}

export async function renderHalftoneAsync(ctx, data, width, height, settings, {
  shouldCancel = () => false, onProgress = () => {}
} = {}) {
  const rows = renderRows(ctx, data, width, height, settings);
  while (!shouldCancel()) {
    const step = rows.next();
    if (step.done) {
      onProgress(1);
      return { cancelled: false };
    }
    onProgress(step.value);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return { cancelled: true };
}
