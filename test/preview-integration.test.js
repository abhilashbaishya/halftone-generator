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
  let layoutReads = 0;
  browser.HTMLElement.prototype.getBoundingClientRect = () => {
    layoutReads++;
    return new browser.DOMRect(0, 0, 180, 120);
  };
  const captured = new WeakMap();
  browser.HTMLElement.prototype.setPointerCapture = function(id) { captured.set(this, id); };
  browser.HTMLElement.prototype.hasPointerCapture = function(id) { return captured.get(this) === id; };
  browser.HTMLElement.prototype.releasePointerCapture = function() { captured.delete(this); };
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
    const readsBeforeDrag = layoutReads;
    studio.setPreviewInteraction(true);
    studio.setSetting('contrast', 1.4);
    studio.setSetting('jitter', 32);
    studio.setSetting('microDot', 38);
    studio.shuffleTexture();
    const textureSeed = studio.getState().settings.seed;
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
      assert.equal(jobs[0].settings.jitter, .32);
      assert.equal(jobs[0].settings.microDotAmount, .38);
      assert.equal(jobs[0].settings.seed, textureSeed);
      worker.complete();
    } else {
      await waitUntil(() => paints.at(-1)[0] < full[0]);
      studio.setSetting('contrast', 1.6);
      studio.setPreviewInteraction(false);
      await waitUntil(() => paints.at(-1)[0] === full[0]);
    }
    assert.deepEqual(paints.at(-1), full);
    assert.equal(studio.getState().settings.contrast, 1.6);
    assert.equal(layoutReads, readsBeforeDrag, 'slider rendering reuses fitted geometry');
    const handle = document.getElementById('splitHandle');
    const overlay = document.getElementById('halftoneOverlay');
    const pointer = (target, type, x, y, id = 1) => target.dispatchEvent(new browser.PointerEvent(type, {
      pointerType: 'touch', pointerId: id, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true
    }));
    assert.equal(handle.getAttribute('aria-valuenow'), '50');
    const sheet = document.createElement('div');
    sheet.className = 'studio-phone-sheet';
    document.body.append(sheet);
    pointer(handle, 'pointerdown', 110, 40);
    assert.equal(handle.hasPointerCapture(1), false);
    assert.equal(handle.getAttribute('aria-valuenow'), '50');
    sheet.classList.add('studio-phone-sheet-exit');
    pointer(handle, 'pointerdown', 110, 40);
    assert.equal(handle.hasPointerCapture(1), true);
    pointer(document, 'pointercancel', 110, 40);
    assert.equal(handle.hasPointerCapture(1), false);
    sheet.remove();
    pointer(handle, 'pointerdown', 110, 40); // grab 20px right of the divider
    assert.ok(handle.hasPointerCapture(1));
    pointer(document, 'pointermove', 112, 42);
    assert.equal(handle.getAttribute('aria-valuenow'), '50');
    pointer(document, 'pointermove', 128, 44); // move 18px, or 10% of the image
    assert.equal(handle.getAttribute('aria-valuenow'), '60');
    assert.equal(overlay.style.clipPath, 'inset(0 40% 0 0)');
    pointer(handle, 'pointerdown', 10, 10, 2); // a second finger cannot steal the drag
    pointer(document, 'pointermove', 20, 10, 2);
    assert.equal(handle.getAttribute('aria-valuenow'), '60');
    pointer(document, 'pointermove', 220, 100); // locked drag survives vertical drift
    assert.equal(handle.getAttribute('aria-valuenow'), '100');
    pointer(document, 'pointercancel', 220, 100);
    assert.equal(handle.hasPointerCapture(1), false);
    pointer(document, 'pointermove', 0, 0);
    assert.equal(handle.getAttribute('aria-valuenow'), '100');
    pointer(handle, 'pointerdown', 170, 40);
    pointer(document, 'pointermove', 178, 49); // diagonal scrolling leaves comparison alone
    assert.equal(handle.hasPointerCapture(1), false);
    assert.equal(handle.getAttribute('aria-valuenow'), '100');
    pointer(handle, 'pointerdown', 170, 40);
    handle.releasePointerCapture(1);
    pointer(handle, 'lostpointercapture', 170, 40);
    pointer(document, 'pointermove', 0, 40);
    assert.equal(handle.getAttribute('aria-valuenow'), '100');
    pointer(handle, 'pointerdown', 170, 40);
    browser.dispatchEvent(new browser.Event('blur'));
    assert.equal(handle.hasPointerCapture(1), false);
    // Invalidate the deferred export-size estimate before disposing the DOM.
    studio.setPreviewInteraction(true);
    await browser.happyDOM.abort();
  } finally {
    await browser.happyDOM.abort();
    browser.close();
  }
});
