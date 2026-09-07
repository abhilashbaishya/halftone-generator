import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWebpInWorker } from '../src/webp-client.js';

for (const cancel of [false, true]) test(`WebP encoding worker ${cancel ? 'terminates on cancel' : 'returns its encoded result'}`, async () => {
  let worker;
  const original = globalThis.Worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  };
  try {
    const controller = new AbortController();
    const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    const result = encodeWebpInWorker(pixels, .9, controller.signal);
    assert.equal(worker.message.quality, .9);
    if (cancel) {
      controller.abort();
      await assert.rejects(result, { name: 'AbortError' });
    } else {
      const blob = new Blob(['encoded'], { type: 'image/webp' });
      worker.onmessage({ data: { blob } });
      assert.equal(await result, blob);
    }
    assert.equal(worker.terminated, true);
  } finally { globalThis.Worker = original; }
});
