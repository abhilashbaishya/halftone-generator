export const MOTION_FPS = { min: 4, max: 12, default: 8 };
export const MOTION_STRENGTH = { min: 0, max: 100, default: 70 };
export const MOTION_FRAME_COUNT = 24;

// Three waves cross at different angles, spacings, and speeds. Where they meet
// dots swell hard; where they cancel the screen rests, so patches form, drift,
// and dissolve instead of one band sweeping by. Spacing is a fraction of the
// long edge, so drafts, previews, and GIF frames show the same motion. Each
// wave completes whole cycles per loop, so the last frame leads into the first.
const WAVES = [
  { angle: Math.PI / 4, length: .7, cycles: 1, weight: 1 },
  { angle: Math.PI * 1.1, length: .45, cycles: 2, weight: .7 },
  { angle: -Math.PI * .4, length: 1.1, cycles: 1, weight: .55 }
].map((wave) => ({ ...wave, x: Math.cos(wave.angle), y: Math.sin(wave.angle) }));
const NORM = Math.hypot(...WAVES.map((wave) => wave.weight));
// The field is smooth over many cells; evaluate it on a coarse grid and
// interpolate, so full-resolution frames do not pay for trigonometry per pixel.
const FIELD_STEP = 8;
const FIELD_MARGIN = 4;

export function motionWave(frame, strength) {
  const amount = clampMotionStrength(strength) / 100;
  return { amount: amount * 1.2, sway: amount * .5, phase: frame / MOTION_FRAME_COUNT };
}

function waveAt(wave, x, y, size) {
  let swell = 0, dx = 0, dy = 0;
  for (const w of WAVES) {
    const angle = 2 * Math.PI * ((x * w.x + y * w.y) / (size * w.length) - w.cycles * wave.phase);
    swell += w.weight * Math.sin(angle);
    // A quarter cycle behind the swell, like water: dots lean forward on the
    // rising edge and back on the falling one.
    const lean = w.weight * Math.cos(angle);
    dx += lean * w.x;
    dy += lean * w.y;
  }
  return [swell / NORM, dx / NORM, dy / NORM];
}

// Returns a sampler for pixel positions measured from the image's top left.
// After sample(x, y), curve is that spot's tone-curve exponent and dx/dy is how
// far its dots sway, in pixels. fillRow writes the same for every pixel centre
// in row y, for renderers that visit each pixel. Scaling the exponent keeps
// paper clean and solids solid while the dots in between swell and shrink.
export function createMotionField(settings, width, height) {
  const wave = settings.wave;
  const still = {
    curve: settings.toneCurve, dx: 0, dy: 0, sample() {},
    fillRow(y, curves, dxs, dys) { curves.fill(settings.toneCurve); dxs.fill(0); dys.fill(0); }
  };
  if (!wave?.amount && !wave?.sway) return still;
  const size = Math.max(width, height);
  const sway = (wave.sway || 0) * Math.max(1, settings.cellSize);
  const cols = Math.ceil(width / FIELD_STEP) + 2 * FIELD_MARGIN + 1;
  const rows = Math.ceil(height / FIELD_STEP) + 2 * FIELD_MARGIN + 1;
  const curves = new Float32Array(cols * rows);
  const offsets = new Float32Array(cols * rows * 2);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col - FIELD_MARGIN) * FIELD_STEP - width / 2;
      const y = (row - FIELD_MARGIN) * FIELD_STEP - height / 2;
      const [swell, dx, dy] = waveAt(wave, x, y, size);
      const index = row * cols + col;
      curves[index] = settings.toneCurve * 2 ** (-(wave.amount || 0) * swell);
      offsets[index * 2] = dx * sway;
      offsets[index * 2 + 1] = dy * sway;
    }
  }
  return {
    curve: settings.toneCurve, dx: 0, dy: 0,
    sample(x, y) {
      const fx = Math.max(0, Math.min(cols - 1.001, x / FIELD_STEP + FIELD_MARGIN));
      const fy = Math.max(0, Math.min(rows - 1.001, y / FIELD_STEP + FIELD_MARGIN));
      const col = Math.floor(fx), row = Math.floor(fy);
      const tx = fx - col, ty = fy - row;
      const a = row * cols + col, b = a + 1, c = a + cols, d = c + 1;
      const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
      this.curve = curves[a] * wa + curves[b] * wb + curves[c] * wc + curves[d] * wd;
      this.dx = offsets[a * 2] * wa + offsets[b * 2] * wb + offsets[c * 2] * wc + offsets[d * 2] * wd;
      this.dy = offsets[a * 2 + 1] * wa + offsets[b * 2 + 1] * wb + offsets[c * 2 + 1] * wc + offsets[d * 2 + 1] * wd;
    },
    fillRow(y, rowCurves, dxs, dys) {
      const fy = Math.max(0, Math.min(rows - 1.001, (y + .5) / FIELD_STEP + FIELD_MARGIN));
      const row = Math.floor(fy), ty = fy - row;
      for (let x = 0; x < width; x++) {
        const fx = (x + .5) / FIELD_STEP + FIELD_MARGIN;
        const col = Math.floor(fx), tx = fx - col;
        const a = row * cols + col, c = a + cols;
        const top = curves[a] + tx * (curves[a + 1] - curves[a]);
        rowCurves[x] = top + ty * (curves[c] + tx * (curves[c + 1] - curves[c]) - top);
        const topX = offsets[a * 2] + tx * (offsets[a * 2 + 2] - offsets[a * 2]);
        dxs[x] = topX + ty * (offsets[c * 2] + tx * (offsets[c * 2 + 2] - offsets[c * 2]) - topX);
        const topY = offsets[a * 2 + 1] + tx * (offsets[a * 2 + 3] - offsets[a * 2 + 1]);
        dys[x] = topY + ty * (offsets[c * 2 + 1] + tx * (offsets[c * 2 + 3] - offsets[c * 2 + 1]) - topY);
      }
    }
  };
}

export function clampMotionFps(value) {
  const fps = Math.round(Number(value));
  if (!Number.isFinite(fps)) return MOTION_FPS.default;
  return Math.min(MOTION_FPS.max, Math.max(MOTION_FPS.min, fps));
}

export function clampMotionStrength(value) {
  const strength = Math.round(Number(value));
  if (!Number.isFinite(strength)) return MOTION_STRENGTH.default;
  return Math.min(MOTION_STRENGTH.max, Math.max(MOTION_STRENGTH.min, strength));
}
