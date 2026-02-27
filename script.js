const previewCanvas = document.getElementById("previewCanvas");
const previewCtx = previewCanvas.getContext("2d");
const canvasWrap = document.querySelector(".canvas-wrap");

const hiddenCanvas = document.createElement("canvas");
const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });

const controls = {
  imageInput: document.getElementById("imageInput"),
  presetSelect: document.getElementById("presetSelect"),
  cellSize: document.getElementById("cellSize"),
  contrast: document.getElementById("contrast"),
  gamma: document.getElementById("gamma"),
  minDot: document.getElementById("minDot"),
  screenAngle: document.getElementById("screenAngle"),
  toneCurve: document.getElementById("toneCurve"),
  microDot: document.getElementById("microDot"),
  jitter: document.getElementById("jitter"),
  inkColor: document.getElementById("inkColor"),
  paperColor: document.getElementById("paperColor"),
  regenerateBtn: document.getElementById("regenerateBtn"),
  exportBtn: document.getElementById("exportBtn"),
  cellSizeOut: document.getElementById("cellSizeOut"),
  contrastOut: document.getElementById("contrastOut"),
  gammaOut: document.getElementById("gammaOut"),
  minDotOut: document.getElementById("minDotOut"),
  angleOut: document.getElementById("angleOut"),
  toneCurveOut: document.getElementById("toneCurveOut"),
  microDotOut: document.getElementById("microDotOut"),
  jitterOut: document.getElementById("jitterOut")
};

const presets = {
  clean: {
    cellSize: 8,
    contrast: 1.1,
    gamma: 1.0,
    minDot: 0,
    screenAngle: 22,
    toneCurve: 1.1,
    microDot: 16,
    jitter: 4,
    inkColor: "#111111",
    paperColor: "#f5f5f5"
  },
  bold: {
    cellSize: 11,
    contrast: 1.5,
    gamma: 0.85,
    minDot: 8,
    screenAngle: 35,
    toneCurve: 0.75,
    microDot: 10,
    jitter: 12,
    inkColor: "#0f0f0f",
    paperColor: "#ececec"
  },
  subtle: {
    cellSize: 6,
    contrast: 0.9,
    gamma: 1.25,
    minDot: 4,
    screenAngle: 18,
    toneCurve: 1.35,
    microDot: 28,
    jitter: 8,
    inkColor: "#202020",
    paperColor: "#f4f4f4"
  },
  flash: {
    cellSize: 7,
    contrast: 1.45,
    gamma: 0.88,
    minDot: 10,
    screenAngle: 30,
    toneCurve: 0.72,
    microDot: 48,
    jitter: 18,
    inkColor: "#1f9377",
    paperColor: "#eeebda"
  }
};

let sourceImage = null;
let resizeTimer = null;

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const parsed = parseInt(value, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function hash2d(x, y, seed = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + seed * 17.13) * 43758.5453123;
  return v - Math.floor(v);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateOutputs() {
  controls.cellSizeOut.textContent = `${controls.cellSize.value} px`;
  controls.contrastOut.textContent = Number(controls.contrast.value).toFixed(2);
  controls.gammaOut.textContent = Number(controls.gamma.value).toFixed(2);
  controls.minDotOut.textContent = `${controls.minDot.value}%`;
  controls.angleOut.textContent = `${controls.screenAngle.value} deg`;
  controls.toneCurveOut.textContent = Number(controls.toneCurve.value).toFixed(2);
  controls.microDotOut.textContent = `${controls.microDot.value}%`;
  controls.jitterOut.textContent = `${controls.jitter.value}%`;
}

function fitCanvasToStage() {
  const stageRect = canvasWrap.getBoundingClientRect();
  const stageWidth = Math.max(320, Math.floor(stageRect.width));
  const stageHeight = Math.max(260, Math.floor(stageRect.height));
  const maxDisplayWidth = 1320;
  const maxDisplayHeight = 860;
  const availableWidth = Math.min(stageWidth, maxDisplayWidth);
  const availableHeight = Math.min(stageHeight, maxDisplayHeight);
  const aspect = sourceImage ? sourceImage.width / sourceImage.height : 3 / 2;

  let cssWidth = availableWidth;
  let cssHeight = Math.floor(cssWidth / aspect);

  if (cssHeight > availableHeight) {
    cssHeight = availableHeight;
    cssWidth = Math.floor(cssHeight * aspect);
  }

  const dpr = window.devicePixelRatio || 1;
  let backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  let backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  const maxPixels = 5_000_000;
  const pixels = backingWidth * backingHeight;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    backingWidth = Math.max(1, Math.floor(backingWidth * scale));
    backingHeight = Math.max(1, Math.floor(backingHeight * scale));
  }

  if (previewCanvas.width !== backingWidth || previewCanvas.height !== backingHeight) {
    previewCanvas.width = backingWidth;
    previewCanvas.height = backingHeight;
    hiddenCanvas.width = backingWidth;
    hiddenCanvas.height = backingHeight;
  }

  previewCanvas.style.width = `${cssWidth}px`;
  previewCanvas.style.height = `${cssHeight}px`;
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;

  Object.entries(preset).forEach(([key, value]) => {
    if (controls[key]) {
      controls[key].value = String(value);
    }
  });

  updateOutputs();
  generateHalftone();
}

function drawPlaceholder() {
  fitCanvasToStage();

  const { width, height } = previewCanvas;
  previewCtx.fillStyle = "#0b0b0b";
  previewCtx.fillRect(0, 0, width, height);
}

function adjustedLuma(r, g, b, contrast, gamma) {
  let value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  value = Math.pow(value, gamma);
  value = (value - 0.5) * contrast + 0.5;
  return clamp(value, 0, 1);
}

function sampleLuma(data, width, height, x, y, contrast, gamma) {
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const idx = (py * width + px) * 4;
  return adjustedLuma(data[idx], data[idx + 1], data[idx + 2], contrast, gamma);
}

function generateHalftone() {
  fitCanvasToStage();

  if (!sourceImage) {
    drawPlaceholder();
    return;
  }

  const cellSize = Number(controls.cellSize.value);
  const contrast = Number(controls.contrast.value);
  const gamma = Number(controls.gamma.value);
  const minDot = Number(controls.minDot.value) / 100;
  const angle = (Number(controls.screenAngle.value) * Math.PI) / 180;
  const toneCurve = Number(controls.toneCurve.value);
  const microDotAmount = Number(controls.microDot.value) / 100;
  const jitter = Number(controls.jitter.value) / 100;

  const ink = hexToRgb(controls.inkColor.value);
  const paper = hexToRgb(controls.paperColor.value);

  hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
  hiddenCtx.drawImage(sourceImage, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

  const imageData = hiddenCtx.getImageData(0, 0, hiddenCanvas.width, hiddenCanvas.height);
  const data = imageData.data;

  previewCtx.fillStyle = `rgb(${paper.r} ${paper.g} ${paper.b})`;
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
  previewCtx.fillStyle = `rgb(${ink.r} ${ink.g} ${ink.b})`;

  const centerX = hiddenCanvas.width * 0.5;
  const centerY = hiddenCanvas.height * 0.5;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const diagonal = Math.sqrt(hiddenCanvas.width * hiddenCanvas.width + hiddenCanvas.height * hiddenCanvas.height);
  const radiusScale = cellSize * 0.5;

  for (let gy = -diagonal; gy <= diagonal; gy += cellSize) {
    for (let gx = -diagonal; gx <= diagonal; gx += cellSize) {
      const x = centerX + gx * cos - gy * sin;
      const y = centerY + gx * sin + gy * cos;

      if (x < 0 || y < 0 || x >= hiddenCanvas.width || y >= hiddenCanvas.height) continue;

      const luma = sampleLuma(data, hiddenCanvas.width, hiddenCanvas.height, x, y, contrast, gamma);
      const darkness = Math.pow(1 - luma, toneCurve);

      if (darkness < 0.004) continue;

      const dotStrength = minDot + (1 - minDot) * darkness;
      const radius = dotStrength * radiusScale;

      const gridX = Math.round((gx + diagonal) / cellSize);
      const gridY = Math.round((gy + diagonal) / cellSize);
      const jx = (hash2d(gridX, gridY, 0.1) - 0.5) * cellSize * 0.5 * jitter;
      const jy = (hash2d(gridX, gridY, 0.9) - 0.5) * cellSize * 0.5 * jitter;

      previewCtx.beginPath();
      previewCtx.arc(x + jx, y + jy, radius, 0, Math.PI * 2);
      previewCtx.fill();

      if (microDotAmount <= 0 || darkness >= 0.62) continue;

      const microChance = microDotAmount * (1 - darkness) * 0.62;
      if (hash2d(gridX, gridY, 2.4) > microChance) continue;

      const microRadius = Math.max(0.35, cellSize * 0.085 * (0.4 + microDotAmount));
      const mx = x + (hash2d(gridX, gridY, 3.6) - 0.5) * cellSize * 0.35;
      const my = y + (hash2d(gridX, gridY, 4.8) - 0.5) * cellSize * 0.35;

      previewCtx.beginPath();
      previewCtx.arc(mx, my, microRadius, 0, Math.PI * 2);
      previewCtx.fill();
    }
  }
}

function loadImageFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      generateHalftone();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function exportPng() {
  const url = previewCanvas.toDataURL("image/png");
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  link.href = url;
  link.download = `halftone-${timestamp}.png`;
  link.click();
}

controls.imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadImageFromFile(file);
});

controls.presetSelect.addEventListener("change", () => {
  applyPreset(controls.presetSelect.value);
});

[
  controls.cellSize,
  controls.contrast,
  controls.gamma,
  controls.minDot,
  controls.screenAngle,
  controls.toneCurve,
  controls.microDot,
  controls.jitter
].forEach((input) => {
  input.addEventListener("input", () => {
    updateOutputs();
    generateHalftone();
  });
});

[controls.inkColor, controls.paperColor].forEach((input) => {
  input.addEventListener("input", generateHalftone);
});

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    generateHalftone();
  }, 120);
});

controls.regenerateBtn.addEventListener("click", generateHalftone);
controls.exportBtn.addEventListener("click", exportPng);

updateOutputs();
applyPreset("flash");
if (!sourceImage) {
  drawPlaceholder();
}
