import { encodeWebpPixels } from './webp-codec.js';

self.onmessage = async ({ data: { pixels, quality } }) => {
  try {
    self.postMessage({ blob: await encodeWebpPixels(pixels, quality) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'WebP encoding failed.' });
  }
};
