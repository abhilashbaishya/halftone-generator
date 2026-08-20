import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  getEncoderQuality,
  getExportFormat,
  isExportFormat
} from "../export-formats.js";

test("unknown export formats fall back to WebP", () => {
  assert.equal(getExportFormat("nope").value, DEFAULT_EXPORT_FORMAT);
  assert.equal(getExportFormat("toString").value, DEFAULT_EXPORT_FORMAT);
  assert.equal(getExportFormat("__proto__").value, DEFAULT_EXPORT_FORMAT);
  assert.equal(isExportFormat("webp"), true);
  assert.equal(isExportFormat("constructor"), false);
});

test("lossy formats use fixed high-quality encoder settings", () => {
  assert.equal(getEncoderQuality(EXPORT_FORMATS.webp), 0.9);
  assert.equal(getEncoderQuality(EXPORT_FORMATS.jpeg), 0.92);
  assert.equal(getEncoderQuality(EXPORT_FORMATS.png), undefined);
});
