// CPU adaptation of Paper Shaders' halftone-dots getCircleWithHole treatment.
// https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/halftone-dots.ts
// Apache-2.0; license and NOTICE: public/licenses/paper-shaders/.
// Changes: area-calibrated marks, cell-averaged tones, rotated antialiasing,
// cancellable row chunks, and preservation of the source image's alpha.
import { sampleDotCellTones } from './dot-cell-tones.js';

const smoothstep = (x) => x * x * (3 - 2 * x);

function settleCoverage(tone) {
  // Keep central midtones intact, then ease the outer tones into clean paper
  // and solid ink. Applying this symmetrically also supports light-ink presets
  // and inversion, without deciding that either palette colour must be black.
  const edge = Math.min(tone, 1 - tone);
  if (edge >= .3) return tone;
  const t = Math.max(0, Math.min(1, (edge - .08) / .22));
  const settled = edge * smoothstep(t);
  return tone < .5 ? settled : 1 - settled;
}

export function* renderPerforatedRows(ctx, source, width, height, settings, ink, paper) {
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const cell = Math.max(1, settings.cellSize);
  const cos = Math.cos(settings.angle), sin = Math.sin(settings.angle);
  // Use the same continuous tone controls as Dots. A steep sigmoid followed
  // by radius scaling flattened faces into nearly solid regions.
  const cells = yield* sampleDotCellTones(source, width, height, cell, cos, sin, settings);
  for (let i = 0; i < cells.tones.length; i++) cells.tones[i] = settleCoverage(cells.tones[i]);
  // The largest circle that fits inside one cell covers pi/4 of its area.
  // Beyond that, shrink a paper hole as darkness rises. Matching filled area
  // at the handoff avoids a brightness jump and keeps shadows monotonic.
  const circleLimit = Math.PI / 4;
  for (let y = 0; y < height; y++) {
    const py = y + .5 - height / 2;
    for (let x = 0; x < width; x++) {
      const px = x + .5 - width / 2;
      const gx = (px * cos + py * sin) / cell;
      const gy = (-px * sin + py * cos) / cell;
      const cx = Math.round(gx), cy = Math.round(gy);
      const darkness = cells.tones[(cy + cells.offsetY) * cells.stride + cx + cells.offsetX];
      const hole = darkness > circleLimit;
      const r = Math.sqrt((hole ? 1 - darkness : darkness) / Math.PI);
      const dx = gx - cx, dy = gy - cy;
      const distance = Math.hypot(dx, dy);
      const aa = Math.max(.5, (Math.abs(dx) + Math.abs(dy)) / Math.max(distance, .0001)) / cell;
      const t = Math.max(0, Math.min(1, (r - distance + aa) / (2 * aa)));
      // Antialiasing alone leaves a faint mark even as radius approaches zero.
      // Fade subpixel marks/holes out so solid regions arrive without a snap.
      const visibility = smoothstep(Math.min(1, r * cell));
      const circle = smoothstep(t) * visibility;
      const mask = darkness <= 0 ? 0 : darkness >= 1 ? 1 : hole ? 1 - circle : circle;
      const alpha = mask * ink[3] / 255;
      const background = paper[3] / 255 * (1 - alpha);
      const total = alpha + background;
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        out[i + channel] = total ? (ink[channel] * alpha + paper[channel] * background) / total : 0;
      }
      out[i + 3] = total * source[i + 3];
    }
    if (y % 24 === 23) yield .25 + .75 * (y + 1) / height;
  }
  ctx.putImageData(image, 0, 0);
}
