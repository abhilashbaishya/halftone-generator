import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_FPS, MOTION_FRAME_COUNT, MOTION_TRAVEL, clampMotionFps, motionPhase } from '../src/motion-loop.js';

test('the drift runs one way at a steady pace and wraps onto the starting screen', () => {
  const step = MOTION_TRAVEL / MOTION_FRAME_COUNT;
  assert.equal(motionPhase(0), 0);
  for (let frame = 1; frame < MOTION_FRAME_COUNT; frame++) {
    assert.ok(Math.abs(motionPhase(frame) - motionPhase(frame - 1) - step) < 1e-12, `frame ${frame} keeps pace`);
  }
  assert.equal(motionPhase(MOTION_FRAME_COUNT), 0);
  assert.equal(motionPhase(-1), motionPhase(MOTION_FRAME_COUNT - 1));
  // The last frame's next step reaches a whole number of cells: the same screen.
  assert.ok(Number.isInteger(motionPhase(MOTION_FRAME_COUNT - 1) + step));
});

test('preview steps stay short of strobing even when renders skip frames', () => {
  // A full-resolution preview renders at about 8 fps on large canvases.
  const cellsPerSecond = MOTION_FPS.max * MOTION_TRAVEL / MOTION_FRAME_COUNT;
  assert.ok(cellsPerSecond / 8 < .45);
});

test('speed stays inside the loop range', () => {
  assert.equal(clampMotionFps(16), 16);
  assert.equal(clampMotionFps(1), MOTION_FPS.min);
  assert.equal(clampMotionFps(90), MOTION_FPS.max);
  assert.equal(clampMotionFps('nope'), MOTION_FPS.default);
});
