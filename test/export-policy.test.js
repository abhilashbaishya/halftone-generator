import test from "node:test";
import assert from "node:assert/strict";

import { calculateExportDimensions, getExportPixelBudget } from "../export-policy.js";

test("keeps source dimensions when the image is already within budget", () => {
  assert.deepEqual(calculateExportDimensions(1200, 800, 16_000_000), {
    width: 1200,
    height: 800,
    capped: false,
    sourcePixels: 960_000,
    outputPixels: 960_000
  });
});

test("caps large sources without changing their aspect ratio", () => {
  const result = calculateExportDimensions(12_000, 8_000, 16_000_000);

  assert.equal(result.capped, true);
  assert.ok(result.outputPixels <= 16_000_000);
  assert.ok(Math.abs(result.width / result.height - 1.5) < 0.001);
});

test("uses a lower memory budget on compact devices and with effects", () => {
  assert.equal(getExportPixelBudget(), 16_000_000);
  assert.equal(getExportPixelBudget({ hasPostEffects: true }), 12_000_000);
  assert.equal(getExportPixelBudget({ compact: true }), 8_000_000);
  assert.equal(getExportPixelBudget({ compact: true, hasPostEffects: true }), 6_000_000);
});
