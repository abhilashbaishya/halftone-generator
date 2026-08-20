const DESKTOP_EXPORT_PIXELS = 16_000_000;
const DESKTOP_EFFECTS_EXPORT_PIXELS = 12_000_000;
const COMPACT_EXPORT_PIXELS = 8_000_000;
const COMPACT_EFFECTS_EXPORT_PIXELS = 6_000_000;

export function getExportPixelBudget({ compact = false, hasPostEffects = false } = {}) {
  if (compact) {
    return hasPostEffects ? COMPACT_EFFECTS_EXPORT_PIXELS : COMPACT_EXPORT_PIXELS;
  }

  return hasPostEffects ? DESKTOP_EFFECTS_EXPORT_PIXELS : DESKTOP_EXPORT_PIXELS;
}

export function calculateExportDimensions(sourceWidth, sourceHeight, maxPixels) {
  const width = Math.max(1, Math.floor(Number(sourceWidth) || 1));
  const height = Math.max(1, Math.floor(Number(sourceHeight) || 1));
  const sourcePixels = width * height;

  if (sourcePixels <= maxPixels) {
    return { width, height, capped: false, sourcePixels, outputPixels: sourcePixels };
  }

  const scale = Math.sqrt(maxPixels / sourcePixels);
  const outputWidth = Math.max(1, Math.floor(width * scale));
  const outputHeight = Math.max(1, Math.floor(height * scale));

  return {
    width: outputWidth,
    height: outputHeight,
    capped: true,
    sourcePixels,
    outputPixels: outputWidth * outputHeight
  };
}
