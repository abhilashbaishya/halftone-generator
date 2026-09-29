// Run after changing built-in looks: node scripts/generate-preset-previews.mjs
// These are close-up style samples, not thumbnails of the user's uploaded image.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCanvas } from '@napi-rs/canvas';
import { renderPresetPreview } from '../src/preset-preview.js';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const readObject = (name) => {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!match) throw new Error(`Cannot find ${name}`);
  return runInNewContext(`(${match[1]})`);
};
const presets = readObject('builtInPresets');
const directory = new URL('../src/preset-previews/', import.meta.url);
mkdirSync(directory, { recursive: true });
globalThis.document = { createElement: () => createCanvas(1, 1) };
for (const [name, p] of Object.entries(presets)) {
  const output = renderPresetPreview(p);
  writeFileSync(new URL(`${name}.png`, directory), output.toBuffer('image/png'));
}
