import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviewRenderPlan, shouldPresentPreview } from '../src/preview-policy.js';

test('drag previews bound pixel work while preserving apparent dot spacing', () => {
  const settings = { cellSize: 8, contrast: 1.1, ink: '#111' };
  const draft = getPreviewRenderPlan(780, 520, settings, true);
  assert.ok(draft.width * draft.height <= 180_000);
  assert.ok(draft.width < 780);
  assert.equal(draft.width / draft.settings.cellSize, 780 / settings.cellSize);
  const final = getPreviewRenderPlan(780, 520, settings, false);
  assert.equal(final.width, 780);
  assert.equal(final.height, 520);
  assert.deepEqual(final.settings, settings);
});

test('continuous dragging displays completed drafts instead of starving the preview', () => {
  const draft = { generation: 2, draft: true };
  assert.equal(shouldPresentPreview(draft, 2, true, true), true);
  assert.equal(shouldPresentPreview(draft, 3, true, false), false);
  assert.equal(shouldPresentPreview({ generation: 3, draft: false }, 3, false, false), true);
  assert.equal(shouldPresentPreview({ generation: 3, draft: false }, 3, true, false), false);
});
