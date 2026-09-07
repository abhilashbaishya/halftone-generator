import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { encodeCanvas } from '../src/canvas-encoding.js';
import { encodeWebpPixels, initializeWebp, webpWasmUrl } from '../src/webp-codec.js';
import { createExportFilename } from '../src/export-filename.js';

await initializeWebp({ wasmBinary: await readFile(new URL(webpWasmUrl)) });

for (const mode of ['native', 'png-substitution', 'null', 'unsupported']) test(`WebP produces a decodable WebP with ${mode} encoder`, async () => {
  const canvas = createCanvas(48, 32);
  const context = canvas.getContext('2d');
  context.fillStyle = '#dd1020'; context.fillRect(0, 0, 24, 32);
  context.fillStyle = '#e6dfcf'; context.fillRect(24, 0, 24, 32);
  const input = {
    width: canvas.width, height: canvas.height, getContext: () => context,
    convertToBlob: (options) => {
      if (mode === 'null') return Promise.resolve(null);
      if (mode === 'unsupported') throw new DOMException('Unsupported codec', 'NotSupportedError');
      return canvas.convertToBlob({ mime: mode === 'png-substitution' ? 'image/png' : options.type, quality: options.quality });
    }
  };
  let fallbackCalls = 0;
  const blob = await encodeCanvas(input, 'image/webp', .9, {
    encodeWebp: (...args) => { fallbackCalls++; return encodeWebpPixels(...args); }
  });
  assert.equal(fallbackCalls, mode === 'native' ? 0 : 1);
  assert.equal(blob.type, 'image/webp');
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  const decoded = await loadImage(bytes);
  assert.deepEqual([decoded.width, decoded.height], [48, 32]);
});

test('JPEG and PNG stay native; security errors are not disguised as codec errors', async () => {
  const canvas = createCanvas(16, 12);
  const fallback = () => { assert.fail('Unexpected WebP fallback'); };
  for (const type of ['image/jpeg', 'image/png']) assert.equal((await encodeCanvas({ toBlob: canvas.toBlob.bind(canvas) }, type, .9, { encodeWebp: fallback })).type, type);
  await assert.rejects(encodeCanvas({ convertToBlob() { throw new DOMException('Tainted canvas', 'SecurityError'); } }, 'image/webp', .9, { encodeWebp: fallback }), { name: 'SecurityError' });
});

test('cancelled encoding cannot return a downloadable result', async () => {
  const controller = new AbortController();
  const canvas = createCanvas(16, 12);
  const input = { width: 16, height: 12, getContext: () => canvas.getContext('2d'), toBlob: (callback) => callback(new Blob(['png'], { type: 'image/png' })) };
  await assert.rejects(encodeCanvas(input, 'image/webp', .9, {
    signal: controller.signal,
    encodeWebp: async () => { controller.abort(); return new Blob(['webp'], { type: 'image/webp' }); }
  }), { name: 'AbortError' });
});

test('download names use a readable brand and local calendar date', () => {
  assert.equal(createExportFilename('webp', new Date(2026, 8, 7, 0, 15)), 'Halftone Studio - 2026-09-07.webp');
  assert.equal(createExportFilename('jpg', new Date(2026, 0, 2)), 'Halftone Studio - 2026-01-02.jpg');
});

test('unsupported WebP is detected once on a tiny canvas without full-size PNG encodes', async () => {
  const probeSizes = [];
  let fullEncodes = 0, fallbacks = 0;
  const ownerDocument = { createElement() {
    return { width: 0, height: 0, toBlob(callback) {
      probeSizes.push([this.width, this.height]);
      callback(new Blob(['png'], { type: 'image/png' }));
    } };
  } };
  const canvas = {
    ownerDocument, width: 1600, height: 1200,
    toBlob() { fullEncodes++; assert.fail('Do not encode the full image as PNG'); },
    getContext: () => ({ getImageData: () => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) }) })
  };
  const encodeWebp = async () => { fallbacks++; return new Blob(['webp'], { type: 'image/webp' }); };
  await encodeCanvas(canvas, 'image/webp', .9, { encodeWebp });
  await encodeCanvas(canvas, 'image/webp', .9, { encodeWebp });
  assert.deepEqual(probeSizes, [[2, 2]]);
  assert.equal(fullEncodes, 0);
  assert.equal(fallbacks, 2);
  await assert.rejects(encodeCanvas(canvas, 'image/webp', .9, { encodeWebp, allowFallback: false }));
  assert.equal(fallbacks, 2, 'background estimates must not launch WASM encodes');
});
