import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

// Exercise the actual app scheduler with recorded canvas calls. Pixel output
// is covered by renderer-core tests; this checks drafts, coalescing and fallback.
for (const useWorker of [true, false]) test(`preview refines after touch (${useWorker ? 'worker' : 'main-thread fallback'})`, async () => {
  const browser = new Window({ url: 'http://localhost:5173', width: 390, height: 844 });
  for (const name of ['window', 'document', 'localStorage', 'navigator', 'Image', 'CustomEvent', 'CSS']) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? browser : browser[name] });
  }
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  // All queried comma lists start with the width clause used by this phone.
  browser.matchMedia = (query) => nativeMatchMedia(query.split(',')[0]);
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(0, 0, 180, 120);
  document.body.innerHTML = (await readFile(new URL('../index.html', import.meta.url), 'utf8')).match(/<body>([\s\S]*)<\/body>/)[1];
  const paints = [];
  const contexts = new WeakMap();
  browser.HTMLCanvasElement.prototype.getContext = function(type) {
    if (type !== '2d') return null;
    if (!contexts.has(this)) contexts.set(this, {
      clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, save() {}, restore() {},
      drawImage: (source) => {
        if (this.id === 'previewCanvas') paints.push([source.width, source.height]);
      },
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(128) })
    });
    return contexts.get(this);
  };
  globalThis.Image = class {
    width = 360; height = 240; naturalWidth = 360; naturalHeight = 240;
    set src(value) { queueMicrotask(() => this.onload?.()); }
  };
  const jobs = [];
  class FakeWorker extends browser.EventTarget {
    postMessage(job) { jobs.push(job); }
    terminate() {}
    complete() {
      const job = jobs.shift();
      assert.ok(job);
      this.dispatchEvent(new browser.MessageEvent('message', { data: {
        type: 'rendered', requestId: job.requestId,
        bitmap: { width: job.width, height: job.height, close() {} }
      } }));
    }
  }
  let worker;
  globalThis.Worker = browser.Worker = useWorker ? class extends FakeWorker { constructor() { super(); worker = this; } } : undefined;
  browser.OffscreenCanvas = useWorker ? class {} : undefined;
  globalThis.createImageBitmap = browser.createImageBitmap = async (canvas) => ({ width: canvas.width, height: canvas.height, close() {} });
  const waitUntil = async (condition) => {
    for (let attempt = 0; attempt < 200 && !condition(); attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(condition(), 'preview work completed');
  };
  try {
    await import(`../script.js?preview-test=${useWorker}`);
    const studio = browser.halftoneStudio;
    assert.ok(studio);
    if (useWorker) { await waitUntil(() => jobs.length); worker.complete(); }
    await waitUntil(() => paints.length);
    const full = paints.at(-1);
    studio.setPreviewInteraction(true);
    studio.setSetting('contrast', 1.4);
    if (useWorker) {
      await waitUntil(() => jobs.length);
      studio.setSetting('contrast', 1.6); // newer value while one draft is busy
      worker.complete();
      assert.ok(paints.at(-1)[0] < full[0]); // completed draft was still shown
      await waitUntil(() => jobs.length);
      studio.setPreviewInteraction(false);
      const before = paints.length;
      worker.complete();
      assert.equal(paints.length, before); // late draft cannot replace final view
      await waitUntil(() => jobs.length);
      assert.equal(jobs[0].width, full[0]);
      assert.equal(jobs[0].settings.contrast, 1.6);
      worker.complete();
    } else {
      await waitUntil(() => paints.at(-1)[0] < full[0]);
      studio.setSetting('contrast', 1.6);
      studio.setPreviewInteraction(false);
      await waitUntil(() => paints.at(-1)[0] === full[0]);
    }
    assert.deepEqual(paints.at(-1), full);
    assert.equal(studio.getState().settings.contrast, 1.6);
    // Invalidate the deferred export-size estimate before disposing the DOM.
    studio.setPreviewInteraction(true);
    await browser.happyDOM.abort();
  } finally {
    await browser.happyDOM.abort();
    browser.close();
  }
});
