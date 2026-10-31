import { renderPerforatedRows } from './perforated-screen.js';
import { sampleDotCellTones } from './dot-cell-tones.js';
import { renderPaperRows } from './paper-screen.js';
import { toneLuma } from '../renderer-core.js';

// Area covered by a circle clipped to a unit square. Unlike isolated dots,
// this screen can progress continuously all the way to solid ink.
const roundCoverage = Float32Array.from({ length: 2049 }, (_, i) => {
  const r = i / 2048 * Math.SQRT1_2;
  return Math.PI * r * r - (r <= 0.5 ? 0 :
    4 * (r * r * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r * r - 0.25)));
});

// Each shape returns the fraction of a cell its dot covers once it grows to
// reach (dx, dy). A pixel takes ink when the local darkness exceeds that
// fraction, so every shape reaches solid ink at full darkness.
const COVERAGE = {
  round(dx, dy) {
    const r = Math.hypot(dx, dy);
    return r >= Math.SQRT1_2 ? 1 : roundCoverage[Math.round(r / Math.SQRT1_2 * 2048)];
  },
  square(dx, dy) {
    const m = 2 * Math.max(Math.abs(dx), Math.abs(dy));
    return Math.min(1, m * m);
  },
  diamond(dx, dy) {
    const m = Math.abs(dx) + Math.abs(dy);
    return m >= 1 ? 1 : m <= 0.5 ? 2 * m * m : 1 - 2 * (1 - m) * (1 - m);
  },
  line(dx, dy) {
    return Math.min(1, 2 * Math.abs(dy));
  }
};

// Highlight micro-dots sit in three of a cell's four quadrants.
const MICRO_SLOTS = [[-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]];

function hash2d(x, y, salt, seed) {
  const value = Math.sin(
    (x + seed * 0.137) * 127.1
    + (y + seed * 0.311) * 311.7
    + (salt + seed * 0.017) * 17.13
  ) * 43758.5453123;
  return value - Math.floor(value);
}

function readColor(ctx, color) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = typeof color === 'string' ? color : `rgb(${color.r} ${color.g} ${color.b})`;
  ctx.fillRect(0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data;
}

function* renderRows(ctx, source, width, height, settings) {
  const ink = readColor(ctx, settings.ink);
  const paper = readColor(ctx, settings.paper);
  if (settings.screenStyle === 'perforated') {
    yield* renderPerforatedRows(ctx, source, width, height, settings, ink, paper);
    return;
  }
  if (settings.dotShape === 'gooey' || (settings.screenStyle === 'paper' && (!settings.dotShape || settings.dotShape === 'round'))) {
    yield* renderPaperRows(ctx, source, width, height, settings, ink, paper);
    return;
  }
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const cell = Math.max(1, settings.cellSize);
  const cos = Math.cos(settings.angle), sin = Math.sin(settings.angle);
  const sampledDots = !settings.dotShape || settings.dotShape === 'round';
  const cells = sampledDots ? yield* sampleDotCellTones(source, width, height, cell, cos, sin, settings) : null;
  const softness = Math.min(0.15, 0.5 / cell);
  const coverage = COVERAGE[settings.dotShape] ?? COVERAGE.round;
  const invert = settings.invert === true;
  const jitter = Math.max(0, settings.jitter || 0);
  const micro = Math.max(0, settings.microDotAmount || 0);
  const seed = settings.seed || 0;
  const microRadius = Math.max(0.35, cell * 0.085 * (0.4 + micro));
  // Pixels are visited cell by cell along each row, so per-cell random values
  // are computed once and reused until the pixel crosses into another cell.
  let cellX = NaN, cellY = NaN, jitterX = 0, jitterY = 0;
  const microCell = MICRO_SLOTS.map(() => ({ x: 0, y: 0, chance: 1 }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const px = x + 0.5 - width / 2, py = y + 0.5 - height / 2;
      const gx = (px * cos + py * sin) / cell;
      const gy = (-px * sin + py * cos) / cell;
      const cx = Math.round(gx), cy = Math.round(gy);
      if ((jitter || micro) && (cx !== cellX || cy !== cellY)) {
        cellX = cx;
        cellY = cy;
        if (jitter) {
          jitterX = (hash2d(cx, cy, 0.1, seed) - 0.5) * 0.5 * jitter;
          jitterY = (hash2d(cx, cy, 0.9, seed) - 0.5) * 0.5 * jitter;
        }
        if (micro) {
          microCell.forEach((slot, index) => {
            const salt = 2.4 + index * 1.7;
            slot.chance = hash2d(cx, cy, salt, seed);
            slot.x = MICRO_SLOTS[index][0] + (hash2d(cx, cy, salt + 1.2, seed) - 0.5) * 0.2;
            slot.y = MICRO_SLOTS[index][1] + (hash2d(cx, cy, salt + 2.4, seed) - 0.5) * 0.2;
          });
        }
      }
      const ox = gx - cx, oy = gy - cy;
      const threshold = coverage(ox - jitterX, oy - jitterY);
      let darkness;
      if (cells) {
        darkness = cells.tones[(cy + cells.offsetY) * cells.stride + cx + cells.offsetX];
      } else {
        const luma = (source[i] * 0.299 + source[i + 1] * 0.587 + source[i + 2] * 0.114) / 255;
        const tone = toneLuma(luma, settings.contrast, settings.gamma);
        darkness = Math.pow(invert ? tone : 1 - tone, settings.toneCurve);
      }
      let mask = Math.max(0, Math.min(1, (darkness - threshold + softness) / (2 * softness)));
      mask = darkness === 0 ? 0 : darkness === 1 ? 1 : mask * mask * (3 - 2 * mask);
      if (micro && darkness >= 0.003 && darkness < 0.6) {
        const slotIndex = ox < 0 ? (oy < 0 ? 0 : 2) : oy >= 0 ? 1 : -1;
        const base = micro * (1 - darkness);
        const slot = microCell[slotIndex];
        if (slot && slotIndex < Math.ceil(base * 3) && slot.chance <= base * (0.65 - slotIndex * 0.15)) {
          const edge = microRadius - Math.hypot(ox - slot.x, oy - slot.y) * cell + 0.5;
          mask = Math.max(mask, Math.min(1, Math.max(0, edge)));
        }
      }
      // Compose the preset's ink and paper inside the image, then apply the
      // source alpha to the entire treatment so cutouts and soft edges survive.
      const alpha = mask * ink[3] / 255;
      const background = paper[3] / 255 * (1 - alpha);
      const total = alpha + background;
      for (let channel = 0; channel < 3; channel++) {
        out[i + channel] = total ? (ink[channel] * alpha + paper[channel] * background) / total : 0;
      }
      out[i + 3] = total * source[i + 3];
    }
    if (y % 24 === 23) yield cells ? .25 + .75 * (y + 1) / height : (y + 1) / height;
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
