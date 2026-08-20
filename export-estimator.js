function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function estimateEncodedSize({
  smallBytes,
  smallPixels,
  largeBytes,
  largePixels,
  targetPixels,
  uncertainty = 0.28
}) {
  const samplesAreValid = [smallBytes, smallPixels, largeBytes, largePixels, targetPixels]
    .every((value) => Number.isFinite(value) && value > 0);

  if (!samplesAreValid) {
    throw new TypeError("Export size samples must be positive finite numbers.");
  }

  const pixelRatio = largePixels / smallPixels;
  const byteRatio = largeBytes / smallBytes;
  const measuredExponent = pixelRatio > 1 && byteRatio > 0
    ? Math.log(byteRatio) / Math.log(pixelRatio)
    : 0.85;
  const exponent = clamp(Number.isFinite(measuredExponent) ? measuredExponent : 0.85, 0.55, 1.05);
  const scale = Math.max(0.01, targetPixels / largePixels);
  const estimatedBytes = clamp(
    Math.round(largeBytes * Math.pow(scale, exponent)),
    1_000,
    Math.round(targetPixels * 4.1)
  );
  const margin = clamp(uncertainty, 0.18, 0.55);

  return {
    estimatedBytes,
    minBytes: Math.max(1_000, Math.round(estimatedBytes * (1 - margin))),
    maxBytes: Math.round(estimatedBytes * (1 + margin)),
    exponent
  };
}
