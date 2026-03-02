const BAYER_8X8 = [
   0 / 64, 32 / 64,  8 / 64, 40 / 64,  2 / 64, 34 / 64, 10 / 64, 42 / 64,
  48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64,
  12 / 64, 44 / 64,  4 / 64, 36 / 64, 14 / 64, 46 / 64,  6 / 64, 38 / 64,
  60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64,
   3 / 64, 35 / 64, 11 / 64, 43 / 64,  1 / 64, 33 / 64,  9 / 64, 41 / 64,
  51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64,
  15 / 64, 47 / 64,  7 / 64, 39 / 64, 13 / 64, 45 / 64,  5 / 64, 37 / 64,
  63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64
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

  const tl = sampleBoxAverage(integral, width, height, cx - r, cy - r, r);
  const tc = sampleBoxAverage(integral, width, height, cx,     cy - r, r);
  const tr = sampleBoxAverage(integral, width, height, cx + r, cy - r, r);
  const ml = sampleBoxAverage(integral, width, height, cx - r, cy,     r);
  const mr = sampleBoxAverage(integral, width, height, cx + r, cy,     r);
  const bl = sampleBoxAverage(integral, width, height, cx - r, cy + r, r);
  const bc = sampleBoxAverage(integral, width, height, cx,     cy + r, r);
  const br = sampleBoxAverage(integral, width, height, cx + r, cy + r, r);

  const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
  const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);

  return clamp(Math.hypot(gx, gy) * 1.4, 0, 1);
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

      const bayer = BAYER_8X8[((gridY & 7) * 8) + (gridX & 7)] - 0.5;
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

      const microBase = microDotAmount * (1 - darkness);
      const microRadius = Math.max(0.35, cellSize * 0.085 * (0.4 + microDotAmount));
      const maxMicro = Math.min(3, Math.ceil(microBase * 3));
      const quadrantOffsets = [
        [-0.25, -0.25],
        [ 0.25,  0.25],
        [-0.25,  0.25]
      ];

      for (let mi = 0; mi < maxMicro; mi++) {
        const salt = 2.4 + mi * 1.7;
        const chance = microBase * (0.65 - mi * 0.15);
        if (hash2d(gridX, gridY, salt, seed) > chance) continue;

        const qx = quadrantOffsets[mi][0];
        const qy = quadrantOffsets[mi][1];
        const mx = x + (qx + (hash2d(gridX, gridY, salt + 1.2, seed) - 0.5) * 0.2) * cellSize;
        const my = y + (qy + (hash2d(gridX, gridY, salt + 2.4, seed) - 0.5) * 0.2) * cellSize;

        outputCtx.beginPath();
        outputCtx.arc(mx, my, microRadius, 0, Math.PI * 2);
        outputCtx.fill();
      }
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
