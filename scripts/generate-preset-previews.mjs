// Run after changing built-in looks: node scripts/generate-preset-previews.mjs
// These are close-up style samples, not thumbnails of the user's uploaded image.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCanvas } from '@napi-rs/canvas';
import { renderHalftoneSync } from '../renderer-core.js';
import { BloomPass } from '../bloom-pass.js';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
const readObject = (name) => {
  const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
  if (!match) throw new Error(`Cannot find ${name}`);
  return runInNewContext(`(${match[1]})`);
};
const presets = readObject('builtInPresets'), qualities = readObject('QUALITY_MODES');
const directory = new URL('../src/preset-previews/', import.meta.url);
mkdirSync(directory, { recursive: true });
globalThis.document = { createElement: () => createCanvas(1, 1) };
const size = 112;
const fixture = createCanvas(size, size), fixtureCtx = fixture.getContext('2d');
const ramp = fixtureCtx.createLinearGradient(0, size, size, 0);
ramp.addColorStop(0, '#171717'); ramp.addColorStop(1, '#ededed');
fixtureCtx.fillStyle = ramp; fixtureCtx.fillRect(0, 0, size, size);
const pixels = fixtureCtx.getImageData(0, 0, size, size).data;
for (const [name, p] of Object.entries(presets)) {
  const canvas = createCanvas(size, size), ctx = canvas.getContext('2d');
  renderHalftoneSync(ctx, pixels, size, size, {
    cellSize: p.cellSize, contrast: p.contrast, gamma: p.gamma,
    minDot: p.minDot / 100, angle: p.screenAngle * Math.PI / 180,
    toneCurve: p.toneCurve, microDotAmount: p.microDot / 100,
    jitter: p.jitter / 100, seed: p.seed, quality: qualities[p.quality],
    ink: p.inkColor, paper: p.paperColor
  });
  // A deterministic grain approximation for this static sample only.
  if (p.grainStrength) {
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const random = Math.sin(i * 12.9898 + p.seed * 78.233) * 43758.5453;
      const noise = ((random - Math.floor(random)) * 2 - 1) * p.grainStrength / 100 * .15 * 255;
      for (let channel = 0; channel < 3; channel++) image.data[i + channel] += noise;
    }
    ctx.putImageData(image, 0, 0);
  }
  const output = new BloomPass().apply(canvas, (p.bloomStrength ?? 0) / 100);
  writeFileSync(new URL(`${name}.png`, directory), output.toBuffer('image/png'));
}
