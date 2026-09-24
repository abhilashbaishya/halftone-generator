import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { initializeWebp, webpWasmUrl } from '../src/webp-codec.js';
import { renderHalftoneSync } from '../src/halftone-renderer.js';

await initializeWebp({ wasmBinary: await readFile(new URL(webpWasmUrl)) });
const source = await loadImage(await readFile(new URL('../placeholder.jpg', import.meta.url)));
source.close = () => {};
let nativeWebp = true;
// Adapt Skia's `mime` option to OffscreenCanvas's browser `type` option.
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    const canvas = createCanvas(width, height);
    const nativeEncode = canvas.convertToBlob.bind(canvas);
    canvas.convertToBlob = ({ type, quality }) => nativeEncode({ mime: nativeWebp ? type : 'image/png', quality });
    canvas.transferToImageBitmap = () => canvas;
    return canvas;
  }
};
let complete;
let phases = [];
let progress = [];
globalThis.self = { postMessage(message) {
  if (message.type === 'export-progress') progress.push(message.progress);
  if (message.type === 'export-phase') phases.push(message.phase);
  if (['export-complete', 'export-error', 'export-rendered'].includes(message.type)) complete(message);
} };
await import('../export-worker.js');
const settings = { cellSize: 8, angle: .49, contrast: 1.1, gamma: 1, minDot: 0, toneCurve: .88,
  microDotAmount: .24, jitter: .06, seed: 0,
  quality: { sampleRadius: .58, edgeBoost: .22, ditherAmount: .1 }, ink: '#cc0011', paper: '#f4f0db' };

for (const mode of ['native', 'fallback', 'effects']) test(`export worker returns valid output: ${mode}`, async () => {
  nativeWebp = mode === 'native';
  phases = [];
  const done = new Promise((resolve) => { complete = resolve; });
  self.onmessage({ data: { type: 'export', requestId: 1, sourceBitmap: source, width: source.width, height: source.height,
    settings, needsPostEffects: mode === 'effects', encoding: { mimeType: 'image/webp', quality: .9 } } });
  const result = await done;
  assert.notEqual(result.type, 'export-error', result.message);
  if (mode === 'effects') {
    assert.equal(result.type, 'export-rendered');
    assert.deepEqual([result.bitmap.width, result.bitmap.height], [source.width, source.height]);
    return;
  }
  assert.deepEqual(phases, ['encoding']);
  assert.equal(result.blob.type, 'image/webp');
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const decoded = await loadImage(bytes);
  assert.deepEqual([decoded.width, decoded.height], [source.width, source.height]);
});

for (const paper of ['transparent', '#ffffff']) test(`PNG cutout export keeps empty source regions free of ink on ${paper} paper`, async () => {
  nativeWebp = true;
  const cutout = createCanvas(96, 96);
  cutout.close = () => {};
  const sourceContext = cutout.getContext('2d');
  sourceContext.fillStyle = '#000';
  sourceContext.fillRect(28, 28, 40, 40);
  const done = new Promise((resolve) => { complete = resolve; });
  self.onmessage({ data: { type: 'export', requestId: 2, sourceBitmap: cutout, width: 96, height: 96,
    settings: { ...settings, ink: '#000', paper, minDot: .6 }, needsPostEffects: false,
    encoding: { mimeType: 'image/png' } } });
  const result = await done;
  assert.equal(result.type, 'export-complete', result.message);
  const decoded = await loadImage(Buffer.from(await result.blob.arrayBuffer()));
  const output = createCanvas(96, 96).getContext('2d');
  output.drawImage(decoded, 0, 0);
  assert.deepEqual([...output.getImageData(8, 8, 1, 1).data],
    paper === 'transparent' ? [0, 0, 0, 0] : [255, 255, 255, 255]);
  const pixels = output.getImageData(30, 30, 32, 32).data;
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0 && pixels[index - 1] < 100));
});

for (const format of ['png', 'jpeg', 'webp', 'effects']) test(`export uses preview renderer: ${format}`, async () => {
  nativeWebp = true;
  progress = [];
  const width = 192, height = 240;
  const scaled = createCanvas(width, height);
  const ctx = scaled.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const expected = createCanvas(width, height).getContext('2d');
  const altSettings = { ...settings };
  renderHalftoneSync(expected, ctx.getImageData(0, 0, width, height).data, width, height, altSettings);
  const done = new Promise((resolve) => { complete = resolve; });
  self.onmessage({ data: { type: 'export', requestId: 3, sourceBitmap: source, width, height,
    settings: altSettings, needsPostEffects: format === 'effects',
    encoding: { mimeType: `image/${format}`, quality: .95 } } });
  const result = await done;
  assert.notEqual(result.type, 'export-error', result.message);
  const image = format === 'effects' ? result.bitmap : await loadImage(Buffer.from(await result.blob.arrayBuffer()));
  assert.deepEqual([image.width, image.height], [width, height]);
  assert.ok(progress.some((value) => value > 4 && value < 88), 'rendering reports intermediate progress');
  assert.ok(progress.every((value, i) => !i || value >= progress[i - 1]));
  const actual = createCanvas(width, height).getContext('2d');
  actual.drawImage(image, 0, 0);
  if (format === 'png' || format === 'effects') {
    assert.deepEqual(actual.getImageData(0, 0, width, height).data,
      expected.getImageData(0, 0, width, height).data, 'lossless export matches preview pixels at the same resolution');
  } else {
    assert.equal(result.blob.type, `image/${format}`);
  }
});
