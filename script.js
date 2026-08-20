import { GrainPass } from "./grain-pass.js";
import { BloomPass } from "./bloom-pass.js";
import { CRTPass } from "./crt-pass.js";

const PLACEHOLDER_URL = new URL("./placeholder.jpg", import.meta.url).href;

const grainPass = new GrainPass();
const bloomPass = new BloomPass();
const crtPass = new CRTPass();
let grainSeed = Math.random();

// ── Image persistence via IndexedDB ──
const DB_NAME = "halftone", DB_STORE = "image", DB_KEY = "last";

// iOS Safari can leave indexedDB.open() pending forever — private browsing,
// restored tabs, evicted storage — firing neither success nor error. Nothing
// on the boot path may wait on it unconditionally or the canvas never paints.
const DB_TIMEOUT_MS = 1500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}

function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error("IndexedDB blocked"));
  });
}
function saveImageToDb(dataUrl) {
  openDb().then(db => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(dataUrl, DB_KEY);
  }).catch(() => {});
}
function loadImageFromDb() {
  return openDb().then(db => new Promise((res, rej) => {
    const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  }));
}

const previewCanvas = document.getElementById("previewCanvas");
const sourceCanvas = document.getElementById("sourceCanvas");
const previewCtx = previewCanvas.getContext("2d");
const sourceCtx = sourceCanvas.getContext("2d");

const canvasWrap = document.getElementById("compareStage");
const canvasPlane = document.getElementById("canvasPlane");
const halftoneOverlay = document.getElementById("halftoneOverlay");
const splitHandle = document.getElementById("splitHandle");

const hiddenCanvas = document.createElement("canvas");
const hiddenCtx = hiddenCanvas.getContext("2d", { willReadFrequently: true });

if (!previewCtx || !sourceCtx || !hiddenCtx) {
  throw new Error("Canvas context is unavailable.");
}

const DEFAULT_QUALITY = "high";
const DEFAULT_PRESET = "red";
const CUSTOM_PRESETS_KEY = "halftone.customPresets.v1";

const PRESET_FIELDS = [
  "quality",
  "cellSize",
  "contrast",
  "gamma",
  "minDot",
  "screenAngle",
  "toneCurve",
  "inkColor",
  "paperColor"
];

// Post-processing was added after the preset format, so these are optional on
// disk. Applying a preset always writes them — falling back to 0 — so built-in
// presets reset any effects the user had dialled in.
const POSTFX_DEFAULTS = {
  grainStrength: 0,
  bloomStrength: 0,
  crtStrength: 0
};

const PRESET_LABELS = {
  red: "Crimson Poster",
  orange: "Amber Press",
  neon: "Electric",
  blue: "Blueprint",
  fine: "Fine Screen"
};

const QUALITY_MODES = {
  draft: {
    sampleRadius: 0.4,
    edgeBoost: 0.12,
    ditherAmount: 0.06,
    exportScale: 1,
    maxPixels: 5_000_000
  },
  high: {
    sampleRadius: 0.58,
    edgeBoost: 0.22,
    ditherAmount: 0.1,
    exportScale: 2,
    maxPixels: 8_000_000
  },
  ultra: {
    sampleRadius: 0.7,
    edgeBoost: 0.3,
    ditherAmount: 0.14,
    exportScale: 3,
    maxPixels: 10_500_000
  },
  print: {
    sampleRadius: 1.0,
    edgeBoost: 0.1,
    ditherAmount: 0,
    exportScale: 4,
    maxPixels: 10_500_000
  }
};

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

const controls = {
  imageInput: document.getElementById("imageInput"),
  presetSelect: document.getElementById("presetSelect"),
  quality: document.getElementById("quality"),
  cellSize: document.getElementById("cellSize"),
  contrast: document.getElementById("contrast"),
  gamma: document.getElementById("gamma"),
  minDot: document.getElementById("minDot"),
  screenAngle: document.getElementById("screenAngle"),
  toneCurve: document.getElementById("toneCurve"),
  inkColor: document.getElementById("inkColor"),
  paperColor: document.getElementById("paperColor"),
  exportBtn: document.getElementById("exportBtn"),
  savePresetBtn: document.getElementById("savePresetBtn"),
  deletePresetBtn: document.getElementById("deletePresetBtn"),
  presetActions: document.getElementById("presetActions"),
  presetNamer: document.getElementById("presetNamer"),
  presetNameInput: document.getElementById("presetNameInput"),
  presetNameSave: document.getElementById("presetNameSave"),
  presetNameCancel: document.getElementById("presetNameCancel"),
  presetNote: document.getElementById("presetNote"),
  zoomRange: document.getElementById("zoomRange"),
  resetViewBtn: document.getElementById("resetViewBtn"),
  renderStatus: document.getElementById("renderStatus"),
  grainStrength: document.getElementById("grainStrength"),
  grainOut: document.getElementById("grainOut"),
  bloomStrength: document.getElementById("bloomStrength"),
  bloomOut: document.getElementById("bloomOut"),
  crtStrength: document.getElementById("crtStrength"),
  crtOut: document.getElementById("crtOut"),
  cellSizeOut: document.getElementById("cellSizeOut"),
  contrastOut: document.getElementById("contrastOut"),
  gammaOut: document.getElementById("gammaOut"),
  minDotOut: document.getElementById("minDotOut"),
  angleOut: document.getElementById("angleOut"),
  toneCurveOut: document.getElementById("toneCurveOut"),
  zoomOut: document.getElementById("zoomOut")
};

const builtInPresets = {
  red: {
    quality: "ultra",
    cellSize: 9,
    contrast: 1.9,
    gamma: 0.7,
    minDot: 10,
    screenAngle: 22,
    toneCurve: 0.58,
    microDot: 14,
    jitter: 4,
    seed: 11,
    inkColor: "#cc0000",
    paperColor: "#f5f5f5"
  },
  orange: {
    quality: "high",
    cellSize: 6,
    contrast: 1.65,
    gamma: 0.78,
    minDot: 7,
    screenAngle: 15,
    toneCurve: 0.72,
    microDot: 32,
    jitter: 14,
    seed: 42,
    inkColor: "#d4580c",
    paperColor: "#fff4ec"
  },
  neon: {
    quality: "ultra",
    cellSize: 6,
    contrast: 1.8,
    gamma: 0.74,
    minDot: 6,
    screenAngle: 30,
    toneCurve: 0.62,
    microDot: 10,
    jitter: 4,
    seed: 99,
    inkColor: "#0a0a0a",
    paperColor: "#00ff87"
  },
  blue: {
    quality: "high",
    cellSize: 10,
    contrast: 1.7,
    gamma: 0.78,
    minDot: 10,
    screenAngle: 45,
    toneCurve: 0.65,
    microDot: 15,
    jitter: 8,
    seed: 256,
    inkColor: "#1d3fd8",
    paperColor: "#eef2ff"
  },
  fine: {
    quality: "print",
    cellSize: 8,
    contrast: 1.65,
    gamma: 0.9,
    minDot: 0,
    screenAngle: 30,
    toneCurve: 1.0,
    microDot: 0,
    jitter: 0,
    seed: 0,
    inkColor: "#0a0a0a",
    paperColor: "#f8f8f8"
  }
};

const compareState = {
  split: 0.5,
  zoom: 1,
  draggingSplit: false
};

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_SLIDER_MIDPOINT = 50;

let sourceImage = null;
let resizeTimer = null;
let renderFrame = null;
let hiddenJitter = 6;
let hiddenMicroDot = 24;
let hiddenSeed = 0;
let customPresets = {};

let renderWorker = null;
let workerEnabled = false;
let renderRequestId = 0;
let workerBusy = false;
let renderQueued = false;

let scaledSource = null;
let scaledSourceKey = "";
let sourceToken = 0;

// Phones and tablets: cap the backing store well below the desktop budget and
// clamp DPR, or an `ultra` preset at DPR 3 asks for ~10M pixels per render.
const COMPACT_MAX_PIXELS = 2_500_000;

function isCompactDevice() {
  return window.matchMedia("(max-width: 980px), (pointer: coarse)").matches;
}

function isIOS() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setSourceImage(image) {
  sourceImage = image;
  sourceToken += 1;
  scaledSourceKey = "";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberValue(control, fallback = 0) {
  const parsed = Number(control.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const parsed = parseInt(value, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255
  };
}

function hash2d(x, y, salt, seed) {
  const v = Math.sin((x + seed * 0.137) * 127.1 + (y + seed * 0.311) * 311.7 + (salt + seed * 0.017) * 17.13) * 43758.5453123;
  return v - Math.floor(v);
}

function getQualityConfig() {
  return QUALITY_MODES[controls.quality.value] || QUALITY_MODES[DEFAULT_QUALITY];
}

// `visible` is opt-in: routine Rendering/Ready churn stays hidden, but states
// the user needs to see — loading, empty, failure — are shown. Without this a
// stalled boot is indistinguishable from a black image.
function setRenderStatus(text, busy = false, visible = false) {
  controls.renderStatus.textContent = text;
  controls.renderStatus.dataset.busy = busy ? "true" : "false";
  controls.renderStatus.dataset.visible = visible ? "true" : "false";
}

function sanitizePreset(rawPreset) {
  if (!rawPreset || typeof rawPreset !== "object") return null;

  const sanitized = {
    quality: typeof rawPreset.quality === "string" ? rawPreset.quality : DEFAULT_QUALITY,
    cellSize: Number(rawPreset.cellSize),
    contrast: Number(rawPreset.contrast),
    gamma: Number(rawPreset.gamma),
    minDot: Number(rawPreset.minDot),
    screenAngle: Number(rawPreset.screenAngle),
    toneCurve: Number(rawPreset.toneCurve),
    microDot: Number(rawPreset.microDot),
    jitter: Number(rawPreset.jitter),
    seed: Number(rawPreset.seed),
    inkColor: typeof rawPreset.inkColor === "string" ? rawPreset.inkColor : "#111111",
    paperColor: typeof rawPreset.paperColor === "string" ? rawPreset.paperColor : "#f5f5f5"
  };

  // Optional so presets saved before post-processing existed still load.
  Object.entries(POSTFX_DEFAULTS).forEach(([key, fallback]) => {
    const parsed = Number(rawPreset[key]);
    sanitized[key] = Number.isFinite(parsed) ? parsed : fallback;
  });

  if (!QUALITY_MODES[sanitized.quality]) {
    sanitized.quality = DEFAULT_QUALITY;
  }

  const numericKeys = ["cellSize", "contrast", "gamma", "minDot", "screenAngle", "toneCurve", "microDot", "jitter", "seed"];
  if (numericKeys.some((key) => !Number.isFinite(sanitized[key]))) {
    return null;
  }

  return sanitized;
}

function loadCustomPresets() {
  try {
    const serialized = window.localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!serialized) return {};

    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") return {};

    const next = {};
    Object.entries(parsed).forEach(([name, preset]) => {
      if (typeof name !== "string" || !name.trim()) return;
      if (Object.prototype.hasOwnProperty.call(builtInPresets, name)) return;
      const sanitized = sanitizePreset(preset);
      if (sanitized) next[name] = sanitized;
    });

    return next;
  } catch {
    return {};
  }
}

function persistCustomPresets() {
  try {
    window.localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets));
  } catch {
    // Ignore write errors (e.g. storage blocked).
  }
}

function formatPresetLabel(name) {
  return PRESET_LABELS[name] || name;
}

function rebuildPresetSelect(selectedName = DEFAULT_PRESET) {
  controls.presetSelect.textContent = "";

  const builtInGroup = document.createElement("optgroup");
  builtInGroup.label = "Built-in";
  Object.keys(builtInPresets).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = formatPresetLabel(name);
    builtInGroup.append(option);
  });
  controls.presetSelect.append(builtInGroup);

  const customNames = Object.keys(customPresets).sort((a, b) => a.localeCompare(b));
  if (customNames.length > 0) {
    const customGroup = document.createElement("optgroup");
    customGroup.label = "Saved";
    customNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      customGroup.append(option);
    });
    controls.presetSelect.append(customGroup);
  }

  const hasSelected =
    Object.prototype.hasOwnProperty.call(builtInPresets, selectedName) ||
    Object.prototype.hasOwnProperty.call(customPresets, selectedName);
  controls.presetSelect.value = hasSelected ? selectedName : DEFAULT_PRESET;
}

function getPresetByName(name) {
  return builtInPresets[name] || customPresets[name] || null;
}

function captureCurrentPreset() {
  const captured = {
    quality: controls.quality.value,
    cellSize: numberValue(controls.cellSize, 8),
    contrast: numberValue(controls.contrast, 1.1),
    gamma: numberValue(controls.gamma, 1),
    minDot: numberValue(controls.minDot, 0),
    screenAngle: numberValue(controls.screenAngle, 0),
    toneCurve: numberValue(controls.toneCurve, 1),
    microDot: hiddenMicroDot,
    jitter: hiddenJitter,
    seed: hiddenSeed,
    inkColor: controls.inkColor.value,
    paperColor: controls.paperColor.value
  };

  Object.entries(POSTFX_DEFAULTS).forEach(([key, fallback]) => {
    captured[key] = numberValue(controls[key], fallback);
  });

  return captured;
}

function setPresetNote(message) {
  controls.presetNote.textContent = message;
}

// Fields the user can actually reach from the rail. microDot/jitter/seed come
// from the preset and have no control, so they can never diverge.
const PRESET_COMPARE_FIELDS = [
  "quality",
  "cellSize",
  "contrast",
  "gamma",
  "minDot",
  "screenAngle",
  "toneCurve",
  "inkColor",
  "paperColor",
  ...Object.keys(POSTFX_DEFAULTS)
];

function isPresetModified() {
  const preset = getPresetByName(controls.presetSelect.value);
  if (!preset) return false;

  const current = captureCurrentPreset();

  return PRESET_COMPARE_FIELDS.some((key) => {
    const mine = current[key];
    const theirs = key in POSTFX_DEFAULTS ? preset[key] ?? POSTFX_DEFAULTS[key] : preset[key];

    return typeof mine === "number"
      ? mine !== Number(theirs)
      : String(mine).toLowerCase() !== String(theirs).toLowerCase();
  });
}

function syncPresetActions() {
  const selected = controls.presetSelect.value;
  const isCustom = Object.prototype.hasOwnProperty.call(customPresets, selected);
  const modified = isPresetModified();

  controls.deletePresetBtn.hidden = !isCustom;
  controls.deletePresetBtn.title = isCustom ? `Delete "${selected}"` : "";

  // Saving is meaningful only after the selected preset has been edited.
  controls.savePresetBtn.disabled = !modified;
  controls.savePresetBtn.title = modified ? "" : "Adjust a setting to enable saving.";
  controls.savePresetBtn.classList.toggle("button-primary", modified);
  controls.savePresetBtn.textContent = modified && isCustom ? "Update Preset" : "Save Preset";
}

function openPresetNamer() {
  if (controls.savePresetBtn.disabled) return;
  const active = controls.presetSelect.value;
  controls.presetNameInput.value = Object.prototype.hasOwnProperty.call(customPresets, active) ? active : "";
  controls.presetActions.hidden = true;
  controls.presetNamer.hidden = false;
  setPresetNote("");
  controls.presetNameInput.focus();
  controls.presetNameInput.select();
}

function closePresetNamer() {
  controls.presetNamer.hidden = true;
  controls.presetActions.hidden = false;
  setPresetNote("");
}

function savePresetByName(rawName) {
  const name = rawName.trim();
  if (!name) {
    return { ok: false, message: "Give the preset a name." };
  }

  if (Object.prototype.hasOwnProperty.call(builtInPresets, name)) {
    return { ok: false, message: "That name belongs to a built-in preset." };
  }

  customPresets[name] = captureCurrentPreset();
  persistCustomPresets();
  rebuildPresetSelect(name);
  syncPresetActions();
  return { ok: true, name };
}

function saveCurrentPreset() {
  const result = savePresetByName(controls.presetNameInput.value);
  if (!result.ok) {
    setPresetNote(result.message);
    controls.presetNameInput.focus();
    return;
  }

  closePresetNamer();
  emitStudioState();
}

function deleteCurrentPreset() {
  const selected = controls.presetSelect.value;
  if (!Object.prototype.hasOwnProperty.call(customPresets, selected)) return;
  if (!window.confirm(`Delete preset "${selected}"?`)) return;

  delete customPresets[selected];
  persistCustomPresets();
  closePresetNamer();
  rebuildPresetSelect(DEFAULT_PRESET);
  applyPreset(DEFAULT_PRESET);
  syncPresetActions();
  emitStudioState();
}

function updateZoomOutput() {
  const zoomPercent = Math.round(compareState.zoom * 100);
  controls.zoomOut.textContent = `${zoomPercent}%`;
  controls.zoomRange.value = zoomToSliderValue(compareState.zoom).toFixed(2);
  controls.zoomRange.setAttribute("aria-valuenow", String(zoomPercent));
  controls.zoomRange.setAttribute("aria-valuetext", `${zoomPercent}%`);
  updateSliderFill(controls.zoomRange);
}

function zoomToSliderValue(zoom) {
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);

  if (safeZoom <= 1) {
    return ZOOM_SLIDER_MIDPOINT * Math.log(safeZoom / MIN_ZOOM) / Math.log(1 / MIN_ZOOM);
  }

  return ZOOM_SLIDER_MIDPOINT
    + ZOOM_SLIDER_MIDPOINT * Math.log(safeZoom) / Math.log(MAX_ZOOM);
}

function sliderValueToZoom(value) {
  const position = clamp(value, 0, 100);

  if (position <= ZOOM_SLIDER_MIDPOINT) {
    return MIN_ZOOM * Math.pow(1 / MIN_ZOOM, position / ZOOM_SLIDER_MIDPOINT);
  }

  return Math.pow(MAX_ZOOM, (position - ZOOM_SLIDER_MIDPOINT) / ZOOM_SLIDER_MIDPOINT);
}

function applyViewTransform() {
  canvasPlane.style.transform = `translate(-50%, -50%) scale(${compareState.zoom})`;
  updateZoomOutput();
  updateSplitPreview();
}

function resetView() {
  compareState.zoom = 1;
  applyViewTransform();
}

function setZoom(nextZoom) {
  compareState.zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  applyViewTransform();
}

function updateSplitPreview() {
  const split = clamp(compareState.split, 0, 1);
  compareState.split = split;
  const splitPercent = Math.round(split * 100);

  splitHandle.setAttribute("aria-valuenow", String(splitPercent));
  splitHandle.setAttribute("aria-valuetext", `${splitPercent}% halftone and ${100 - splitPercent}% source`);

  const rightInset = (1 - split) * 100;
  halftoneOverlay.style.clipPath = `inset(0 ${rightInset}% 0 0)`;

  const wrapRect = canvasWrap.getBoundingClientRect();
  const planeRect = canvasPlane.getBoundingClientRect();
  const planeWidth = planeRect.width;
  const planeHeight = planeRect.height;

  if (planeWidth > 0 && planeHeight > 0) {
    const left = planeRect.left - wrapRect.left + planeWidth * split;
    const top = planeRect.top - wrapRect.top;
    splitHandle.style.left = `${left}px`;
    splitHandle.style.top = `${top}px`;
    splitHandle.style.height = `${planeHeight}px`;
  } else {
    splitHandle.style.left = "50%";
    splitHandle.style.top = "0";
    splitHandle.style.height = "100%";
  }
}

function setSplitFromClientX(clientX) {
  const planeRect = canvasPlane.getBoundingClientRect();
  if (planeRect.width <= 0) return;

  compareState.split = (clientX - planeRect.left) / planeRect.width;
  updateSplitPreview();
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

  const compact = isCompactDevice();
  const dpr = Math.min(window.devicePixelRatio || 1, compact ? 2 : 3);
  let backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  let backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  const maxPixels = compact
    ? Math.min(getQualityConfig().maxPixels, COMPACT_MAX_PIXELS)
    : getQualityConfig().maxPixels;
  const pixels = backingWidth * backingHeight;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    backingWidth = Math.max(1, Math.floor(backingWidth * scale));
    backingHeight = Math.max(1, Math.floor(backingHeight * scale));
  }

  const resized = previewCanvas.width !== backingWidth || previewCanvas.height !== backingHeight;

  if (resized) {
    previewCanvas.width = backingWidth;
    previewCanvas.height = backingHeight;
    sourceCanvas.width = backingWidth;
    sourceCanvas.height = backingHeight;
    hiddenCanvas.width = backingWidth;
    hiddenCanvas.height = backingHeight;
  }

  const widthCss = `${cssWidth}px`;
  const heightCss = `${cssHeight}px`;

  previewCanvas.style.width = widthCss;
  previewCanvas.style.height = heightCss;
  sourceCanvas.style.width = widthCss;
  sourceCanvas.style.height = heightCss;
  canvasPlane.style.width = widthCss;
  canvasPlane.style.height = heightCss;

  return resized;
}

function drawPlaceholder() {
  sourceCtx.fillStyle = "#131313";
  sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

  previewCtx.fillStyle = "#0b0b0b";
  previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function drawSourcePreview() {
  if (!sourceImage) {
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    return;
  }

  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(getScaledSource(sourceCanvas.width, sourceCanvas.height), 0, 0);
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

function getRenderSettings() {
  return {
    cellSize: Math.max(1, numberValue(controls.cellSize, 8)),
    contrast: numberValue(controls.contrast, 1.1),
    gamma: numberValue(controls.gamma, 1),
    minDot: numberValue(controls.minDot, 0) / 100,
    angle: (numberValue(controls.screenAngle, 0) * Math.PI) / 180,
    toneCurve: numberValue(controls.toneCurve, 1),
    microDotAmount: hiddenMicroDot / 100,
    jitter: hiddenJitter / 100,
    seed: hiddenSeed,
    quality: getQualityConfig(),
    ink: hexToRgb(controls.inkColor.value),
    paper: hexToRgb(controls.paperColor.value)
  };
}

function renderHalftoneOnMain(targetCtx, width, height, settings) {
  const { cellSize, contrast, gamma, minDot, angle, toneCurve, microDotAmount, jitter, seed, quality, ink, paper } = settings;

  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  hiddenCtx.clearRect(0, 0, width, height);
  hiddenCtx.drawImage(sourceImage, 0, 0, width, height);

  const imageData = hiddenCtx.getImageData(0, 0, width, height);
  const { integral } = buildLumaBuffers(imageData.data, width, height, contrast, gamma);

  targetCtx.clearRect(0, 0, width, height);
  targetCtx.fillStyle = `rgb(${paper.r} ${paper.g} ${paper.b})`;
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.fillStyle = `rgb(${ink.r} ${ink.g} ${ink.b})`;

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

      targetCtx.beginPath();
      targetCtx.arc(x + jx, y + jy, radius, 0, Math.PI * 2);
      targetCtx.fill();

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

        targetCtx.beginPath();
        targetCtx.arc(mx, my, microRadius, 0, Math.PI * 2);
        targetCtx.fill();
      }
    }
  }
}

// The source was re-scaled from full resolution on every render, including
// every frame of a slider drag. Hold the scaled copy and rebuild it only when
// the image or the canvas size actually changes.
function getScaledSource(width, height) {
  const key = `${sourceToken}:${width}x${height}`;
  if (scaledSource && scaledSourceKey === key) return scaledSource;

  if (!scaledSource) scaledSource = document.createElement("canvas");
  scaledSource.width = width;
  scaledSource.height = height;

  const ctx = scaledSource.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(sourceImage, 0, 0, width, height);

  scaledSourceKey = key;
  return scaledSource;
}

function createScaledBitmap(width, height) {
  return createImageBitmap(getScaledSource(width, height));
}

function disableWorker() {
  workerEnabled = false;
  workerBusy = false;
  if (renderWorker) {
    renderWorker.terminate();
    renderWorker = null;
  }
}

// One render in flight at a time. A drag fires input per pixel; without this
// every frame posts more work than the worker can retire and the UI locks up.
function finishWorkerRender() {
  workerBusy = false;
  if (!renderQueued) return;
  renderQueued = false;
  requestRender();
}

function initializeWorker() {
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
    disableWorker();
    return;
  }

  try {
    renderWorker = new Worker(new URL("./renderer-worker.js", import.meta.url));
    workerEnabled = true;

    renderWorker.addEventListener("message", (event) => {
      const { type, requestId, bitmap } = event.data || {};

      if (type === "error") {
        if (requestId === renderRequestId) {
          disableWorker();
          const settings = getRenderSettings();
          renderHalftoneOnMain(previewCtx, previewCanvas.width, previewCanvas.height, settings);
          applyPostProcess(previewCtx, previewCanvas);
          setRenderStatus("Ready", false);
        }
        finishWorkerRender();
        return;
      }

      if (type !== "rendered") return;

      if (requestId !== renderRequestId) {
        if (bitmap && typeof bitmap.close === "function") bitmap.close();
        finishWorkerRender();
        return;
      }

      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
      applyPostProcess(previewCtx, previewCanvas);
      setRenderStatus("Ready", false);
      finishWorkerRender();
    });

    renderWorker.addEventListener("error", () => {
      disableWorker();
      requestRender();
    });
  } catch {
    disableWorker();
  }
}

function renderWithWorker(width, height, settings) {
  if (!renderWorker || !workerEnabled || !sourceImage) return;

  // Coalesce: hold the latest request until the in-flight one lands.
  if (workerBusy) {
    renderQueued = true;
    return;
  }

  const requestId = ++renderRequestId;
  workerBusy = true;
  setRenderStatus("Rendering…", true);

  createScaledBitmap(width, height)
    .then((sourceBitmap) => {
      if (requestId !== renderRequestId) {
        if (typeof sourceBitmap.close === "function") sourceBitmap.close();
        finishWorkerRender();
        return;
      }

      if (!renderWorker || !workerEnabled) {
        if (typeof sourceBitmap.close === "function") sourceBitmap.close();
        renderHalftoneOnMain(previewCtx, width, height, settings);
        applyPostProcess(previewCtx, previewCanvas);
        setRenderStatus("Ready", false);
        finishWorkerRender();
        return;
      }

      renderWorker.postMessage(
        {
          type: "render",
          requestId,
          width,
          height,
          settings,
          sourceBitmap
        },
        [sourceBitmap]
      );
    })
    .catch(() => {
      disableWorker();
      if (requestId === renderRequestId) {
        renderHalftoneOnMain(previewCtx, width, height, settings);
        applyPostProcess(previewCtx, previewCanvas);
        setRenderStatus("Ready", false);
      }
      finishWorkerRender();
    });
}

function generateHalftone() {
  fitCanvasToStage();
  updateSplitPreview();

  if (!sourceImage) {
    drawPlaceholder();
    setRenderStatus("Upload an image", false);
    return;
  }

  drawSourcePreview();

  const width = previewCanvas.width;
  const height = previewCanvas.height;
  const settings = getRenderSettings();

  if (workerEnabled && renderWorker) {
    renderWithWorker(width, height, settings);
    return;
  }

  setRenderStatus("Rendering…", true);
  renderHalftoneOnMain(previewCtx, width, height, settings);
  applyPostProcess(previewCtx, previewCanvas);
  setRenderStatus("Ready", false);
}

function requestRender() {
  if (renderFrame !== null) return;

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = null;
    generateHalftone();
  });
}

function applyPreset(name) {
  const preset = getPresetByName(name);
  if (!preset) return;

  PRESET_FIELDS.forEach((key) => {
    if (!(key in controls)) return;
    if (preset[key] === undefined) return;
    controls[key].value = String(preset[key]);
  });

  Object.entries(POSTFX_DEFAULTS).forEach(([key, fallback]) => {
    controls[key].value = String(preset[key] ?? fallback);
  });

  if (preset.jitter !== undefined) hiddenJitter = preset.jitter;
  if (preset.microDot !== undefined) hiddenMicroDot = preset.microDot;
  if (preset.seed !== undefined) hiddenSeed = preset.seed;

  controls.presetSelect.value = name;
  updateOutputs();
  syncPresetActions();
  requestRender();
}

function updateSliderFill(input) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value) || 0;
  input.style.setProperty("--val", (val - min) / (max - min));
}

function updateSliderFills() {
  document.querySelectorAll('input[type="range"]').forEach(updateSliderFill);
}

function runPostProcessChain(src) {
  const grain = parseFloat(controls.grainStrength.value) / 100 * 0.15;
  src = grainPass.apply(src, grain, grainSeed);

  const bloom = parseFloat(controls.bloomStrength.value) / 100;
  src = bloomPass.apply(src, bloom);

  const crt = parseFloat(controls.crtStrength.value) / 100;
  src = crtPass.apply(src, crt);

  return src;
}

function applyPostProcess(ctx, canvas) {
  const result = runPostProcessChain(canvas);
  if (result !== canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(result, 0, 0);
  }
}

function updateOutputs() {
  controls.grainOut.textContent = `${numberValue(controls.grainStrength, 0)}%`;
  controls.bloomOut.textContent = `${numberValue(controls.bloomStrength, 0)}%`;
  controls.crtOut.textContent = `${numberValue(controls.crtStrength, 0)}%`;
  controls.cellSizeOut.textContent = `${numberValue(controls.cellSize, 8)} px`;
  controls.contrastOut.textContent = numberValue(controls.contrast, 1.1).toFixed(2);
  controls.gammaOut.textContent = numberValue(controls.gamma, 1).toFixed(2);
  controls.minDotOut.textContent = `${numberValue(controls.minDot, 0)}%`;
  controls.angleOut.textContent = `${numberValue(controls.screenAngle, 0)} deg`;
  controls.toneCurveOut.textContent = numberValue(controls.toneCurve, 1).toFixed(2);
  updateZoomOutput();
  updateSliderFills();
}

function loadImageFromFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result !== "string") return;

    const img = new Image();
    img.onload = () => {
      setSourceImage(img);
      saveImageToDb(reader.result);
      resetView();
      requestRender();
    };
    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}

function exportPng() {
  if (!sourceImage) return;

  const quality = getQualityConfig();
  const scale = quality.exportScale;
  // iOS caps canvas area at 16,777,216px; past that the canvas silently
  // yields nothing, so a large export came back blank.
  const maxExportPixels = isIOS() ? 16_000_000 : 48_000_000;

  let exportWidth = previewCanvas.width * scale;
  let exportHeight = previewCanvas.height * scale;
  const exportPixels = exportWidth * exportHeight;

  if (exportPixels > maxExportPixels) {
    const factor = Math.sqrt(maxExportPixels / exportPixels);
    exportWidth = Math.floor(exportWidth * factor);
    exportHeight = Math.floor(exportHeight * factor);
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = Math.max(1, exportWidth);
  exportCanvas.height = Math.max(1, exportHeight);

  const exportCtx = exportCanvas.getContext("2d");
  if (!exportCtx) return;

  const settings = getRenderSettings();
  const pixelScale = exportCanvas.width / Math.max(1, previewCanvas.width);
  settings.cellSize = Math.max(1, settings.cellSize * pixelScale);
  renderHalftoneOnMain(exportCtx, exportCanvas.width, exportCanvas.height, settings);

  const exportSource = runPostProcessChain(exportCanvas);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const filename = `halftone-${timestamp}.png`;

  // A blob URL instead of a data URL: toDataURL materialises the whole PNG as
  // a base64 string, tens of megabytes at export sizes, which is exactly what
  // a memory-tight phone cannot spare.
  const save = (blob) => {
    if (!blob) {
      setRenderStatus("Export failed", false, true);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (typeof exportSource.toBlob === "function") {
    exportSource.toBlob(save, "image/png");
    return;
  }

  const link = document.createElement("a");
  link.href = exportSource.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function handleSplitPointerDown(event) {
  if (event.button !== 0) return;
  compareState.draggingSplit = true;
  splitHandle.setPointerCapture(event.pointerId);
  setSplitFromClientX(event.clientX);
}

function handleSplitPointerMove(event) {
  if (!compareState.draggingSplit) return;
  setSplitFromClientX(event.clientX);
}

function handleSplitPointerUp(event) {
  compareState.draggingSplit = false;
  if (splitHandle.hasPointerCapture(event.pointerId)) {
    splitHandle.releasePointerCapture(event.pointerId);
  }
}

// ── React inspector bridge ───────────────────────────────────────────────
// DialKit owns the visible controls. The renderer continues to read the
// native inputs, keeping the proven image pipeline independent from React.
const STUDIO_STATE_EVENT = "halftone:state";
const PANEL_SETTING_FIELDS = new Set(PRESET_COMPARE_FIELDS);

function getStudioState() {
  const selectedPreset = controls.presetSelect.value || DEFAULT_PRESET;
  return {
    theme: document.documentElement.classList.contains("light") ? "light" : "dark",
    selectedPreset,
    presetModified: isPresetModified(),
    isCustomPreset: Object.prototype.hasOwnProperty.call(customPresets, selectedPreset),
    presets: [
      ...Object.keys(builtInPresets).map((value) => ({ value, label: formatPresetLabel(value) })),
      ...Object.keys(customPresets)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }))
    ],
    settings: captureCurrentPreset()
  };
}

function emitStudioState() {
  window.dispatchEvent(new CustomEvent(STUDIO_STATE_EVENT, { detail: getStudioState() }));
}

function setPanelSetting(key, value) {
  if (!PANEL_SETTING_FIELDS.has(key) || !(key in controls)) return;
  controls[key].value = String(value);
  updateOutputs();
  syncPresetActions();
  requestRender();
  emitStudioState();
}

window.halftoneStudio = Object.freeze({
  eventName: STUDIO_STATE_EVENT,
  getState: getStudioState,
  setSetting: setPanelSetting,
  selectPreset(name) {
    applyPreset(name);
    closePresetNamer();
    emitStudioState();
  },
  uploadImage() {
    controls.imageInput.click();
  },
  savePreset(name) {
    const result = savePresetByName(name);
    if (result.ok) emitStudioState();
    return result;
  },
  deletePreset() {
    deleteCurrentPreset();
  },
  exportImage: exportPng
});

controls.imageInput.addEventListener("change", () => {
  const file = controls.imageInput.files?.[0];
  if (!file) return;
  loadImageFromFile(file);
});

document.addEventListener("paste", (event) => {
  const items = event.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      event.preventDefault();
      const file = item.getAsFile();
      if (file) loadImageFromFile(file);
      return;
    }
  }
});

controls.presetSelect.addEventListener("change", () => {
  applyPreset(controls.presetSelect.value);
  closePresetNamer();
});

controls.savePresetBtn.addEventListener("click", openPresetNamer);

controls.presetNameSave.addEventListener("click", saveCurrentPreset);
controls.presetNameCancel.addEventListener("click", closePresetNamer);
controls.deletePresetBtn.addEventListener("click", deleteCurrentPreset);

controls.presetNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveCurrentPreset();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closePresetNamer();
  }
});

controls.presetNameInput.addEventListener("input", () => setPresetNote(""));

controls.quality.addEventListener("change", requestRender);

[
  controls.cellSize,
  controls.contrast,
  controls.gamma,
  controls.minDot,
  controls.screenAngle,
  controls.toneCurve
].forEach((input) => {
  input.addEventListener("input", () => {
    updateOutputs();
    requestRender();
  });
});

[controls.inkColor, controls.paperColor].forEach((input) => {
  input.addEventListener("input", requestRender);
});

controls.zoomRange.addEventListener("input", () => {
  setZoom(sliderValueToZoom(numberValue(controls.zoomRange, ZOOM_SLIDER_MIDPOINT)));
  updateSliderFills();
});

controls.resetViewBtn.addEventListener("click", resetView);

splitHandle.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    compareState.split -= 0.02;
    updateSplitPreview();
    return;
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    compareState.split += 0.02;
    updateSplitPreview();
    return;
  }

  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    compareState.split = event.key === "Home" ? 0 : 1;
    updateSplitPreview();
  }
});

splitHandle.addEventListener("pointerdown", handleSplitPointerDown);
splitHandle.addEventListener("pointermove", handleSplitPointerMove);
splitHandle.addEventListener("pointerup", handleSplitPointerUp);
splitHandle.addEventListener("pointercancel", handleSplitPointerUp);

// iOS fires resize every time the URL bar slides in or out, i.e. on every
// scroll of the mobile layout. Only re-render if the backing store actually
// changed size — fitCanvasToStage already reports that.
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const resized = fitCanvasToStage();
    updateSplitPreview();
    if (resized) requestRender();
  }, 120);
});

controls.exportBtn.addEventListener("click", exportPng);

controls.grainStrength.addEventListener("input", () => { updateOutputs(); requestRender(); });
controls.bloomStrength.addEventListener("input", () => { updateOutputs(); requestRender(); });
controls.crtStrength.addEventListener("input", () => { updateOutputs(); requestRender(); });

// ── Theme toggle ──────────────────────────────────────────────────────────
const themeToggle = document.getElementById("themeToggle");
const iconSun = document.getElementById("iconSun");
const iconMoon = document.getElementById("iconMoon");
const THEME_KEY = "halftone.theme";

function applyTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("light", isLight);
  iconSun.style.display = isLight ? "none" : "";
  iconMoon.style.display = isLight ? "" : "none";
  themeToggle.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
  emitStudioState();
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("light") ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

customPresets = loadCustomPresets();
rebuildPresetSelect(DEFAULT_PRESET);
syncPresetActions();
initializeWorker();
resetView();
updateSplitPreview();
updateOutputs();
applyPreset(DEFAULT_PRESET);
emitStudioState();

// Boot image. Every path here must terminate: previously a stalled
// indexedDB.open() left both handlers unreached, so the placeholder never
// loaded and the canvas sat on drawPlaceholder()'s black fill forever.
function loadInitialImage() {
  const giveUp = () => {
    drawPlaceholder();
    setRenderStatus("Upload an image", false, true);
  };

  const tryLoad = (src, onError) => {
    const img = new Image();
    img.onload = () => {
      setSourceImage(img);
      setRenderStatus("Ready", false);
      resetView();
      requestRender();
    };
    img.onerror = onError;
    img.src = src;
  };

  setRenderStatus("Loading image…", true, true);

  withTimeout(loadImageFromDb().catch(() => null), DB_TIMEOUT_MS).then((dataUrl) => {
    if (dataUrl) {
      tryLoad(dataUrl, () => tryLoad(PLACEHOLDER_URL, giveUp));
      return;
    }
    tryLoad(PLACEHOLDER_URL, giveUp);
  });
}

if (!sourceImage) loadInitialImage();
