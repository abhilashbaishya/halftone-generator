const BAYER_4X4 = [
  0 / 16,
  8 / 16,
  2 / 16,
  10 / 16,
  12 / 16,
  4 / 16,
  14 / 16,
  6 / 16,
  3 / 16,
  11 / 16,
  1 / 16,
  9 / 16,
  15 / 16,
  7 / 16,
  13 / 16,
  5 / 16
];

const hiddenCanvas = new OffscreenCanvas(1, 1);
const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });
const outputCanvas = new OffscreenCanvas(1, 1);
const outputCtx = outputCanvas.getContext("2d");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash2d(x, y, salt, seed) {
  const v = Math.sin((x + seed * 0.137) * 127.1 + (y + seed * 0.311) * 311.7 + (salt + seed * 0.017) * 17.13) * 43758.5453123;
  return v - Math.floor(v);
}

function adjustedLuma(r, g, b, contrast, gamma) {
  let value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  value = Math.pow(value, gamma);
  value = (value - 0.5) * contrast + 0.5;
  return clamp(value, 0, 1);
}

function buildLumaBuffers(data, width, height, contrast, gamma) {
  const integral = new Float32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let row = 0;
    const integralRow = (y + 1) * (width + 1);
    const integralPrevRow = y * (width + 1);

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const l = adjustedLuma(data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2], contrast, gamma);
      row += l;
      integral[integralRow + x + 1] = integral[integralPrevRow + x + 1] + row;
    }
  }

  return { integral };
}

function sampleBoxAverage(integral, width, height, cx, cy, radius) {
  const x0 = clamp(Math.floor(cx - radius), 0, width - 1);
  const y0 = clamp(Math.floor(cy - radius), 0, height - 1);
  const x1 = clamp(Math.floor(cx + radius), 0, width - 1);
  const y1 = clamp(Math.floor(cy + radius), 0, height - 1);

  if (x1 < x0 || y1 < y0) return 1;

  const stride = width + 1;
  const sum =
    integral[(y1 + 1) * stride + (x1 + 1)] -
    integral[y0 * stride + (x1 + 1)] -
    integral[(y1 + 1) * stride + x0] +
    integral[y0 * stride + x0];

  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  return area > 0 ? sum / area : 1;
}

function sampleEdgeStrength(integral, width, height, cx, cy, radius) {
  const r = Math.max(1, radius * 0.7);
  const left = sampleBoxAverage(integral, width, height, cx - r, cy, r);
  const right = sampleBoxAverage(integral, width, height, cx + r, cy, r);
  const up = sampleBoxAverage(integral, width, height, cx, cy - r, r);
  const down = sampleBoxAverage(integral, width, height, cx, cy + r, r);

  return clamp(Math.hypot(right - left, down - up) * 1.8, 0, 1);
}

function renderHalftone(width, height, settings) {
  const { cellSize, contrast, gamma, minDot, angle, toneCurve, microDotAmount, jitter, seed, quality, ink, paper } = settings;

  const imageData = hiddenCtx.getImageData(0, 0, width, height);
  const { integral } = buildLumaBuffers(imageData.data, width, height, contrast, gamma);

  outputCtx.clearRect(0, 0, width, height);
  outputCtx.fillStyle = `rgb(${paper.r} ${paper.g} ${paper.b})`;
  outputCtx.fillRect(0, 0, width, height);
  outputCtx.fillStyle = `rgb(${ink.r} ${ink.g} ${ink.b})`;

  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diagonal = Math.sqrt(width * width + height * height);
  const radiusScale = cellSize * 0.5;
  const samplingRadius = Math.max(1, cellSize * quality.sampleRadius);

  for (let gy = -diagonal; gy <= diagonal; gy += cellSize) {
    for (let gx = -diagonal; gx <= diagonal; gx += cellSize) {
      const x = centerX + gx * cos - gy * sin;
      const y = centerY + gx * sin + gy * cos;

      if (x < 0 || y < 0 || x >= width || y >= height) continue;

      const gridX = Math.round((gx + diagonal) / cellSize);
      const gridY = Math.round((gy + diagonal) / cellSize);

      const baseLuma = sampleBoxAverage(integral, width, height, x, y, samplingRadius);
      const edgeStrength = sampleEdgeStrength(integral, width, height, x, y, samplingRadius);

      let darkness = Math.pow(1 - baseLuma, toneCurve);
      darkness = clamp(darkness + edgeStrength * quality.edgeBoost * (1 - darkness), 0, 1);

      const bayer = BAYER_4X4[((gridY & 3) * 4) + (gridX & 3)] - 0.5;
      darkness = clamp(darkness + bayer * quality.ditherAmount * (1 - darkness * 0.55), 0, 1);

      if (darkness < 0.003) continue;

      const dotStrength = minDot + (1 - minDot) * darkness;
      const radius = clamp(dotStrength * radiusScale * (1 + edgeStrength * 0.12), 0, radiusScale);

      const jx = (hash2d(gridX, gridY, 0.1, seed) - 0.5) * cellSize * 0.5 * jitter;
      const jy = (hash2d(gridX, gridY, 0.9, seed) - 0.5) * cellSize * 0.5 * jitter;

      outputCtx.beginPath();
      outputCtx.arc(x + jx, y + jy, radius, 0, Math.PI * 2);
      outputCtx.fill();

      if (microDotAmount <= 0 || darkness >= 0.6) continue;

      const microChance = microDotAmount * (1 - darkness) * 0.65;
      if (hash2d(gridX, gridY, 2.4, seed) > microChance) continue;

      const microRadius = Math.max(0.35, cellSize * 0.085 * (0.4 + microDotAmount));
      const mx = x + (hash2d(gridX, gridY, 3.6, seed) - 0.5) * cellSize * 0.35;
      const my = y + (hash2d(gridX, gridY, 4.8, seed) - 0.5) * cellSize * 0.35;

      outputCtx.beginPath();
      outputCtx.arc(mx, my, microRadius, 0, Math.PI * 2);
      outputCtx.fill();
    }
  }
}

self.onmessage = async (event) => {
  const { type, requestId, width, height, settings, sourceBitmap } = event.data || {};
  if (type !== "render" || !sourceBitmap || !settings) return;

  try {
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;
    outputCanvas.width = width;
    outputCanvas.height = height;

    hiddenCtx.clearRect(0, 0, width, height);
    hiddenCtx.drawImage(sourceBitmap, 0, 0, width, height);
    if (typeof sourceBitmap.close === "function") sourceBitmap.close();

    renderHalftone(width, height, settings);

    let bitmap;
    if (typeof outputCanvas.transferToImageBitmap === "function") {
      bitmap = outputCanvas.transferToImageBitmap();
    } else {
      const blob = await outputCanvas.convertToBlob({ type: "image/png" });
      bitmap = await createImageBitmap(blob);
    }

    self.postMessage({ type: "rendered", requestId, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
