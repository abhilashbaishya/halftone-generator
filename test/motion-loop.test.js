import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_FPS, MOTION_FRAME_COUNT, MOTION_STRENGTH, clampMotionFps, clampMotionStrength, motionPulse } from '../src/motion-loop.js';

test('pulse starts still, breathes both ways, and loops without a seam', () => {
  const strength = MOTION_STRENGTH.default;
  assert.equal(motionPulse(0, strength), 1);
  assert.ok(Math.abs(motionPulse(MOTION_FRAME_COUNT, strength) - 1) < 1e-12);
  const quarter = MOTION_FRAME_COUNT / 4;
  // A smaller tone-curve exponent darkens every tone, so dots swell.
  const swell = motionPulse(quarter, strength), shrink = motionPulse(quarter * 3, strength);
  assert.ok(swell < 1 && shrink > 1);
  assert.ok(Math.abs(swell * shrink - 1) < 1e-12, 'the two extremes mirror each other');
  for (let frame = 0; frame < MOTION_FRAME_COUNT; frame++) {
    assert.ok(Math.abs(motionPulse(frame, strength) - motionPulse(frame + MOTION_FRAME_COUNT, strength)) < 1e-12);
  }
});

test('strength scales the breath and zero holds the still frame', () => {
  for (let frame = 0; frame < MOTION_FRAME_COUNT; frame++) assert.equal(motionPulse(frame, 0), 1);
  const quarter = MOTION_FRAME_COUNT / 4;
  assert.ok(motionPulse(quarter, 100) < motionPulse(quarter, 40));
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
