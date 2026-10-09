import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { renderHalftoneSync, renderHalftoneAsync } from '../src/halftone-renderer.js';

const settings = { cellSize: 12, angle: 0, contrast: 1, gamma: 1, toneCurve: 1, ink: '#000', paper: '#fff' };

test('diamond screen preserves detail within cells while transparent pixels stay transparent', () => {
  const width = 48, height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  // One-pixel alternating lines would be lost by averaging an entire cell.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = (Math.floor(i / 4) % width) % 2 ? 255 : 0;
    data[i + 3] = 255;
  }
  const ctx = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(ctx, data, width, height, { ...settings, dotShape: 'diamond' });
  assert.deepEqual(ctx.getImageData(0, 0, width, height).data, data);
  data.fill(0);
  renderHalftoneSync(ctx, data, width, height, { ...settings, paper: 'transparent' });
  assert.ok(ctx.getImageData(0, 0, width, height).data.every((value) => value === 0));
});

test('halftone fallback matches worker output and can cancel', async () => {
  const width = 48, height = 48;
  const data = new Uint8ClampedArray(width * height * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const a = createCanvas(width, height).getContext('2d');
  const b = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(a, data, width, height, settings);
  assert.deepEqual(await renderHalftoneAsync(b, data, width, height, settings), { cancelled: false });
  assert.deepEqual(a.getImageData(0, 0, width, height).data, b.getImageData(0, 0, width, height).data);
  assert.deepEqual(await renderHalftoneAsync(b, data, width, height, settings, { shouldCancel: () => true }), { cancelled: true });
  let cancel = false;
  const progress = [];
  assert.deepEqual(await renderHalftoneAsync(b, data, width, height, settings, {
    onProgress(value) { progress.push(value); cancel = true; }, shouldCancel: () => cancel
  }), { cancelled: true });
  assert.equal(progress.length, 1, 'cancellation interrupts cell sampling at the first chunk');
  assert.ok(progress[0] > 0 && progress[0] < 1);
});

test('every dot shape tracks tone from clean paper to solid ink, and invert flips it', () => {
  const width = 48, height = 48;
  const grey = (value) => {
    const data = new Uint8ClampedArray(width * height * 4).fill(value);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    return data;
  };
  const inkShare = (data, extra) => {
    const ctx = createCanvas(width, height).getContext('2d');
    renderHalftoneSync(ctx, data, width, height, { ...settings, ...extra });
    const out = ctx.getImageData(0, 0, width, height).data;
    let ink = 0;
    for (let i = 0; i < out.length; i += 4) ink += 1 - out[i] / 255;
    return ink / (width * height);
  };
  for (const dotShape of ['round', 'square', 'diamond', 'line']) {
    assert.equal(inkShare(grey(255), { dotShape }), 0, `${dotShape} leaves white paper clean`);
    assert.equal(inkShare(grey(0), { dotShape }), 1, `${dotShape} reaches solid ink`);
    const mid = inkShare(grey(128), { dotShape });
    assert.ok(mid > 0.35 && mid < 0.65, `${dotShape} midtone coverage ${mid}`);
    assert.equal(inkShare(grey(255), { dotShape, invert: true }), 1, `${dotShape} inverted fills highlights`);
  }
});

test('texture settings vary dots per seed without changing plain screens', () => {
  const width = 48, height = 48;
  const data = new Uint8ClampedArray(width * height * 4).fill(200);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const render = (extra) => {
    const ctx = createCanvas(width, height).getContext('2d');
    renderHalftoneSync(ctx, data, width, height, { ...settings, ...extra });
    return ctx.getImageData(0, 0, width, height).data;
  };
  const plain = render({});
  assert.deepEqual(render({ jitter: 0, microDotAmount: 0, seed: 7 }), plain);
  const textured = render({ jitter: 0.18, microDotAmount: 0.24, seed: 42 });
  assert.notDeepEqual(textured, plain);
  assert.notDeepEqual(render({ jitter: 0.18, microDotAmount: 0.24, seed: 43 }), textured);
});

test('source transparency masks both ink and paper, preserving soft edges', () => {
  const width = 48, height = 48;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) {
    const pixel = i / 4;
    source[i] = source[i + 1] = source[i + 2] = [0, 128, 255][pixel % 3];
    source[i + 3] = [0, 64, 128, 255][Math.floor(pixel / 3) % 4];
  }
  const opaque = source.slice();
  for (let i = 3; i < opaque.length; i += 4) opaque[i] = 255;
  for (const paper of ['#ffffff', '#15358a', '#f3dfbc']) {
    const ctx = createCanvas(width, height).getContext('2d');
    const reference = createCanvas(width, height).getContext('2d');
    renderHalftoneSync(ctx, source, width, height, { ...settings, paper, dotShape: 'diamond' });
    renderHalftoneSync(reference, opaque, width, height, { ...settings, paper, dotShape: 'diamond' });
    const actual = ctx.getImageData(0, 0, width, height).data;
    const expected = reference.getImageData(0, 0, width, height).data;
    for (let i = 0; i < source.length; i += 4) {
      assert.equal(actual[i + 3], source[i + 3], 'alpha follows the image regardless of tone or preset');
      if (!source[i + 3]) continue;
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Math.abs(actual[i + channel] - expected[i + channel]) <= 2,
          'soft edges retain treatment colors without a white fringe');
      }
    }
  }
});

test('Paper screen renders consistently across row bands and preserves cutout alpha', async () => {
  const width = 64, height = 192;
  const source = new Uint8ClampedArray(width * height * 4).fill(128);
  for (let i = 3; i < source.length; i += 4) source[i] = 255;
  const paperSettings = { ...settings, cellSize: 4 * Math.SQRT2, dotShape: 'round', screenStyle: 'paper' };
  const a = createCanvas(width, height).getContext('2d');
  const b = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(a, source, width, height, paperSettings);
  const pixels = a.getImageData(0, 0, width, height).data;
  assert.ok(pixels.some((v, i) => i % 4 === 0 && v < 50), 'midtone has ink');
  assert.ok(pixels.some((v, i) => i % 4 === 0 && v > 200), 'midtone has paper');
  // A uniform screen repeats every two lattice steps, including across bands.
  for (let y = 8; y < height; y++) {
    assert.deepEqual(pixels.slice(y * width * 4, (y + 1) * width * 4),
      pixels.slice((y % 8) * width * 4, (y % 8 + 1) * width * 4), `row ${y} has no band seam`);
  }
  await renderHalftoneAsync(b, source, width, height, paperSettings);
  assert.deepEqual(b.getImageData(0, 0, width, height).data, pixels, 'worker and fallback match');
  let cancelled = false;
  assert.deepEqual(await renderHalftoneAsync(b, source, width, height, paperSettings, {
    onProgress() { cancelled = true; }, shouldCancel: () => cancelled
  }), { cancelled: true });
  for (let i = 3; i < source.length; i += 4) source[i] = [0, 64, 128, 255][(i >> 2) % 4];
  renderHalftoneSync(a, source, width, height, { ...paperSettings, angle: .37 });
  const cutout = a.getImageData(0, 0, width, height).data;
  for (let i = 3; i < source.length; i += 4) assert.equal(cutout[i], source[i], 'original alpha survives');
});

test('Paper screen responds to tone, angle, invert and cell size controls', () => {
  const width = 96, height = 96;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < source.length; i += 4) {
    source[i] = source[i + 1] = source[i + 2] = (i / 4 % width) * 255 / width;
    source[i + 3] = 255;
  }
  const ctx = createCanvas(width, height).getContext('2d');
  const render = (extra) => {
    renderHalftoneSync(ctx, source, width, height, { ...settings, dotShape: 'round', screenStyle: 'paper', ...extra });
    return ctx.getImageData(0, 0, width, height).data;
  };
  const original = render({});
  const brightness = pixels => pixels.reduce((sum, value, i) => sum + (i % 4 === 0 ? value : 0), 0);
  assert.ok(brightness(render({ gamma: 1.6 })) < brightness(original), 'gamma direction matches existing presets');
  for (const extra of [{ contrast: 1.8 }, { gamma: 1.6 }, { toneCurve: 1.4 },
    { angle: .4 }, { invert: true }, { cellSize: 6 }, { dotShape: 'square' }, { screenStyle: 'classic' }]) {
    assert.notDeepEqual(render(extra), original, JSON.stringify(extra));
  }
});


test('Dots keep round marks on fine stripes instead of cutting the marks apart', () => {
  const width = 72, height = 72;
  const stripes = new Uint8ClampedArray(width * height * 4);
  const flat = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < stripes.length; i += 4) {
    const value = (i / 4 % width) % 2 ? 192 : 64;
    stripes[i] = stripes[i + 1] = stripes[i + 2] = value;
    flat[i] = flat[i + 1] = flat[i + 2] = 128;
    stripes[i + 3] = flat[i + 3] = 255;
  }
  const a = createCanvas(width, height).getContext('2d');
  const b = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(a, stripes, width, height, settings);
  renderHalftoneSync(b, flat, width, height, settings);
  assert.deepEqual(a.getImageData(0, 0, width, height).data, b.getImageData(0, 0, width, height).data,
    'equal average brightness produces intact, identical round dots');
});

test('Dots ignore invisible RGB when sampling and retain source alpha at rotated edges', () => {
  const width = 96, height = 96;
  const source = new Uint8ClampedArray(width * height * 4).fill(96);
  for (let i = 3; i < source.length; i += 4) source[i] = (i / 4 | 0) % 4 * 85;
  const other = source.slice();
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] === 0) other[i] = other[i + 1] = other[i + 2] = 255;
  }
  const a = createCanvas(width, height).getContext('2d');
  const b = createCanvas(width, height).getContext('2d');
  for (const angle of [-1.1, 0, .384, 1.1]) {
    renderHalftoneSync(a, source, width, height, { ...settings, angle });
    renderHalftoneSync(b, other, width, height, { ...settings, angle });
    const pixels = a.getImageData(0, 0, width, height).data;
    assert.deepEqual(pixels, b.getImageData(0, 0, width, height).data);
    for (let i = 3; i < source.length; i += 4) assert.equal(pixels[i], source[i]);
  }
});
