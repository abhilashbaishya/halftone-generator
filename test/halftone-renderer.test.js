import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { renderHalftoneSync, renderHalftoneAsync } from '../src/halftone-renderer.js';

const settings = { cellSize: 12, angle: 0, contrast: 1, gamma: 1, toneCurve: 1, ink: '#000', paper: '#fff' };

test('halftone screen reaches solid shadows, clean highlights, and preserves detail within cells', () => {
  const width = 48, height = 48;
  const data = new Uint8ClampedArray(width * height * 4);
  // One-pixel alternating lines would be lost by averaging an entire cell.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = (Math.floor(i / 4) % width) % 2 ? 255 : 0;
    data[i + 3] = 255;
  }
  const ctx = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(ctx, data, width, height, settings);
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
  assert.deepEqual(progress, [0.5], 'cancellation interrupts rendering between chunks');
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
    renderHalftoneSync(ctx, source, width, height, { ...settings, paper });
    renderHalftoneSync(reference, opaque, width, height, { ...settings, paper });
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
