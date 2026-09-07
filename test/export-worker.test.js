import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { initializeWebp, webpWasmUrl } from '../src/webp-codec.js';

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
globalThis.self = { postMessage(message) {
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
