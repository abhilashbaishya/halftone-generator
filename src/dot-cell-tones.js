import { toneLuma } from '../renderer-core.js';

// Average the source inside each rotated screen cell. Sampling a single pixel
// can alias fine fabric into an unrelated pattern; averaging stabilizes the
// tone while keeping every dot circular. Alpha weights exclude invisible RGB.
export function* sampleDotCellTones(source, width, height, cell, cos, sin, settings) {
  const phase = settings.screenPhase || 0;
  // Phase slides the grid by up to one cell, so keep one extra index of margin.
  const offsetX = Math.ceil((width * Math.abs(cos) + height * Math.abs(sin)) / (2 * cell)) + 2;
  const offsetY = Math.ceil((width * Math.abs(sin) + height * Math.abs(cos)) / (2 * cell)) + 2;
  const stride = offsetX * 2 + 1;
  const size = stride * (offsetY * 2 + 1);
  const tones = new Float32Array(size);
  const weights = new Float32Array(size);
  for (let y = 0; y < height; y++) {
    const py = y + .5 - height / 2;
    for (let x = 0; x < width; x++) {
      const px = x + .5 - width / 2;
      const cx = Math.round((px * cos + py * sin) / cell - phase);
      const cy = Math.round((-px * sin + py * cos) / cell);
      const index = (cy + offsetY) * stride + cx + offsetX;
      const i = (y * width + x) * 4;
      const weight = source[i + 3] / 255;
      tones[index] += weight * (source[i] * .299 + source[i + 1] * .587 + source[i + 2] * .114) / 255;
      weights[index] += weight;
    }
    if (y % 24 === 23) yield .25 * (y + 1) / height;
  }
  for (let index = 0; index < size; index++) {
    const luma = weights[index] ? tones[index] / weights[index] : 1;
    const tone = toneLuma(Math.max(0, Math.min(1, luma)), settings.contrast, settings.gamma);
    tones[index] = Math.pow(settings.invert ? tone : 1 - tone, settings.toneCurve);
  }
  return { tones, offsetX, offsetY, stride };
}
