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
