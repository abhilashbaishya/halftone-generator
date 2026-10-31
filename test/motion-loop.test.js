import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTION_FPS, MOTION_FRAME_COUNT, MOTION_STRENGTH,
  clampMotionFps, clampMotionStrength, motionWave, toneCurveAt
} from '../src/motion-loop.js';

const at = (frame, px, py, strength = MOTION_STRENGTH.default) =>
  toneCurveAt({ toneCurve: 1, wave: motionWave(frame, strength) }, px, py, 400, 300);

test('the wave varies across the image and rolls toward the bottom right', () => {
  assert.notEqual(at(0, -150, -150), at(0, 150, 150));
  // Find where the crest (smallest exponent, biggest dots) sits on the diagonal.
  const crest = (frame) => {
    let best = 0;
    for (let d = -100; d <= 100; d++) if (at(frame, d, d) < at(frame, best, best)) best = d;
    return best;
  };
  assert.ok(crest(1) > crest(0), 'the crest moves along the diagonal');
});

test('the last frame leads back into the first without a seam', () => {
  for (const [px, py] of [[-180, -120], [0, 0], [90, -40], [200, 150]]) {
    assert.ok(Math.abs(at(MOTION_FRAME_COUNT, px, py) - at(0, px, py)) < 1e-12);
  }
});

test('zero strength and no wave leave the tone curve alone', () => {
  for (let frame = 0; frame < MOTION_FRAME_COUNT; frame++) assert.equal(at(frame, 120, -60, 0), 1);
  assert.equal(toneCurveAt({ toneCurve: 1.3 }, 50, 50, 400, 300), 1.3);
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
