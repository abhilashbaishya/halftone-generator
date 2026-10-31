import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_FPS, MOTION_FRAME_COUNT, MOTION_TRAVEL, clampMotionFps, motionPhase } from '../src/motion-loop.js';

test('motion travels out, eases through the turn, and returns to the still frame', () => {
  const half = MOTION_FRAME_COUNT / 2;
  assert.equal(motionPhase(0), 0);
  assert.equal(motionPhase(half), MOTION_TRAVEL);
  assert.ok(Math.abs(motionPhase(MOTION_FRAME_COUNT)) < 1e-12);
  assert.ok(Math.abs(motionPhase(half / 2) - MOTION_TRAVEL / 2) < 1e-12);
  assert.ok(Math.abs(motionPhase(half / 2) - motionPhase(half * 1.5)) < 1e-12);
  assert.ok(Number.isInteger(MOTION_TRAVEL), 'the far turn lands on the same screen');
});

test('each frame steps far enough to see but short of strobing', () => {
  let fastest = 0;
  for (let frame = 0; frame < MOTION_FRAME_COUNT; frame++) {
    fastest = Math.max(fastest, Math.abs(motionPhase(frame + 1) - motionPhase(frame)));
  }
  assert.ok(fastest > .25, 'clearly faster than the old 1/12-cell step');
  assert.ok(fastest < .45, 'dots never jump near half a cell');
  // The turn eases instead of reversing at full speed.
  assert.ok(Math.abs(motionPhase(MOTION_FRAME_COUNT / 2 + 1) - MOTION_TRAVEL) < fastest / 2);
});

test('speed stays inside the preview range', () => {
  assert.equal(clampMotionFps(8), 8);
  assert.equal(clampMotionFps(1), MOTION_FPS.min);
  assert.equal(clampMotionFps(40), MOTION_FPS.max);
  assert.equal(clampMotionFps('nope'), MOTION_FPS.default);
});
