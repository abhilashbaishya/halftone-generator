// Loaded only when native WebP encoding is unavailable. Keep WASM work off the
// UI thread even when OffscreenCanvas (used by the render worker) is absent.
export function encodeWebpInWorker(pixels, quality, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const encodeHere = () => import('./webp-codec.js').then(({ encodeWebpPixels }) => {
    signal?.throwIfAborted();
    return encodeWebpPixels(pixels, quality);
  });
  if (typeof Worker === 'undefined') return encodeHere();
  let worker;
  try {
    worker = new Worker(new URL('./webp-encoder-worker.js', import.meta.url), { type: 'module' });
  } catch {
    return encodeHere();
  }
  return new Promise((resolve, reject) => {
    const settle = (callback, value) => {
      worker.terminate();
      signal?.removeEventListener('abort', cancel);
      callback(value);
    };
    const cancel = () => settle(reject, signal.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => data.error
      ? settle(reject, new Error(data.error)) : settle(resolve, data.blob);
    worker.onerror = () => settle(reject, new Error('The WebP encoder could not load. Please retry.'));
    worker.onmessageerror = () => settle(reject, new Error('The WebP encoder returned an unreadable result.'));
    worker.postMessage({ pixels, quality }, [pixels.data.buffer]);
  });
}
