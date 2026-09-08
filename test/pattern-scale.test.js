import test from 'node:test';
import assert from 'node:assert/strict';
import { getImageCellSize } from '../src/pattern-scale.js';
import { getPreviewRenderPlan } from '../src/preview-policy.js';

test('pattern density survives viewport, DPR, rotation and export size changes', () => {
  for (const cellSize of [3, 4, 5, 7, 9, 14, 20]) {
    const screens = [[320, 480], [640, 960], [1280, 1920], [1920, 1280], [4000, 6000]];
    const densities = screens.map(([w, h]) => Math.max(w, h) / getImageCellSize(cellSize, w, h));
    for (const density of densities) assert.ok(Math.abs(density - 1000 / cellSize) < 1e-9);
  }
});

test('draft refinement preserves normalized density even when cells become subpixel', () => {
  const width = 300, height = 450;
  const settings = { cellSize: getImageCellSize(3, width, height) };
  const draft = getPreviewRenderPlan(width, height, settings, true);
  assert.ok(draft.settings.cellSize < 1);
  assert.ok(Math.abs(draft.width / draft.settings.cellSize - width / settings.cellSize) < 1e-9);
});
