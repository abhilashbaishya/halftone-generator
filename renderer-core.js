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

const MICRO_DOT_OFFSETS = [
  [-0.25, -0.25],
  [0.25, 0.25],
  [-0.25, 0.25]
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash2d(x, y, salt, seed) {
  const value = Math.sin(
    (x + seed * 0.137) * 127.1
    + (y + seed * 0.311) * 311.7
    + (salt + seed * 0.017) * 17.13
  ) * 43758.5453123;
  return value - Math.floor(value);
}

function adjustedLuma(r, g, b, contrast, gamma) {
  let value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  value = Math.pow(value, gamma);
  value = (value - 0.5) * contrast + 0.5;
  return clamp(value, 0, 1);
}

function fillIntegralRows(integral, data, width, contrast, gamma, startY, endY) {
  const stride = width + 1;

  for (let y = startY; y < endY; y += 1) {
    let row = 0;
    const integralRow = (y + 1) * stride;
    const integralPreviousRow = y * stride;
    const pixelRow = y * width * 4;

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = pixelRow + x * 4;
      row += adjustedLuma(
        data[pixelIndex],
        data[pixelIndex + 1],
        data[pixelIndex + 2],
        contrast,
        gamma
      );
      integral[integralRow + x + 1] = integral[integralPreviousRow + x + 1] + row;
    }
  }
}

function buildLumaIntegral(data, width, height, contrast, gamma) {
  const integral = new Float32Array((width + 1) * (height + 1));
  fillIntegralRows(integral, data, width, contrast, gamma, 0, height);
  return integral;
}

function sampleBoxAverage(integral, width, height, centerX, centerY, radius) {
  const x0 = clamp(Math.floor(centerX - radius), 0, width - 1);
  const y0 = clamp(Math.floor(centerY - radius), 0, height - 1);
  const x1 = clamp(Math.floor(centerX + radius), 0, width - 1);
  const y1 = clamp(Math.floor(centerY + radius), 0, height - 1);

  if (x1 < x0 || y1 < y0) return 1;

  const stride = width + 1;
  const sum =
    integral[(y1 + 1) * stride + (x1 + 1)]
    - integral[y0 * stride + (x1 + 1)]
    - integral[(y1 + 1) * stride + x0]
    + integral[y0 * stride + x0];
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  return area > 0 ? sum / area : 1;
}

function sampleEdgeStrength(integral, width, height, centerX, centerY, radius) {
  const sampleRadius = Math.max(1, radius * 0.7);
  const topLeft = sampleBoxAverage(integral, width, height, centerX - sampleRadius, centerY - sampleRadius, sampleRadius);
  const topCenter = sampleBoxAverage(integral, width, height, centerX, centerY - sampleRadius, sampleRadius);
  const topRight = sampleBoxAverage(integral, width, height, centerX + sampleRadius, centerY - sampleRadius, sampleRadius);
  const middleLeft = sampleBoxAverage(integral, width, height, centerX - sampleRadius, centerY, sampleRadius);
  const middleRight = sampleBoxAverage(integral, width, height, centerX + sampleRadius, centerY, sampleRadius);
  const bottomLeft = sampleBoxAverage(integral, width, height, centerX - sampleRadius, centerY + sampleRadius, sampleRadius);
  const bottomCenter = sampleBoxAverage(integral, width, height, centerX, centerY + sampleRadius, sampleRadius);
  const bottomRight = sampleBoxAverage(integral, width, height, centerX + sampleRadius, centerY + sampleRadius, sampleRadius);

  const gradientX = (topRight + 2 * middleRight + bottomRight)
    - (topLeft + 2 * middleLeft + bottomLeft);
  const gradientY = (bottomLeft + 2 * bottomCenter + bottomRight)
    - (topLeft + 2 * topCenter + topRight);
  return clamp(Math.hypot(gradientX, gradientY) * 1.4, 0, 1);
}

function createRenderState(targetCtx, integral, width, height, settings) {
  const { cellSize, angle, quality, ink, paper } = settings;

  targetCtx.clearRect(0, 0, width, height);
  targetCtx.fillStyle = `rgb(${paper.r} ${paper.g} ${paper.b})`;
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.fillStyle = `rgb(${ink.r} ${ink.g} ${ink.b})`;

  const diagonal = Math.sqrt(width * width + height * height);
  return {
    targetCtx,
    integral,
    width,
    height,
    settings,
    centerX: width * 0.5,
    centerY: height * 0.5,
    cosine: Math.cos(angle),
    sine: Math.sin(angle),
    diagonal,
    radiusScale: cellSize * 0.5,
    samplingRadius: Math.max(1, cellSize * quality.sampleRadius)
  };
}

function renderGridRow(state, gridYPosition) {
  const {
    targetCtx, integral, width, height, settings, centerX, centerY,
    cosine, sine, diagonal, radiusScale, samplingRadius
  } = state;
  const { cellSize, minDot, toneCurve, microDotAmount, jitter, seed, quality } = settings;

  for (let gridXPosition = -diagonal; gridXPosition <= diagonal; gridXPosition += cellSize) {
    const x = centerX + gridXPosition * cosine - gridYPosition * sine;
    const y = centerY + gridXPosition * sine + gridYPosition * cosine;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;

    const gridX = Math.round((gridXPosition + diagonal) / cellSize);
    const gridY = Math.round((gridYPosition + diagonal) / cellSize);
    const baseLuma = sampleBoxAverage(integral, width, height, x, y, samplingRadius);
    const edgeStrength = sampleEdgeStrength(integral, width, height, x, y, samplingRadius);

    let darkness = Math.pow(1 - baseLuma, toneCurve);
    darkness = clamp(darkness + edgeStrength * quality.edgeBoost * (1 - darkness), 0, 1);

    const bayer = BAYER_8X8[((gridY & 7) * 8) + (gridX & 7)] - 0.5;
    darkness = clamp(darkness + bayer * quality.ditherAmount * (1 - darkness * 0.55), 0, 1);
    if (darkness < 0.003) continue;

    const dotStrength = minDot + (1 - minDot) * darkness;
    const radius = clamp(dotStrength * radiusScale * (1 + edgeStrength * 0.12), 0, radiusScale);
    const jitterX = (hash2d(gridX, gridY, 0.1, seed) - 0.5) * cellSize * 0.5 * jitter;
    const jitterY = (hash2d(gridX, gridY, 0.9, seed) - 0.5) * cellSize * 0.5 * jitter;

    targetCtx.beginPath();
    targetCtx.arc(x + jitterX, y + jitterY, radius, 0, Math.PI * 2);
    targetCtx.fill();

    if (microDotAmount <= 0 || darkness >= 0.6) continue;

    const microBase = microDotAmount * (1 - darkness);
    const microRadius = Math.max(0.35, cellSize * 0.085 * (0.4 + microDotAmount));
    const maxMicroDots = Math.min(3, Math.ceil(microBase * 3));

    for (let microIndex = 0; microIndex < maxMicroDots; microIndex += 1) {
      const salt = 2.4 + microIndex * 1.7;
      const chance = microBase * (0.65 - microIndex * 0.15);
      if (hash2d(gridX, gridY, salt, seed) > chance) continue;

      const [offsetX, offsetY] = MICRO_DOT_OFFSETS[microIndex];
      const microX = x + (offsetX + (hash2d(gridX, gridY, salt + 1.2, seed) - 0.5) * 0.2) * cellSize;
      const microY = y + (offsetY + (hash2d(gridX, gridY, salt + 2.4, seed) - 0.5) * 0.2) * cellSize;

      targetCtx.beginPath();
      targetCtx.arc(microX, microY, microRadius, 0, Math.PI * 2);
      targetCtx.fill();
    }
  }
}

export function renderHalftoneSync(targetCtx, pixelData, width, height, settings) {
  const integral = buildLumaIntegral(pixelData, width, height, settings.contrast, settings.gamma);
  const state = createRenderState(targetCtx, integral, width, height, settings);

  for (let gridY = -state.diagonal; gridY <= state.diagonal; gridY += settings.cellSize) {
    renderGridRow(state, gridY);
  }
}

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function renderHalftoneAsync(targetCtx, pixelData, width, height, settings, options = {}) {
  const {
    onProgress = () => {},
    shouldCancel = () => false,
    yieldControl = yieldToEventLoop,
    integralChunkRows = 24,
    renderChunkRows = 8
  } = options;
  const integral = new Float32Array((width + 1) * (height + 1));

  for (let startY = 0; startY < height; startY += integralChunkRows) {
    if (shouldCancel()) return { cancelled: true };
    const endY = Math.min(height, startY + integralChunkRows);
    fillIntegralRows(integral, pixelData, width, settings.contrast, settings.gamma, startY, endY);
    onProgress((endY / height) * 0.5);
    await yieldControl();
  }

  if (shouldCancel()) return { cancelled: true };
  const state = createRenderState(targetCtx, integral, width, height, settings);
  const totalGridRows = Math.floor((state.diagonal * 2) / settings.cellSize) + 1;
  let renderedGridRows = 0;
  let rowsSinceYield = 0;

  for (let gridY = -state.diagonal; gridY <= state.diagonal; gridY += settings.cellSize) {
    renderGridRow(state, gridY);
    renderedGridRows += 1;
    rowsSinceYield += 1;

    if (rowsSinceYield < renderChunkRows) continue;
    if (shouldCancel()) return { cancelled: true };
    onProgress(0.5 + (renderedGridRows / totalGridRows) * 0.5);
    rowsSinceYield = 0;
    await yieldControl();
  }

  if (shouldCancel()) return { cancelled: true };
  onProgress(1);
  return { cancelled: false };
}
