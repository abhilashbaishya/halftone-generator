import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { File as NodeFile } from 'node:buffer';
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
const exportCases = [
  { nativeWebp: true, nativeShare: false, label: 'native WebP' },
  { nativeWebp: false, nativeShare: false, label: 'PNG-substituting native encoder' },
  { nativeWebp: true, nativeShare: true, label: 'native mobile file sharing' }
];

for (const { nativeWebp, nativeShare, label } of exportCases) test(`default Ronaldo exports through the app with ${label}`, async () => {
  const browser = new Window({ url: 'http://localhost:5173', width: 390, height: 844 });
  for (const name of ['window', 'document', 'localStorage', 'navigator', 'CustomEvent', 'CSS', 'File']) {
    const value = name === 'window' ? browser : name === 'File' ? NodeFile : browser[name];
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  const matchMedia = browser.matchMedia.bind(browser);
  const coarsePointer = new browser.EventTarget();
  Object.defineProperty(coarsePointer, 'matches', { value: true });
  browser.matchMedia = (query) => nativeShare && query === '(any-pointer: coarse)'
    ? coarsePointer : matchMedia(query.split(',')[0]);
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

  const blobs = new Map(), downloads = [], shares = [];
  let shareBehavior = () => Promise.resolve();
  if (nativeShare) {
    Object.defineProperty(browser.navigator, 'canShare', {
      configurable: true,
      value: ({ files }) => files?.length === 1 && files[0] instanceof NodeFile
    });
    Object.defineProperty(browser.navigator, 'share', {
      configurable: true,
      value: (data) => { shares.push(data); return shareBehavior(); }
    });
  }
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { const url = `blob:http://localhost/${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  browser.HTMLAnchorElement.prototype.click = function() { downloads.push({ blob: blobs.get(this.href), name: this.download }); };
  const waitUntil = async (condition) => {
    for (let attempt = 0; attempt < 600 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(condition(), document.getElementById('renderStatus').textContent);
  };
  try {
    await import(`../script.js?export-test=${nativeWebp}-${nativeShare}`);
    const studio = browser.halftoneStudio;
    await waitUntil(() => document.getElementById('exportMeta').textContent.includes('2084 × 2100'));
    if (nativeShare) {
      studio.setHistoryEnabled(true);
      studio.setSetting('contrast', 1.25);
    }
    studio.setExportFormat('webp');
    document.getElementById('exportBtn').click();
    await waitUntil(() => !studio.getState().export.exporting);
    let blob, name;
    if (nativeShare) {
      assert.equal(downloads.length, 0);
      assert.equal(studio.getState().export.readyToShare, true);
      assert.equal(document.getElementById('exportBtn').textContent, 'Save / Share');
      document.getElementById('exportBtn').click();
      await waitUntil(() => shares.length === 1 && !studio.getState().export.exporting);
      assert.equal(downloads.length, 0);
      [blob] = shares[0].files;
      name = blob.name;
    } else {
      assert.equal(downloads.length, 1, document.getElementById('renderStatus').textContent);
      ({ blob, name } = downloads[0]);
    }
    assert.equal(blob.type, 'image/webp');
    assert.equal(name, 'Halftone Studio - Crimson Poster - Ultra.webp');
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    const decoded = await loadImage(bytes);
    assert.deepEqual([decoded.width, decoded.height], [2084, 2100]);
    const sample = createCanvas(32, 32);
    const context = sample.getContext('2d'); context.drawImage(decoded, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    assert.ok(new Set(pixels).size > 30, 'export contains artwork, not a blank canvas');
    if (process.env.HALFTONE_EXPORT_ARTIFACT_DIR) {
      await mkdir(process.env.HALFTONE_EXPORT_ARTIFACT_DIR, { recursive: true });
      await writeFile(`${process.env.HALFTONE_EXPORT_ARTIFACT_DIR}/${nativeWebp ? 'native' : 'fallback'}.webp`, bytes);
    }
    // Resizing the editor and changing DPR must not change exported dot density.
    const previewWidth = document.getElementById('previewCanvas').width;
    browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(0, 0, 580, 700);
    Object.defineProperty(browser, 'devicePixelRatio', { configurable: true, value: 2 });
    browser.happyDOM.setWindowSize({ width: 1440, height: 1000 });
    await waitUntil(() => document.getElementById('previewCanvas').width !== previewWidth
      && document.getElementById('renderStatus').dataset.visible === 'false');
    if (nativeShare) {
      assert.equal(studio.getState().export.readyToShare, true,
        'viewport changes retain the exact finished file');
      const abort = new Error('Share sheet dismissed');
      Object.defineProperty(abort, 'name', { value: 'AbortError' });
      shareBehavior = () => Promise.reject(abort);
      document.getElementById('exportBtn').click();
      await waitUntil(() => shares.length === 2 && !studio.getState().export.exporting);
      assert.equal(document.getElementById('renderStatus').textContent, 'Ready');
      assert.equal(document.getElementById('exportBtn').textContent, 'Save / Share');
      shareBehavior = () => Promise.reject(new Error('Native share unavailable'));
      document.getElementById('exportBtn').click();
      await waitUntil(() => shares.length === 3 && downloads.length === 1
        && !studio.getState().export.exporting);
      assert.equal(document.getElementById('renderStatus').textContent, 'Export complete');
      assert.equal(downloads[0].name, shares[0].files[0].name, 'share fallback preserves the filename');
      studio.undo();
      assert.equal(studio.getState().export.readyToShare, false, 'Undo invalidates the prepared file');
      assert.equal(studio.getState().history.canRedo, true);
      studio.setSetting('contrast', 1.45);
      assert.equal(studio.getState().export.readyToShare, false);
      assert.equal(document.getElementById('exportBtn').textContent, 'Export WebP');
    } else {
      document.getElementById('exportBtn').click();
      await waitUntil(() => !studio.getState().export.exporting);
      assert.equal(downloads.length, 2);
      assert.deepEqual(Buffer.from(await downloads[1].blob.arrayBuffer()), bytes,
        'same image and settings export identically after viewport and DPR changes');
    }
    if (nativeWebp && !nativeShare) {
      studio.setSetting('jitter', 32);
      studio.setSetting('microDot', 38);
      document.getElementById('exportBtn').click();
      await waitUntil(() => downloads.length === 3 && !studio.getState().export.exporting);
      const textured = Buffer.from(await downloads[2].blob.arrayBuffer());
      assert.ok(!textured.equals(bytes), 'preset texture settings change the rendering');
      studio.shuffleTexture();
      document.getElementById('exportBtn').click();
      await waitUntil(() => downloads.length === 4 && !studio.getState().export.exporting);
      assert.ok(!Buffer.from(await downloads[3].blob.arrayBuffer()).equals(textured),
        'a new texture seed rearranges the texture');
    }
    if (nativeWebp && !nativeShare) {
      studio.setSetting('quality', 'draft');
      studio.setExportFormat('png');
      const count = downloads.length;
      document.getElementById('exportBtn').click();
      studio.selectPreset('orange'); // Changing controls mid-export must not rename the running job.
      await waitUntil(() => downloads.length === count + 1 && !studio.getState().export.exporting);
      assert.equal(downloads.at(-1).name, 'Halftone Studio - Crimson Poster - Draft.png');
      const image = await loadImage(Buffer.from(await downloads.at(-1).blob.arrayBuffer()));
      const output = createCanvas(image.width, image.height).getContext('2d');
      output.drawImage(image, 0, 0);
      const rgba = output.getImageData(0, 0, image.width, image.height).data;
      assert.ok(rgba.every((value, index) => index % 4 !== 3 || value === 255), 'opaque uploads keep paper between dots');
      assert.ok(rgba.some((value, index) => index % 4 === 3 && value === 255), 'app retains opaque ink');
    }
    studio.setPreviewInteraction(true); // cancel deferred size estimation
  } finally {
    await browser.happyDOM.abort();
    browser.close();
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  }
});
