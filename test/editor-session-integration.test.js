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
