async function nativeCanvasBlob(canvas, mimeType, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: mimeType, quality });
  if (typeof canvas.toBlob !== 'function') throw new Error('Image export is not supported in this browser.');
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(resolve, mimeType, quality); } catch (error) { reject(error); }
  });
}

// Probe a tiny clean canvas before asking a native encoder to process the full
// artwork. Unsupported WebP often silently encodes PNG instead, wasting work.
const nativeWebpSupport = new WeakMap();
function supportsNativeWebp(canvas) {
  const owner = canvas.ownerDocument || (typeof OffscreenCanvas === 'function' ? OffscreenCanvas : null);
  if (!owner) return Promise.resolve(undefined); // Non-browser adapters may not provide a probe factory.
  if (!nativeWebpSupport.has(owner)) {
    const result = (async () => {
      const probe = canvas.ownerDocument ? canvas.ownerDocument.createElement('canvas') : new OffscreenCanvas(2, 2);
      probe.width = probe.height = 2;
      let timeout;
      try {
        const blob = await Promise.race([
          nativeCanvasBlob(probe, 'image/webp', .9),
          new Promise((resolve) => { timeout = setTimeout(() => resolve(null), 1500); })
        ]);
        return Boolean(blob?.size && blob.type === 'image/webp');
      } catch { return false; }
      finally { clearTimeout(timeout); }
    })();
    nativeWebpSupport.set(owner, result);
  }
  return nativeWebpSupport.get(owner);
}

export async function encodeCanvas(canvas, mimeType, quality, { encodeWebp, signal, allowFallback = true } = {}) {
  signal?.throwIfAborted();
  let blob;
  const nativeSupported = mimeType === 'image/webp' ? await supportsNativeWebp(canvas) : true;
  signal?.throwIfAborted();
  try {
    if (nativeSupported !== false) blob = await nativeCanvasBlob(canvas, mimeType, quality);
  } catch (error) {
    // Security/memory failures must not be misreported as missing codec support.
    if (mimeType !== 'image/webp' || !['NotSupportedError', 'EncodingError'].includes(error.name)) throw error;
  }
  signal?.throwIfAborted();
  if (blob?.size && blob.type === mimeType) return blob;
  if (mimeType === 'image/webp' && encodeWebp && allowFallback) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The image could not be read for WebP export.');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const encoded = await encodeWebp(pixels, quality);
    signal?.throwIfAborted();
    if (encoded?.size && encoded.type === mimeType) return encoded;
    throw new Error('The WebP encoder returned an invalid image.');
  }
  throw new Error(blob ? `${mimeType} export is not supported in this browser.` : 'The browser could not encode this image.');
}
