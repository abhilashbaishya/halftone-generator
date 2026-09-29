import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditHistory } from '../src/edit-history.js';

test('a continuous drag is one step, including a final pointerup sample', () => {
  const h = createEditHistory({ cell: 5 });
  h.begin();
  for (const cell of [6, 7, 8, 9]) h.record({ cell });
  assert.equal(h.getState().canUndo, true);
  h.end();
  assert.deepEqual(h.undo(), { cell: 5 });
  assert.equal(h.getState().canUndo, false);
  assert.deepEqual(h.redo(), { cell: 9 });
});

test('no-op gestures preserve redo; new edits replace the redo branch', () => {
  const h = createEditHistory(0);
  h.record(1); h.undo();
  h.begin(); h.record(2); h.record(0); h.end();
  assert.equal(h.getState().canRedo, true);
  assert.equal(h.redo(), 1);
  h.undo(); h.record(3);
  assert.equal(h.redo(), null);
  assert.equal(h.undo(), 0);
});

test('history owns snapshots, has a bound, and reset clears an active gesture', () => {
  const h = createEditHistory({ n: 0 }, 2);
  const value = { n: 1 };
  h.record(value); value.n = 500;
  h.record({ n: 2 }); h.record({ n: 3 });
  assert.deepEqual(h.undo(), { n: 2 });
  const restored = h.undo();
  assert.deepEqual(restored, { n: 1 });
  restored.n = 900;
  assert.equal(h.undo(), null);
  assert.deepEqual(h.redo(), { n: 2 });
  h.begin(); h.record({ n: 4 }); h.reset({ n: 5 }); h.end();
  assert.deepEqual(h.getState(), { canUndo: false, canRedo: false });
});
