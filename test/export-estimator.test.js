import test from "node:test";
import assert from "node:assert/strict";

import { estimateEncodedSize } from "../export-estimator.js";

test("estimates a bounded range from two encoded samples", () => {
  const result = estimateEncodedSize({
    smallBytes: 24_000,
    smallPixels: 80_000,
    largeBytes: 76_000,
    largePixels: 320_000,
    targetPixels: 1_920_000,
    uncertainty: 0.25
  });

  assert.ok(result.minBytes < result.estimatedBytes);
  assert.ok(result.estimatedBytes < result.maxBytes);
  assert.ok(result.estimatedBytes > 76_000);
  assert.ok(result.maxBytes <= 1_920_000 * 4.1);
});

test("uses a stable fallback exponent when samples have equal dimensions", () => {
  const result = estimateEncodedSize({
    smallBytes: 20_000,
    smallPixels: 100_000,
    largeBytes: 20_000,
    largePixels: 100_000,
    targetPixels: 400_000
  });

  assert.equal(result.exponent, 0.85);
});

test("rejects unusable samples", () => {
  assert.throws(() => estimateEncodedSize({
    smallBytes: 0,
    smallPixels: 100,
    largeBytes: 200,
    largePixels: 400,
    targetPixels: 800
  }), /positive finite numbers/);
});
