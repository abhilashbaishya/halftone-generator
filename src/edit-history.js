// Settings only: no image bytes, saved-preset mutations, or persisted history.
export function createEditHistory(initial, limit = 50) {
  let current = structuredClone(initial);
  let past = [], future = [], start = null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const push = (value) => { past.push(value); if (past.length > limit) past.shift(); };
  const end = () => {
    if (start !== null && !same(start, current)) { push(start); future = []; }
    start = null;
  };
  return {
    getState: () => ({
      canUndo: past.length > 0 || (start !== null && !same(start, current)),
      canRedo: future.length > 0 && (start === null || same(start, current))
    }),
    record(value) {
      if (same(value, current)) return;
      if (start === null) { push(current); future = []; }
      current = structuredClone(value);
    },
    begin() { if (start === null) start = structuredClone(current); },
    end,
    undo() {
      end();
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return structuredClone(current);
    },
    redo() {
      end();
      if (!future.length) return null;
      push(current);
      current = future.pop();
      return structuredClone(current);
    },
    reset(value) { current = structuredClone(value); past = []; future = []; start = null; }
  };
}
