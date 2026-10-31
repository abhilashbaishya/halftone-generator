import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION_FPS, MOTION_FRAME_COUNT, MOTION_STRENGTH,
  clampMotionFps, clampMotionStrength, createMotionField, motionWave
} from '../src/motion-loop.js';

const width = 400, height = 300;
const field = (frame, strength = MOTION_STRENGTH.default) =>
  createMotionField({ toneCurve: 1, cellSize: 8, wave: motionWave(frame, strength) }, width, height);
const read = (motion, x, y) => {
  motion.sample(x, y);
  return [motion.curve, motion.dx, motion.dy];
};
const points = [[20, 30], [200, 150], [330, 60], [90, 270], [380, 290]];

test('crossing waves swell and sway dots differently across the image', () => {
  const motion = field(0);
  const samples = points.map(([x, y]) => read(motion, x, y));
  assert.ok(samples.some(([curve]) => curve < 1) && samples.some(([curve]) => curve > 1));
  assert.ok(samples.some(([, dx, dy]) => Math.hypot(dx, dy) > 1), 'dots sway by pixels');
  assert.ok(samples.every(([, dx, dy]) => Math.hypot(dx, dy) < 8), 'sway stays inside one cell');
});

test('the motion is not a single band sliding in one direction', () => {
  // A lone travelling wave would look identical when shifted along its path.
  // Crossing waves change shape as they move, so no shift reproduces a frame.
  const now = field(0), later = field(3);
  for (const shift of [-60, -30, 30, 60]) {
    const diff = points.reduce((sum, [x, y]) => sum + Math.abs(read(later, x + shift, y + shift)[0] - read(now, x, y)[0]), 0);
    assert.ok(diff > .05, `shift ${shift}`);
  }
});

test('the last frame leads back into the first without a seam', () => {
  const first = field(0), wrapped = field(MOTION_FRAME_COUNT);
  for (const [x, y] of points) {
    read(first, x, y).forEach((value, index) => assert.ok(Math.abs(read(wrapped, x, y)[index] - value) < 1e-5));
  }
});

test('zero strength and no wave leave the screen still', () => {
  for (const motion of [field(5, 0), createMotionField({ toneCurve: 1.3, cellSize: 8 }, width, height)]) {
    for (const [x, y] of points) {
      const [curve, dx, dy] = read(motion, x, y);
      assert.ok(curve === 1 || curve === 1.3);
      assert.equal(dx, 0);
      assert.equal(dy, 0);
    }
  }
});

test('speed and strength stay inside their ranges', () => {
  assert.equal(clampMotionFps(8), 8);
  assert.equal(clampMotionFps(1), MOTION_FPS.min);
  assert.equal(clampMotionFps(40), MOTION_FPS.max);
  assert.equal(clampMotionFps('nope'), MOTION_FPS.default);
  assert.equal(clampMotionStrength(55), 55);
  assert.equal(clampMotionStrength(-5), MOTION_STRENGTH.min);
  assert.equal(clampMotionStrength(250), MOTION_STRENGTH.max);
  assert.equal(clampMotionStrength(undefined), MOTION_STRENGTH.default);
});
