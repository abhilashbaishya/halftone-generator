import test from 'node:test';
import assert from 'node:assert/strict';
import { serializePreset, parsePreset, uniquePresetName } from '../src/preset-transfer.js';

const settings = { quality: 'high', cellSize: 8, contrast: 1.2, gamma: 1,
  screenAngle: 30, toneCurve: 1, grainStrength: 12, bloomStrength: 0, crtStrength: 0,
  inkColor: '#123456', paperColor: '#ffffff' };
const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/.test(value);

test('preset files round-trip only settings, never image bytes or thumbnails', () => {
  const file = serializePreset('Blue portrait', { ...settings, thumbnail: 'data:image/png;base64,secret', source: 'private photo' });
  assert.equal(file.filename, 'Halftone Studio - Blue portrait.json');
  assert.ok(!file.text.includes('secret') && !file.text.includes('private photo'));
  const parsed = parsePreset(file.text, isColor);
  assert.equal(parsed.name, 'Blue portrait');
  for (const key of Object.keys(settings)) assert.equal(parsed.settings[key], settings[key]);
});

test('invalid, unsupported, unsafe, and out-of-range preset files are rejected', () => {
  const valid = JSON.parse(serializePreset('Test', settings).text);
  for (const text of ['not JSON', '{}', '[]', JSON.stringify({ ...valid, version: 99 }),
    JSON.stringify({ ...valid, name: '__proto__' }),
    JSON.stringify({ ...valid, settings: { ...settings, cellSize: 500 } }),
    JSON.stringify({ ...valid, settings: { ...settings, gamma: '1' } }),
    JSON.stringify({ ...valid, settings: { ...settings, inkColor: 'url(https://example.com)' } })]) {
    assert.throws(() => parsePreset(text, isColor));
  }
});

test('imports avoid case-insensitive name collisions without overwriting', () => {
  assert.equal(uniquePresetName('My print', ['MY PRINT', 'My print (2)']), 'My print (3)');
  const name = 'x'.repeat(40);
  assert.equal(uniquePresetName(name, [name]), 'x'.repeat(36) + ' (2)');
  assert.equal(uniquePresetName('Fine Screen', ['Fine Screen']), 'Fine Screen (2)');
});
