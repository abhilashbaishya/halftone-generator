import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { initializeWebp, webpWasmUrl } from '../src/webp-codec.js';

await initializeWebp({ wasmBinary: await readFile(new URL(webpWasmUrl)) });
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => {
  const timer = realSetTimeout(callback, delay, ...args);
  if (delay === 60_000) timer.unref(); // Blob URL cleanup must not hold the test process open.
  return timer;
};
const ronaldo = await loadImage(await readFile(new URL('../placeholder.jpg', import.meta.url)));

// Real JPEG pixels, the app's export button/render path, real Canvas rasterizing
// and real native/WASM encoders. This is not a Safari UI automation test.
for (const nativeWebp of [true, false]) test(`default Ronaldo exports through the app with ${nativeWebp ? 'native WebP' : 'PNG-substituting native encoder'}`, async () => {
  const browser = new Window({ url: 'http://localhost:5173', width: 390, height: 844 });
  for (const name of ['window', 'document', 'localStorage', 'navigator', 'CustomEvent', 'CSS']) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? browser : browser[name] });
  }
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  const matchMedia = browser.matchMedia.bind(browser);
  browser.matchMedia = (query) => matchMedia(query.split(',')[0]);
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(0, 0, 300, 310);
  document.body.innerHTML = (await readFile(new URL('../index.html', import.meta.url), 'utf8')).match(/<body>([\s\S]*)<\/body>/)[1];
  const canvases = new WeakMap();
  const backing = (node) => {
    if (!canvases.has(node)) canvases.set(node, createCanvas(Math.max(1, node.width), Math.max(1, node.height)));
    const canvas = canvases.get(node);
    if (canvas.width !== node.width) canvas.width = Math.max(1, node.width);
    if (canvas.height !== node.height) canvas.height = Math.max(1, node.height);
    return canvas;
  };
  const unwrap = (image) => image._native || (image instanceof browser.HTMLCanvasElement ? backing(image) : image);
  browser.HTMLCanvasElement.prototype.getContext = function(type) {
    if (type !== '2d') return null; // GPU effects are covered by device testing.
    return new Proxy(backing(this).getContext('2d'), {
      get(target, key) {
        if (key === 'drawImage') return (image, ...args) => target.drawImage(unwrap(image), ...args);
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set: (target, key, value) => Reflect.set(target, key, value, target)
    });
  };
  browser.HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    backing(this).toBlob(callback, !nativeWebp && type === 'image/webp' ? 'image/png' : type, quality);
  };
  globalThis.Image = class {
    _native = ronaldo;
    width = ronaldo.width; height = ronaldo.height;
    naturalWidth = ronaldo.width; naturalHeight = ronaldo.height;
    set src(value) { queueMicrotask(() => this.onload?.()); }
  };
  // Also exercise a browser that advertises Worker but refuses construction.
  globalThis.Worker = browser.Worker = nativeWebp ? undefined : class {
    constructor() { throw new Error('Worker unavailable'); }
  };
  browser.OffscreenCanvas = nativeWebp ? undefined : class {};
  browser.createImageBitmap = () => {};

  const blobs = new Map(), downloads = [];
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { const url = `blob:http://localhost/${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  browser.HTMLAnchorElement.prototype.click = function() { downloads.push({ blob: blobs.get(this.href), name: this.download }); };
  const waitUntil = async (condition) => {
    for (let attempt = 0; attempt < 600 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(condition(), document.getElementById('renderStatus').textContent);
  };
  try {
    await import(`../script.js?export-test=${nativeWebp}`);
    const studio = browser.halftoneStudio;
    await waitUntil(() => document.getElementById('exportMeta').textContent.includes('1389'));
    studio.setExportFormat('webp');
    document.getElementById('exportBtn').click();
    await waitUntil(() => !studio.getState().export.exporting);
    assert.equal(downloads.length, 1, document.getElementById('renderStatus').textContent);
    const { blob, name } = downloads[0];
    assert.equal(blob.type, 'image/webp');
    assert.match(name, /^Halftone Studio - \d{4}-\d{2}-\d{2}\.webp$/);
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    const decoded = await loadImage(bytes);
    assert.deepEqual([decoded.width, decoded.height], [ronaldo.width, ronaldo.height]);
    const sample = createCanvas(32, 32);
    const context = sample.getContext('2d'); context.drawImage(decoded, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    assert.ok(new Set(pixels).size > 30, 'export contains artwork, not a blank canvas');
    if (process.env.HALFTONE_EXPORT_ARTIFACT_DIR) {
      await mkdir(process.env.HALFTONE_EXPORT_ARTIFACT_DIR, { recursive: true });
      await writeFile(`${process.env.HALFTONE_EXPORT_ARTIFACT_DIR}/${nativeWebp ? 'native' : 'fallback'}.webp`, bytes);
    }
    studio.setPreviewInteraction(true); // cancel deferred size estimation
  } finally {
    await browser.happyDOM.abort();
    browser.close();
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});
