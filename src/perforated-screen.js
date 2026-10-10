// CPU adaptation of Paper Shaders' halftone-dots getCircleWithHole treatment.
// https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/halftone-dots.ts
// Apache-2.0; license and NOTICE: public/licenses/paper-shaders/.
// Changes: cached centre samples, rotated screen, analytic pixel antialiasing,
// cancellable row chunks, and preservation of the source image's alpha.
import { samplePaperDarkness } from './paper-screen.js';

export function* renderPerforatedRows(ctx, source, width, height, settings, ink, paper) {
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const cell = Math.max(1, settings.cellSize);
  const cos = Math.cos(settings.angle), sin = Math.sin(settings.angle);
  const offsetX = Math.ceil((width * Math.abs(cos) + height * Math.abs(sin)) / (2 * cell)) + 1;
  const offsetY = Math.ceil((width * Math.abs(sin) + height * Math.abs(cos)) / (2 * cell)) + 1;
  const stride = offsetX * 2 + 1;
  const radii = new Float32Array(stride * (offsetY * 2 + 1)).fill(NaN);
  for (let y = 0; y < height; y++) {
    const py = y + .5 - height / 2;
    for (let x = 0; x < width; x++) {
      const px = x + .5 - width / 2;
      const gx = (px * cos + py * sin) / cell;
      const gy = (-px * sin + py * cos) / cell;
      const cx = Math.round(gx), cy = Math.round(gy);
      const index = (cy + offsetY) * stride + cx + offsetX;
      if (Number.isNaN(radii[index])) {
        const sx = (cx * cos - cy * sin) * cell + width / 2;
        const sy = (cx * sin + cy * cos) * cell + height / 2;
        radii[index] = .75 * samplePaperDarkness(source, width, height, sx, sy, settings);
      }
      const radius = radii[index];
      const hole = radius >= .5;
      const r = hole ? radius - .5 : radius;
      const dx = gx - cx, dy = gy - cy;
      const distance = Math.hypot(dx, dy);
      const aa = Math.max(.5, (Math.abs(dx) + Math.abs(dy)) / Math.max(distance, .0001)) / cell;
      const t = Math.max(0, Math.min(1, (r - distance + aa) / (2 * aa)));
      const circle = t * t * (3 - 2 * t);
      const mask = hole ? 1 - circle : circle;
      const alpha = mask * ink[3] / 255;
      const background = paper[3] / 255 * (1 - alpha);
      const total = alpha + background;
      const i = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        out[i + channel] = total ? (ink[channel] * alpha + paper[channel] * background) / total : 0;
      }
      out[i + 3] = total * source[i + 3];
    }
    if (y % 24 === 23) yield (y + 1) / height;
  }
  ctx.putImageData(image, 0, 0);
}
