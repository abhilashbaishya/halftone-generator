export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 60_000_000;
export const MAX_IMAGE_EDGE = 16_384;

const HEADER_READ_BYTES = 2 * 1024 * 1024;

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readUint24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BE(bytes, offset) {
  return (
    bytes[offset] * 0x1000000
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  );
}

function detectMimeType(bytes) {
  if (
    bytes.length >= 24
    && bytes[0] === 0x89
    && ascii(bytes, 1, 3) === "PNG"
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png";

  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  return null;
}

function isAnimatedPng(bytes) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    if (length > bytes.length - offset - 12) return null;
    offset += length + 12;
  }
  return null;
}

function isAnimatedImage(bytes, mimeType) {
  if (mimeType === "image/png") return isAnimatedPng(bytes);
  if (mimeType === "image/webp") {
    return ascii(bytes, 12, 4) === "VP8X" && Boolean(bytes[20] & 0x02);
  }
  return false;
}

function getJpegDimensions(bytes) {
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
  ]);
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) return null;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return {
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4]
      };
    }
    offset += segmentLength;
  }

  return null;
}

function getWebpDimensions(bytes) {
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: readUint24LE(bytes, 24) + 1,
      height: readUint24LE(bytes, 27) + 1
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)
    };
  }
  if (
    chunk === "VP8 "
    && bytes.length >= 30
    && bytes[23] === 0x9d
    && bytes[24] === 0x01
    && bytes[25] === 0x2a
  ) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
    };
  }
  return null;
}

function getDimensions(bytes, mimeType) {
  if (mimeType === "image/png") {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (mimeType === "image/jpeg") return getJpegDimensions(bytes);
  if (mimeType === "image/webp") return getWebpDimensions(bytes);
  return null;
}

export function validateImageDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { ok: false, message: "Could not read that image's dimensions" };
  }
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, message: "That image is too large to process safely" };
  }
  return { ok: true };
}

export function validateImageByteLength(size) {
  if (!Number.isFinite(size) || size < 10) {
    return { ok: false, message: "Choose a supported image file" };
  }
  if (size > MAX_IMAGE_BYTES) {
    return { ok: false, message: "Choose an image smaller than 40 MB" };
  }
  return { ok: true };
}

export async function inspectImageBlob(blob) {
  if (!(blob instanceof Blob)) {
    return { ok: false, message: "Choose a supported image file" };
  }
  const byteLengthValidation = validateImageByteLength(blob.size);
  if (!byteLengthValidation.ok) return byteLengthValidation;

  const bytes = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, HEADER_READ_BYTES)).arrayBuffer()
  );
  const mimeType = detectMimeType(bytes);
  if (!mimeType) {
    return { ok: false, message: "Use a JPEG, PNG, or WebP image" };
  }
  let animationState = isAnimatedImage(bytes, mimeType);
  if (animationState === null && mimeType === "image/png" && bytes.length < blob.size) {
    const fullBytes = new Uint8Array(await blob.arrayBuffer());
    animationState = isAnimatedImage(fullBytes, mimeType);
  }
  if (animationState === null) {
    return { ok: false, message: "Could not verify that image safely" };
  }
  if (animationState) {
    return { ok: false, message: "Animated images are not supported" };
  }

  const dimensions = getDimensions(bytes, mimeType);
  if (!dimensions) {
    return { ok: false, message: "Could not verify that image safely" };
  }
  const validation = validateImageDimensions(dimensions.width, dimensions.height);
  if (!validation.ok) return validation;

  return { ok: true, mimeType, ...dimensions };
}
