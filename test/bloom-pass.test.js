import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { BloomPass } from '../bloom-pass.js';

globalThis.document = { createElement: () => createCanvas(1, 1) };

test('bloom retains cutout alpha including translucent edges', () => {
  const source = createCanvas(64, 64);
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(24, 24, 16, 16);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(20, 20, 4, 24);
  const before = ctx.getImageData(0, 0, 64, 64).data;
  const bloom = new BloomPass();
  const after = bloom.apply(source, 1).getContext('2d').getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < before.length; i += 4) assert.equal(after[i], before[i]);
  bloom.release();
});

test('bloom on opaque images matches the existing screen blend', () => {
  const source = createCanvas(64, 64);
  const ctx = source.getContext('2d');
  ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff'; ctx.fillRect(24, 24, 16, 16);
  const expected = createCanvas(64, 64).getContext('2d');
  expected.drawImage(source, 0, 0);
  expected.filter = 'blur(2px)';
  expected.globalCompositeOperation = 'screen';
  expected.globalAlpha = .7;
  expected.drawImage(source, 0, 0);
  const bloom = new BloomPass();
  const actual = bloom.apply(source, 1).getContext('2d').getImageData(0, 0, 64, 64).data;
  assert.deepEqual(actual, expected.getImageData(0, 0, 64, 64).data);
  bloom.release();
});
