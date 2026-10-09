// CPU adaptation of Paper Shaders' halftone-dots gooey/diagonal screen.
// https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/halftone-dots.ts
// Apache-2.0; attribution and license: public/licenses/paper-shaders/.
// Changes: bounded row bands, precomputed radial profile, existing tone controls,
// finite-difference antialiasing, and the studio's source-alpha composition.
const RADIUS = 1.25;
const PROFILE_SIZE = 4096;
const profile = Float32Array.from({ length: PROFILE_SIZE + 1 }, (_, i) => {
  const d = Math.sqrt(i / PROFILE_SIZE);
  return Math.pow(1 - d * d * (3 - 2 * d), 2 + RADIUS);
});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function sampleDarkness(source, width, height, x, y, settings) {
  // Bilinear sampling, like the source texture in Paper's shader. Composite
  // samples onto white before interpolation so invisible RGB cannot add ink.
  x = clamp(x - .5, 0, width - 1);
  y = clamp(y - .5, 0, height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0, ty = y - y0;
  const indices = [(y0 * width + x0) * 4, (y0 * width + x1) * 4,
    (y1 * width + x0) * 4, (y1 * width + x1) * 4];
  const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  // Paper's default contrast .4 maps to a sigmoid slope of 3.7947.
  const slope = 15 * Math.pow(.4, 1.5) * settings.contrast;
  let luma = 0;
  for (let channel = 0; channel < 3; channel++) {
    let value = 0;
    for (let n = 0; n < 4; n++) {
      const alpha = source[indices[n] + 3] / 255;
      value += weights[n] * (1 - alpha + alpha * source[indices[n] + channel] / 255);
    }
    value = Math.pow(value, settings.gamma);
    luma += [0.2126, 0.7152, 0.0722][channel] / (1 + Math.exp(-slope * (value - .5)));
  }
  return Math.pow(settings.invert ? luma : 1 - luma, settings.toneCurve);
}

export function* renderPaperRows(ctx, source, width, height, settings, ink, paper) {
  const image = ctx.createImageData(width, height);
  const out = image.data;
  const pitch = Math.max(1, settings.cellSize) / Math.SQRT2;
  const maxRadius = .42 * RADIUS * 6 * pitch;
  const cos = Math.cos(settings.angle), sin = Math.sin(settings.angle);
  const bandHeight = 64;
  const stride = width + 2;
  // One-pixel halo for antialias derivatives; memory does not grow with export height.
  const field = new Float32Array(stride * (bandHeight + 2));
  for (let start = 0; start < height; start += bandHeight) {
    const end = Math.min(height, start + bandHeight);
    field.fill(0);
    const corners = [[-1 - maxRadius, start - 1 - maxRadius], [width + 1 + maxRadius, start - 1 - maxRadius],
      [-1 - maxRadius, end + 1 + maxRadius], [width + 1 + maxRadius, end + 1 + maxRadius]];
    const grid = corners.map(([x, y]) => {
      x -= width / 2; y -= height / 2;
      return [(x * cos + y * sin) / pitch, (-x * sin + y * cos) / pitch];
    });
    const left = Math.floor(Math.min(...grid.map(p => p[0])));
    const right = Math.ceil(Math.max(...grid.map(p => p[0])));
    const top = Math.floor(Math.min(...grid.map(p => p[1])));
    const bottom = Math.ceil(Math.max(...grid.map(p => p[1])));
    for (let gy = top; gy <= bottom; gy++) {
      for (let gx = left; gx <= right; gx++) {
        if ((gx + gy) % 2 !== 0) continue;
        const cx = (gx * cos - gy * sin) * pitch + width / 2;
        const cy = (gx * sin + gy * cos) * pitch + height / 2;
        const radius = maxRadius * sampleDarkness(source, width, height, cx, cy, settings);
        if (radius < .001) continue;
        const x0 = Math.max(-1, Math.ceil(cx - radius - .5));
        const x1 = Math.min(width, Math.floor(cx + radius - .5));
        const y0 = Math.max(start - 1, Math.ceil(cy - radius - .5));
        const y1 = Math.min(end, Math.floor(cy + radius - .5));
        const scale = PROFILE_SIZE / (radius * radius);
        for (let y = y0; y <= y1; y++) {
          const dy2 = (y + .5 - cy) ** 2;
          let index = (y - start + 1) * stride + x0 + 1;
          for (let x = x0; x <= x1; x++, index++) {
            const distance = ((x + .5 - cx) ** 2 + dy2) * scale;
            if (distance >= PROFILE_SIZE) continue;
            const at = Math.floor(distance), fraction = distance - at;
            field[index] += profile[at] + fraction * (profile[at + 1] - profile[at]);
          }
        }
      }
    }
    for (let y = start; y < end; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y - start + 1) * stride + x + 1;
        const aa = Math.max(.0001, (Math.abs(field[index + 1] - field[index - 1])
          + Math.abs(field[index + stride] - field[index - stride])) / 2);
        const t = clamp((field[index] - .5 + aa) / (2 * aa), 0, 1);
        const mask = t * t * (3 - 2 * t);
        const alpha = mask * ink[3] / 255;
        const background = paper[3] / 255 * (1 - alpha);
        const total = alpha + background;
        const i = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          out[i + channel] = total ? (ink[channel] * alpha + paper[channel] * background) / total : 0;
        }
        out[i + 3] = total * source[i + 3];
      }
    }
    yield end / height;
  }
  ctx.putImageData(image, 0, 0);
}
