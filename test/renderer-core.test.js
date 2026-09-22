import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";

import { renderHalftoneAsync, renderHalftoneSync } from "../renderer-core.js";

class RecordingContext {
  constructor() {
    this.operations = [];
    this._fillStyle = "";
  }

  set fillStyle(value) {
    this._fillStyle = value;
    this.operations.push(["fillStyle", value]);
  }

  clearRect(...values) {
    this.operations.push(["clearRect", ...values]);
  }

  fillRect(...values) {
    this.operations.push(["fillRect", ...values]);
  }

  beginPath() {}

  arc(...values) {
    this.pendingArc = values.map((value) => Number(value.toFixed(8)));
  }

  fill() {
    this.operations.push(["arc", this._fillStyle, ...this.pendingArc]);
  }
}

function createFixture() {
  const width = 18;
  const height = 12;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = (x * 17 + y * 3) % 256;
      pixels[index + 1] = (x * 5 + y * 23) % 256;
      pixels[index + 2] = (x * 11 + y * 7) % 256;
      pixels[index + 3] = 255;
    }
  }

  return {
    width,
    height,
    pixels,
    settings: {
      cellSize: 3,
      contrast: 1.35,
      gamma: 0.82,
      minDot: 0.08,
      angle: Math.PI / 8,
      toneCurve: 0.9,
      microDotAmount: 0.32,
      jitter: 0.12,
      seed: 4,
      quality: { sampleRadius: 0.58, edgeBoost: 0.22, ditherAmount: 0.1 },
      ink: { r: 204, g: 0, b: 0 },
      paper: { r: 245, g: 245, b: 245 }
    }
  };
}

test("renderer output stays deterministic", () => {
  const fixture = createFixture();
  const context = new RecordingContext();
  renderHalftoneSync(context, fixture.pixels, fixture.width, fixture.height, fixture.settings);

  const digest = createHash("sha256").update(JSON.stringify(context.operations)).digest("hex");
  assert.equal(digest, "04e2ad178b336955507845b7fea31377f490fa7f63c9121f20f9998a6ff21c8c");
});

test("dot area follows image darkness while preserving the minimum radius", () => {
  const width = 9;
  const height = 9;
  const gray = 128;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = pixels[index + 1] = pixels[index + 2] = gray;
    pixels[index + 3] = 255;
  }
  const context = new RecordingContext();
  const cellSize = 3;
  const minDot = 0.2;
  renderHalftoneSync(context, pixels, width, height, {
    cellSize,
    contrast: 1,
    gamma: 1,
    minDot,
    angle: 0,
    toneCurve: 1,
    microDotAmount: 0,
    jitter: 0,
    seed: 0,
    quality: { sampleRadius: 0.5, edgeBoost: 0, ditherAmount: 0 },
    ink: "#000",
    paper: "#fff"
  });

  const radius = context.operations.find(([operation]) => operation === "arc")[4];
  const radiusScale = cellSize * 0.5;
  const normalizedArea = (radius / radiusScale) ** 2;
  const darkness = 1 - gray / 255;
  const expectedArea = minDot ** 2 + (1 - minDot ** 2) * darkness;
  assert.ok(Math.abs(normalizedArea - expectedArea) < 1e-7);
});

test("high contrast preserves highlight information instead of clipping it", () => {
  const width = 9;
  const height = 9;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 220;
    pixels[index + 3] = 255;
  }
  const context = new RecordingContext();
  renderHalftoneSync(context, pixels, width, height, {
    cellSize: 3,
    contrast: 2.2,
    gamma: 0.95,
    minDot: 0,
    angle: 0,
    toneCurve: 1,
    microDotAmount: 0,
    jitter: 0,
    seed: 0,
    quality: { sampleRadius: 0.5, edgeBoost: 0, ditherAmount: 0 },
    ink: "#000",
    paper: "#fff"
  });

  assert.ok(context.operations.some(([operation]) => operation === "arc"));
});

test("chunked renderer produces the same output as the synchronous renderer", async () => {
  const fixture = createFixture();
  const syncContext = new RecordingContext();
  const asyncContext = new RecordingContext();
  const progress = [];

  renderHalftoneSync(syncContext, fixture.pixels, fixture.width, fixture.height, fixture.settings);
  const result = await renderHalftoneAsync(
    asyncContext,
    fixture.pixels,
    fixture.width,
    fixture.height,
    fixture.settings,
    {
      integralChunkRows: 3,
      renderChunkRows: 2,
      yieldControl: () => Promise.resolve(),
      onProgress: (value) => progress.push(value)
    }
  );

  assert.equal(result.cancelled, false);
  assert.deepEqual(asyncContext.operations, syncContext.operations);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
});

test("chunked renderer can be cancelled before it paints", async () => {
  const fixture = createFixture();
  const context = new RecordingContext();
  let yields = 0;

  const result = await renderHalftoneAsync(
    context,
    fixture.pixels,
    fixture.width,
    fixture.height,
    fixture.settings,
    {
      integralChunkRows: 2,
      shouldCancel: () => yields >= 2,
      yieldControl: async () => { yields += 1; }
    }
  );

  assert.equal(result.cancelled, true);
  assert.deepEqual(context.operations, []);
});

test("CSS colors and opacity reach both rendering paths without hex truncation", async () => {
  const fixture = createFixture();
  fixture.settings.ink = "oklch(0.65 0.2 30 / 0.5)";
  fixture.settings.paper = "color(display-p3 0.9 0.95 1 / 0.25)";
  const sync = new RecordingContext();
  const async = new RecordingContext();
  renderHalftoneSync(sync, fixture.pixels, fixture.width, fixture.height, fixture.settings);
  await renderHalftoneAsync(async, fixture.pixels, fixture.width, fixture.height, fixture.settings, { yieldControl: () => Promise.resolve() });
  assert.deepEqual(sync.operations.filter(([op]) => op === "fillStyle"), [
    ["fillStyle", fixture.settings.paper], ["fillStyle", fixture.settings.ink]
  ]);
  assert.deepEqual(async.operations, sync.operations);
});

test('fully transparent sources draw no dots even with texture, edge enhancement and minimum dot enabled', async () => {
  const fixture = createFixture();
  fixture.settings.minDot = .6;
  for (let index = 3; index < fixture.pixels.length; index += 4) fixture.pixels[index] = 0;
  for (const render of [renderHalftoneSync, renderHalftoneAsync]) {
    const context = new RecordingContext();
    await render(context, fixture.pixels, fixture.width, fixture.height, fixture.settings, { yieldControl: () => Promise.resolve() });
    assert.equal(context.operations.filter(([type]) => type === 'arc').length, 0);
    assert.ok(context.operations.some(([type]) => type === 'fillRect'), 'the selected paper still fills the canvas');
  }
});

test('partial opacity scales dot area smoothly without changing opaque rendering', () => {
  const width = 32, height = 32;
  const settings = { ...createFixture().settings, cellSize: 4, contrast: 1, gamma: 1, toneCurve: 1,
    minDot: .2, angle: 0, microDotAmount: 0, jitter: 0,
    quality: { sampleRadius: .5, edgeBoost: 0, ditherAmount: 0 } };
  const area = (alpha) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = pixels[index + 1] = pixels[index + 2] = 128;
      pixels[index + 3] = alpha;
    }
    const ctx = new RecordingContext();
    renderHalftoneSync(ctx, pixels, width, height, settings);
    return ctx.operations.filter(([type]) => type === 'arc').reduce((sum, arc) => sum + arc[4] ** 2, 0);
  };
  const opaque = area(255);
  for (const alpha of [64, 128, 192]) assert.ok(Math.abs(area(alpha) / opaque - alpha / 255) < .0001);
});

test('cutout pixels ignore hidden RGB and agree across preview and export renderers', async () => {
  const width = 96, height = 96;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 28; y < 68; y++) for (let x = 28; x < 68; x++) {
    const index = (y * width + x) * 4;
    pixels[index + 3] = x < 32 || x > 63 ? 128 : 255;
  }
  const alternate = pixels.slice();
  for (let index = 0; index < alternate.length; index += 4) {
    if (alternate[index + 3] === 0) alternate[index] = alternate[index + 1] = alternate[index + 2] = 255;
  }
  const settings = { ...createFixture().settings, cellSize: 6, minDot: .6, ink: '#000', paper: 'transparent' };
  const a = createCanvas(width, height).getContext('2d');
  const b = createCanvas(width, height).getContext('2d');
  renderHalftoneSync(a, pixels, width, height, settings);
  await renderHalftoneAsync(b, alternate, width, height, settings, { yieldControl: () => Promise.resolve() });
  const actual = a.getImageData(0, 0, width, height).data;
  assert.deepEqual(actual, b.getImageData(0, 0, width, height).data);
  assert.equal(actual[(8 * width + 8) * 4 + 3], 0, 'empty background stays transparent when paper is transparent');
  assert.ok(actual.some((value, index) => index % 4 === 3 && value > 0), 'cutout still renders');
});
