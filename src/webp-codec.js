import createEncoder from '@jsquash/webp/codec/enc/webp_enc.js';
import { defaultOptions } from '@jsquash/webp/meta.js';

export const webpWasmUrl = new URL('../node_modules/@jsquash/webp/codec/enc/webp_enc.wasm', import.meta.url).href;
let encoder;
export function initializeWebp(options = {}) {
  encoder ??= createEncoder({ locateFile: () => webpWasmUrl, ...options }).catch((error) => {
    encoder = null;
    throw error;
  });
  return encoder;
}

export async function encodeWebpPixels(pixels, quality = 0.9) {
  const module = await initializeWebp();
  const result = module.encode(pixels.data, pixels.width, pixels.height, {
    ...defaultOptions, quality: Math.round(quality * 100), method: 2
  });
  if (!result?.byteLength) throw new Error('The WebP encoder could not encode this image.');
  return new Blob([result], { type: 'image/webp' });
}
