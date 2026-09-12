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
