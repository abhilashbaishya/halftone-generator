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
  assert.equal(digest, "db2c8799f4670d532967d3050b6ff37980fe6ec746acd6547cd7f4f284a165bc");
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
