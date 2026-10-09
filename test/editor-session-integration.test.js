import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { EDITOR_SESSION_KEY } from '../src/editor-session.js';

let boot = 0;
async function openEditor(stored = {}) {
  const browser = new Window({ url: 'http://localhost:5173', width: 1440, height: 1000 });
  for (const name of ['window', 'document', 'localStorage', 'navigator', 'Image', 'CustomEvent', 'CSS']) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? browser : browser[name] });
  }
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(0, 0, 180, 120);
  document.body.innerHTML = (await readFile(new URL('../index.html', import.meta.url), 'utf8')).match(/<body>([\s\S]*)<\/body>/)[1];
  browser.HTMLCanvasElement.prototype.getContext = (type) => type !== '2d' ? null : ({
    clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, drawImage() {},
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData() {},
      getImageData: (_x, _y, width, height) => ({ data: new Uint8ClampedArray(width * height * 4).fill(128) })
  });
  globalThis.Image = class {
    width = 180; height = 120; naturalWidth = 180; naturalHeight = 120;
    set src(value) { queueMicrotask(() => this.onload?.()); }
  };
  globalThis.Worker = browser.Worker = undefined;
  for (const [key, value] of Object.entries(stored)) browser.localStorage.setItem(key, value);
  await import(`../script.js?editor-session=${++boot}`);
  return {
    browser, studio: browser.halftoneStudio,
    async close() {
      browser.dispatchEvent(new browser.Event('pagehide'));
      const storage = {};
      for (let index = 0; index < browser.localStorage.length; index++) {
        const key = browser.localStorage.key(index);
        storage[key] = browser.localStorage.getItem(key);
      }
      await browser.happyDOM.abort();
      browser.close();
      return storage;
    }
  };
}

test('refresh restores unsaved edits and texture; presets save and revert the same variation', async () => {
  let editor = await openEditor();
  editor.studio.selectPreset('orange');
  editor.studio.setSetting('contrast', 1.55);
  editor.studio.setSetting('inkColor', '#2455aa');
  editor.studio.setSetting('jitter', 32);
  editor.studio.setSetting('microDot', 38);
  editor.studio.setSetting('quality', 'print');
  const originalSeed = editor.studio.getState().settings.seed;
  editor.studio.shuffleTexture();
  const edited = editor.studio.getState();
  assert.notEqual(edited.settings.seed, originalSeed);
  assert.equal(edited.presetModified, true);
  let storage = await editor.close();
  const grainSeed = JSON.parse(storage[EDITOR_SESSION_KEY]).grainSeed;
  editor = await openEditor(storage);
  assert.equal(editor.studio.getState().selectedPreset, 'orange');
  assert.deepEqual(editor.studio.getState().settings, edited.settings);
  assert.equal(editor.studio.getState().presetModified, true);
  assert.equal(editor.browser.document.getElementById('splitHandle').getAttribute('aria-valuenow'), '50');
  assert.equal(editor.browser.document.getElementById('zoomRange').getAttribute('aria-valuenow'), '100');
  assert.equal(editor.studio.savePreset('My texture').ok, true);
  editor.studio.shuffleTexture();
  assert.equal(editor.studio.getState().presetModified, true);
  editor.studio.revertPreset();
  assert.deepEqual(editor.studio.getState().settings, edited.settings);
  assert.equal(editor.studio.getState().presetModified, false);
  storage = await editor.close();
  assert.equal(JSON.parse(storage[EDITOR_SESSION_KEY]).grainSeed, grainSeed);
  editor = await openEditor(storage);
  assert.equal(editor.studio.getState().selectedPreset, 'My texture');
  assert.equal(editor.studio.getState().presetModified, false);
  assert.deepEqual(editor.studio.getState().settings, edited.settings);
  editor.studio.selectPreset('red');
  const clean = editor.studio.getState();
  editor.studio.shuffleTexture();
  assert.deepEqual(editor.studio.getState().settings, clean.settings, 'shuffle is a no-op without texture');
  assert.equal(clean.settings.jitter, 0);
  assert.equal(clean.settings.microDot, 0);
  await editor.close();
});

test('invalid sessions fall back safely and stored values are bounded before rendering', async () => {
  for (const entry of ['{broken', JSON.stringify({ version: 1, settings: {} }), JSON.stringify({ version: 99 })]) {
    const editor = await openEditor({ [EDITOR_SESSION_KEY]: entry });
    assert.equal(editor.studio.getState().selectedPreset, 'red');
    assert.equal(editor.studio.getState().presetModified, false);
    await editor.close();
  }
  let editor = await openEditor();
  const settings = { ...editor.studio.getState().settings, jitter: 5000, microDot: -20, contrast: 100, grainStrength: -100 };
  await editor.close();
  editor = await openEditor({ [EDITOR_SESSION_KEY]: JSON.stringify({ version: 1, selectedPreset: 'Deleted preset', settings }) });
  assert.equal(editor.studio.getState().selectedPreset, 'red');
  assert.equal(editor.studio.getState().settings.jitter, 50);
  assert.equal(editor.studio.getState().settings.microDot, 0);
  assert.equal(editor.studio.getState().settings.contrast, 2.5);
  assert.equal(editor.studio.getState().settings.grainStrength, 0);
  editor.studio.setSetting('jitter', NaN);
  assert.equal(editor.studio.getState().settings.jitter, 50);
  await editor.close();
});

test('presets commit only after storage succeeds, and duplicate names require explicit Update', async () => {
  const editor = await openEditor();
  const { browser, studio } = editor;
  const storage = browser.localStorage;
  const blockWrites = () => Object.defineProperty(browser, 'localStorage', { configurable: true, value: {
    getItem: storage.getItem.bind(storage),
    setItem() { throw new Error('QuotaExceededError'); }
  } });
  const allowWrites = () => Object.defineProperty(browser, 'localStorage', { configurable: true, value: storage });
  try {
    studio.setSetting('contrast', 1.5);
    blockWrites();
    assert.equal(studio.savePreset('My print').ok, false);
    assert.equal(studio.getState().selectedPreset, 'red');
    assert.equal(studio.getState().presetModified, true);
    assert.ok(!studio.getState().presets.some(({ value }) => value === 'My print'));
    assert.equal(storage.getItem('halftone.customPresets.v1'), null);

    allowWrites();
    assert.equal(studio.savePreset('My print').ok, true);
    const saved = storage.getItem('halftone.customPresets.v1');
    studio.setSetting('contrast', 2);
    blockWrites();
    assert.equal(studio.updatePreset().ok, false);
    assert.equal(studio.getState().presetModified, true);
    assert.equal(storage.getItem('halftone.customPresets.v1'), saved);
    studio.revertPreset();
    assert.equal(studio.getState().settings.contrast, 1.5, 'failed Update cannot change the in-memory saved preset');
    browser.confirm = () => true;
    assert.equal(studio.deletePreset().ok, false);
    assert.equal(studio.getState().selectedPreset, 'My print');

    allowWrites();
    studio.selectPreset('red');
    studio.setSetting('contrast', 2);
    for (const name of ['My print', ' my PRINT ']) {
      const result = studio.savePreset(name);
      assert.equal(result.ok, false);
      assert.equal(result.field, 'name');
      assert.equal(storage.getItem('halftone.customPresets.v1'), saved);
    }
    studio.selectPreset('My print');
    studio.setSetting('contrast', 2);
    assert.equal(studio.updatePreset().ok, true);
    assert.equal(studio.getState().presetModified, false);
    assert.equal(JSON.parse(storage.getItem('halftone.customPresets.v1'))['My print'].contrast, 2);
  } finally {
    allowWrites();
    await editor.close();
  }
});

test('preview drops use upload validation and preserve the current treatment', async () => {
  const editor = await openEditor();
  const { browser, studio } = editor;
  const drop = (files) => {
    const event = new browser.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } });
    browser.document.getElementById('previewCanvas').dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  try {
    await settle();
    studio.selectPreset('orange');
    studio.setSetting('contrast', 1.55);
    const settings = studio.getState().settings;
    // A misleading MIME type must not bypass inspection.
    drop([new File(['not an image file'], 'invalid.png', { type: 'image/png' })]);
    await settle();
    assert.match(studio.getState().uploadError, /isn’t supported/);
    assert.equal(studio.getState().hasUserImage, false);
    const image = new File([await readFile(new URL('../placeholder.jpg', import.meta.url))], 'photo.jpg');
    drop([image]);
    await settle();
    assert.equal(studio.getState().hasUserImage, true);
    assert.equal(studio.getState().uploadError, '');
    assert.equal(studio.getState().selectedPreset, 'orange');
    assert.deepEqual(studio.getState().settings, settings);
    drop([image, image]);
    assert.match(studio.getState().uploadError, /one image at a time/);
    assert.equal(studio.getState().hasUserImage, true);
    assert.deepEqual(studio.getState().settings, settings);
  } finally {
    await editor.close();
  }
});

test('old transparent-paper sessions restore the preset without the retired override', async () => {
  let editor = await openEditor();
  editor.studio.selectPreset('orange');
  const settings = editor.studio.getState().settings;
  const stored = await editor.close();
  const saved = JSON.parse(stored[EDITOR_SESSION_KEY]);
  saved.transparentPaper = true;
  stored[EDITOR_SESSION_KEY] = JSON.stringify(saved);
  editor = await openEditor(stored);
  assert.deepEqual(editor.studio.getState().settings, settings);
  assert.equal(editor.studio.getState().presetModified, false);
  assert.equal('transparentPaper' in editor.studio.getState(), false);
  const updated = await editor.close();
  assert.equal('transparentPaper' in JSON.parse(updated[EDITOR_SESSION_KEY]), false);
});

test('desktop history restores edits, preset selection, and Revert as complete steps', async () => {
  const editor = await openEditor();
  const { studio } = editor;
  await new Promise((resolve) => setTimeout(resolve, 20));
  studio.setHistoryEnabled(true);
  const original = studio.getState();
  studio.beginEdit();
  studio.setSetting('cellSize', 6);
  studio.setSetting('cellSize', 7);
  studio.setSetting('cellSize', 9);
  studio.endEdit();
  studio.undo();
  assert.deepEqual(studio.getState().settings, original.settings);
  assert.equal(studio.getState().history.canUndo, false);
  studio.redo();
  assert.equal(studio.getState().settings.cellSize, 9);
  studio.setSetting('inkColor', '#123456');
  const edited = studio.getState();
  studio.selectPreset('orange');
  studio.undo();
  assert.equal(studio.getState().selectedPreset, original.selectedPreset);
  assert.deepEqual(studio.getState().settings, edited.settings);
  assert.equal(studio.getState().presetModified, true);
  studio.revertPreset();
  assert.equal(studio.getState().presetModified, false);
  studio.undo();
  assert.deepEqual(studio.getState().settings, edited.settings);
  studio.setHistoryEnabled(false);
  studio.setSetting('cellSize', 12);
  studio.undo();
  assert.equal(studio.getState().settings.cellSize, 12, 'disabled history does not undo edits');
  studio.setHistoryEnabled(true);
  assert.deepEqual(studio.getState().history, { canUndo: false, canRedo: false });
  await editor.close();
});

test('history clears on successful image replacement and saved-preset changes', async () => {
  const editor = await openEditor();
  const { studio } = editor;
  await new Promise((resolve) => setTimeout(resolve, 20));
  studio.setHistoryEnabled(true);
  studio.setSetting('contrast', 1.6);
  assert.equal(studio.getState().history.canUndo, true);
  const image = new File([await readFile(new URL('../placeholder.jpg', import.meta.url))], 'photo.jpg');
  studio.openImageFile(image);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(studio.getState().hasUserImage, true);
  assert.deepEqual(studio.getState().history, { canUndo: false, canRedo: false });
  assert.equal(studio.getState().settings.contrast, 1.6);
  studio.setSetting('gamma', 1.7);
  assert.equal(studio.savePreset('History test').ok, true);
  assert.deepEqual(studio.getState().history, { canUndo: false, canRedo: false });
  await editor.close();
});

test('failed uploads and failed preset saves retain history; refresh starts a new history', async () => {
  let editor = await openEditor();
  await new Promise((resolve) => setTimeout(resolve, 20));
  let { studio, browser } = editor;
  studio.setHistoryEnabled(true);
  studio.setSetting('contrast', 1.6);
  studio.openImageFile(new File(['invalid'], 'photo.png', { type: 'image/png' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(studio.getState().history.canUndo, true);
  const storage = browser.localStorage;
  Object.defineProperty(browser, 'localStorage', { configurable: true, value: {
    getItem: storage.getItem.bind(storage), setItem() { throw new Error('Storage full'); }
  } });
  assert.equal(studio.savePreset('Cannot save').ok, false);
  assert.equal(studio.getState().history.canUndo, true);
  Object.defineProperty(browser, 'localStorage', { configurable: true, value: storage });
  const saved = await editor.close();
  editor = await openEditor(saved);
  editor.studio.setHistoryEnabled(true);
  assert.equal(editor.studio.getState().settings.contrast, 1.6);
  assert.deepEqual(editor.studio.getState().history, { canUndo: false, canRedo: false });
  await editor.close();
});

test('preset import persists a copy, applies it, and leaves the uploaded image alone', async () => {
  const { serializePreset } = await import('../src/preset-transfer.js');
  const editor = await openEditor();
  const { studio } = editor;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const original = studio.getState();
  const file = serializePreset('Soft Print', { ...original.settings, inkColor: '#123456' });
  const input = { size: file.text.length, text: async () => file.text };
  assert.deepEqual(await studio.importPreset(input), { ok: true, name: 'Soft Print (2)' });
  assert.equal(studio.getState().isCustomPreset, true);
  assert.equal(studio.getState().presetModified, false);
  assert.equal(studio.getState().settings.inkColor, '#123456');
  assert.equal(studio.getState().hasUserImage, original.hasUserImage);
  assert.deepEqual(await studio.importPreset(input), { ok: true, name: 'Soft Print (3)' });
  const before = studio.getState();
  assert.equal((await studio.importPreset({ size: 100000, text() { assert.fail('oversized file must not be read'); } })).ok, false);
  assert.equal((await studio.importPreset({ size: 1, text: async () => '{' })).ok, false);
  assert.deepEqual(studio.getState(), before);
  const stored = await editor.close();
  const restored = await openEditor(stored);
  assert.equal(restored.studio.getState().selectedPreset, 'Soft Print (3)');
  assert.equal(restored.studio.getState().settings.inkColor, '#123456');
  await restored.close();
});

test('preset import does not change the editor if storage fails', async () => {
  const { serializePreset } = await import('../src/preset-transfer.js');
  const editor = await openEditor();
  const { studio, browser } = editor;
  await new Promise((resolve) => setTimeout(resolve, 20));
  const before = studio.getState();
  const file = serializePreset('My preset', before.settings);
  const storage = browser.localStorage;
  Object.defineProperty(browser, 'localStorage', { configurable: true, value: {
    getItem: storage.getItem.bind(storage), setItem() { throw new Error('Storage full'); }
  } });
  assert.equal((await studio.importPreset({ size: file.text.length, text: async () => file.text })).ok, false);
  assert.deepEqual(studio.getState(), before);
  Object.defineProperty(browser, 'localStorage', { configurable: true, value: storage });
  await editor.close();
});

async function openClipboardEditor() {
  const editor = await openEditor();
  const { browser, studio } = editor;
  await new Promise(resolve => setTimeout(resolve, 20));
  studio.setPreviewInteraction(true);
  Object.defineProperty(browser, 'isSecureContext', { value: true, configurable: true });
  globalThis.ClipboardItem = class { constructor(items) { this.items = items; } };
  const workers = [];
  globalThis.Worker = browser.Worker = class extends browser.EventTarget {
    constructor() { super(); workers.push(this); }
    postMessage(message) { if (message.type === 'export') this.job = message; }
    terminate() { this.terminated = true; }
    complete(blob) {
      this.dispatchEvent(new browser.MessageEvent('message', {
        data: { type: 'export-complete', requestId: this.job.requestId, blob }
      }));
    }
  };
  browser.OffscreenCanvas = class {};
  globalThis.createImageBitmap = browser.createImageBitmap = async () => ({ close() {} });
  const setWrite = write => {
    Object.defineProperty(browser.navigator, 'clipboard', { configurable: true, value: { write } });
    studio.setSetting('contrast', 1.2);
  };
  return { ...editor, workers, setWrite,
    copy: browser.document.getElementById('copyBtn'),
    exportButton: browser.document.getElementById('exportBtn') };
}

const settleClipboard = () => new Promise(resolve => setTimeout(resolve, 10));

for (const synchronous of [false, true]) {
  test(`clipboard ${synchronous ? 'throw' : 'immediate rejection'} skips rendering and unlocks Export`, async () => {
    const editor = await openClipboardEditor();
    try {
      editor.setWrite(() => {
        const error = new Error('NotAllowedError');
        if (synchronous) throw error;
        return Promise.reject(error);
      });
      editor.copy.click();
      await settleClipboard();
      assert.equal(editor.workers.length, 0, 'no expensive render starts');
      assert.equal(editor.studio.getState().export.exporting, false);
      assert.equal(editor.exportButton.disabled, false);
      assert.equal(editor.copy.disabled, false);
      assert.equal(editor.copy.textContent, 'Copy failed');
      assert.equal(editor.copy.hasAttribute('aria-busy'), false);
    } finally { await editor.close(); }
  });
}

test('clipboard denial terminates an active render and allows a successful retry', async () => {
  const editor = await openClipboardEditor();
  try {
    let deny;
    editor.setWrite(() => new Promise((_resolve, reject) => { deny = reject; }));
    editor.copy.click();
    await settleClipboard();
    assert.ok(editor.workers[0].job);
    assert.equal(editor.exportButton.disabled, true);
    deny(new Error('NotAllowedError'));
    await settleClipboard();
    assert.equal(editor.workers[0].terminated, true);
    assert.equal(editor.studio.getState().export.exporting, false);
    assert.equal(editor.exportButton.disabled, false);
    assert.equal(editor.copy.textContent, 'Copy failed');

    let copied;
    let writeStarted = false;
    editor.setWrite(items => {
      writeStarted = true;
      return items[0].items['image/png'].then(blob => { copied = blob; });
    });
    editor.copy.click();
    assert.equal(writeStarted, true, 'clipboard write stays inside the click gesture');
    await settleClipboard();
    const png = new Blob(['encoded PNG'], { type: 'image/png' });
    editor.workers[1].complete(png);
    await settleClipboard();
    assert.equal(copied, png);
    assert.equal(editor.copy.textContent, 'Copied');
    assert.equal(editor.exportButton.disabled, false);
    assert.equal(editor.studio.getState().export.exporting, false);
    const toast = editor.browser.document.getElementById('renderStatus');
    assert.equal(toast.textContent, 'Copied to clipboard');
    assert.equal(toast.dataset.visible, 'true');
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal(toast.dataset.visible, 'true', 'completion toast remains visible beyond two seconds');
    await new Promise(resolve => setTimeout(resolve, 3000));
    assert.equal(toast.dataset.visible, 'false', 'completion toast dismisses after five seconds');
  } finally { await editor.close(); }
});

test('pattern choices switch both rendering settings atomically and undo restores Organic', async () => {
  const editor = await openEditor();
  const { studio } = editor;
  try {
    studio.selectPreset('fine');
    studio.setHistoryEnabled(true);
    assert.equal(studio.getState().settings.screenStyle, 'paper');
    studio.setSetting('pattern', 'round');
    assert.equal(studio.getState().settings.dotShape, 'round');
    assert.equal(studio.getState().settings.screenStyle, 'classic');
    studio.undo();
    assert.equal(studio.getState().settings.screenStyle, 'paper');
    assert.equal(studio.getState().presetModified, false);
    for (const pattern of ['round', 'line', 'organic']) {
      studio.setSetting('pattern', pattern);
      assert.equal(studio.getState().settings.dotShape, pattern === 'organic' ? 'round' : pattern);
      assert.equal(studio.getState().settings.screenStyle, pattern === 'organic' ? 'paper' : 'classic');
    }
    studio.selectPreset('red');
    assert.equal(studio.getState().settings.screenStyle, 'classic');
  } finally { await editor.close(); }
});

test('Soft Print replaces the local Paper preset and restores its previous session', async () => {
  let editor = await openEditor();
  editor.studio.selectPreset('fine');
  assert.equal(editor.studio.getState().settings.screenStyle, 'paper');
  assert.equal(editor.studio.getState().presets.some(preset => preset.value === 'paper'), false);
  assert.equal(editor.studio.getState().presets.length, 5);
  assert.equal(editor.studio.getState().presets[0].value, 'fine');
  const storage = await editor.close();
  const saved = JSON.parse(storage[EDITOR_SESSION_KEY]);
  saved.selectedPreset = 'paper';
  storage[EDITOR_SESSION_KEY] = JSON.stringify(saved);
  editor = await openEditor(storage);
  try {
    assert.equal(editor.studio.getState().selectedPreset, 'fine');
    assert.equal(editor.studio.getState().settings.screenStyle, 'paper');
    assert.equal(editor.studio.getState().presetModified, false);
  } finally { await editor.close(); }
});
