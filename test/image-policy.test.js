import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_IMAGE_BYTES,
  inspectImageBlob,
  validateImageByteLength,
  validateImageDimensions
} from "../image-policy.js";

function pngBlob(width, height) {
  const bytes = new Uint8Array(45);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([0x49, 0x44, 0x41, 0x54], 37);
  return new Blob([bytes], { type: "text/plain" });
}

test("image inspection trusts the bytes rather than the declared MIME type", async () => {
  const result = await inspectImageBlob(pngBlob(1200, 800));
  assert.deepEqual(result, {
    ok: true,
    mimeType: "image/png",
    width: 1200,
    height: 800
  });
});

test("image inspection rejects unsupported files", async () => {
  const unsupported = await inspectImageBlob(new Blob([new Uint8Array(24)]));
  assert.equal(unsupported.ok, false);
});

test("image inspection rejects animated inputs", async () => {
  const animatedBytes = new Uint8Array(53);
  animatedBytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(animatedBytes.buffer);
  view.setUint32(8, 13);
  animatedBytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 1200);
  view.setUint32(20, 800);
  view.setUint32(33, 8);
  animatedBytes.set([0x61, 0x63, 0x54, 0x4c], 37);
  const result = await inspectImageBlob(new Blob([animatedBytes]));
  assert.equal(result.ok, false);
  assert.equal(result.message, "Animated images aren’t supported. Upload a static JPEG, PNG, or WebP.");
});

test("animation checks continue past a large PNG metadata chunk", async () => {
  const metadataLength = 2 * 1024 * 1024;
  const bytes = new Uint8Array(33 + 12 + metadataLength + 20);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 1200);
  view.setUint32(20, 800);
  view.setUint32(33, metadataLength);
  bytes.set([0x69, 0x43, 0x43, 0x50], 37);
  const animationOffset = 45 + metadataLength;
  view.setUint32(animationOffset, 8);
  bytes.set([0x61, 0x63, 0x54, 0x4c], animationOffset + 4);

  const result = await inspectImageBlob(new Blob([bytes]));
  assert.equal(result.ok, false);
  assert.equal(result.message, "Animated images aren’t supported. Upload a static JPEG, PNG, or WebP.");
});

test("image uploads have a bounded byte length", () => {
  assert.equal(validateImageByteLength(MAX_IMAGE_BYTES).ok, true);
  assert.equal(validateImageByteLength(MAX_IMAGE_BYTES + 1).ok, false);
});

test("intrinsic dimensions are capped before decode", () => {
  assert.equal(validateImageDimensions(8064, 6048).ok, true);
  assert.equal(validateImageDimensions(20_000, 100).ok, false);
  assert.equal(validateImageDimensions(10_000, 10_000).ok, false);
});
