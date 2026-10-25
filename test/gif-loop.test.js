import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLoopGif, gifFrameDelay } from '../src/gif-loop.js';

test('loop delay follows the motion speed', () => {
  assert.equal(gifFrameDelay(8), 125);
  assert.equal(gifFrameDelay(4), 250);
  assert.equal(gifFrameDelay(100), 20);
});

test('a GIF loop repeats and keeps each frame', () => {
  const frame = (red, green, blue) => {
    const pixels = new Uint8Array(2 * 2 * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = 255;
    }
    return pixels;
  };
  const bytes = encodeLoopGif([frame(180, 20, 20), frame(20, 20, 180)], 2, 2, 125);
  const text = Buffer.from(bytes).toString('latin1');
  assert.equal(text.slice(0, 6), 'GIF89a');
  assert.ok(text.includes('NETSCAPE2.0'), 'the GIF loops');
  assert.ok(bytes.length > 30);
});
