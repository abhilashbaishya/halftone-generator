import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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
