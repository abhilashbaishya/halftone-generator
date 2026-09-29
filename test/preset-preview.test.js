import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getPresetThumbnail, renderPresetPreview } from '../src/preset-preview.js';

globalThis.document = { createElement: () => createCanvas(1, 1) };
const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const presets = runInNewContext(`(${source.match(/const builtInPresets = (\{[\s\S]*?\n\});/)[1]})`);
const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;

test('custom samples use the same pixels as the shipped built-in style samples', async () => {
  for (const [name, preset] of Object.entries(presets)) {
    const expected = createCanvas(112, 112);
    expected.getContext('2d').drawImage(await loadImage(await readFile(new URL(`../src/preset-previews/${name}.png`, import.meta.url))), 0, 0);
    const actual = renderPresetPreview(preset);
    assert.equal(actual.width, 112);
    assert.equal(actual.height, 112);
    assert.deepEqual(pixels(actual), pixels(expected), `${name} must match the built-in sample`);
  }
});

test('old photo crops are replaced without changing saved settings, and imports get samples too', () => {
  const preset = { ...presets.fine, inkColor: '#516128', thumbnail: 'data:image/jpeg;base64,oldPhoto' };
  const original = structuredClone(preset);
  const thumbnail = getPresetThumbnail(preset);
  assert.match(thumbnail, /^data:image\/png;base64,/);
  assert.deepEqual(preset, original, 'regenerating a sample does not alter a saved preset');
  assert.equal(getPresetThumbnail(preset), thumbnail);
  const imported = { ...preset };
  delete imported.thumbnail;
  assert.equal(getPresetThumbnail(imported), thumbnail, 'only the settings determine the sample');
  assert.notEqual(getPresetThumbnail({ ...imported, inkColor: '#003399' }), thumbnail);
});
