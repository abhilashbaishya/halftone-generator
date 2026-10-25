import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_FPS, clampMotionFps, motionPhase } from '../src/motion-loop.js';

test('motion leaves and returns to the still frame', () => {
  assert.equal(motionPhase(0), 0);
  assert.equal(motionPhase(12), 1);
  assert.equal(motionPhase(24), 0);
  assert.equal(motionPhase(6), 0.5);
  assert.equal(motionPhase(18), 0.5);
  assert.ok(motionPhase(23) < motionPhase(0) + 0.1);
});

test('speed stays inside the preview range', () => {
  assert.equal(clampMotionFps(8), 8);
  assert.equal(clampMotionFps(1), MOTION_FPS.min);
  assert.equal(clampMotionFps(40), MOTION_FPS.max);
  assert.equal(clampMotionFps('nope'), MOTION_FPS.default);
});
