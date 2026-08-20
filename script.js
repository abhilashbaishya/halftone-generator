import { GrainPass } from "./grain-pass.js";
import { BloomPass } from "./bloom-pass.js";
import { CRTPass } from "./crt-pass.js";
import { renderHalftoneAsync, renderHalftoneSync } from "./renderer-core.js";
import { calculateExportDimensions, getExportPixelBudget } from "./export-policy.js";

const PLACEHOLDER_URL = new URL("./placeholder.jpg", import.meta.url).href;

const previewPasses = {
  grain: new GrainPass(),
  bloom: new BloomPass(),
  crt: new CRTPass()
};
const exportPasses = {
  grain: new GrainPass(),
  bloom: new BloomPass(),
  crt: new CRTPass()
};
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
    maxPixels: 5_000_000
  },
  high: {
    sampleRadius: 0.58,
    edgeBoost: 0.22,
    ditherAmount: 0.1,
    maxPixels: 8_000_000
  },
  ultra: {
    sampleRadius: 0.7,
    edgeBoost: 0.3,
    ditherAmount: 0.14,
    maxPixels: 10_500_000
  },
  print: {
    sampleRadius: 1.0,
    edgeBoost: 0.1,
    ditherAmount: 0,
    maxPixels: 10_500_000
  }
};

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
let exportRequestId = 0;
let activeExport = null;
let exportFeedbackTimer = null;

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
  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  hiddenCtx.clearRect(0, 0, width, height);
  hiddenCtx.drawImage(sourceImage, 0, 0, width, height);
  const imageData = hiddenCtx.getImageData(0, 0, width, height);
  renderHalftoneSync(targetCtx, imageData.data, width, height, settings);
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
    renderWorker = new Worker(new URL("./renderer-worker.js", import.meta.url), { type: "module" });
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

function runPostProcessChain(src, passes = previewPasses) {
  const grain = parseFloat(controls.grainStrength.value) / 100 * 0.15;
  src = passes.grain.apply(src, grain, grainSeed);

  const bloom = parseFloat(controls.bloomStrength.value) / 100;
  src = passes.bloom.apply(src, bloom);

  const crt = parseFloat(controls.crtStrength.value) / 100;
  src = passes.crt.apply(src, crt);

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

function hasPostEffects() {
  return numberValue(controls.grainStrength, 0) > 0
    || numberValue(controls.bloomStrength, 0) > 0
    || numberValue(controls.crtStrength, 0) > 0;
}

function getSourceDimensions() {
  return {
    width: sourceImage.naturalWidth || sourceImage.videoWidth || sourceImage.width,
    height: sourceImage.naturalHeight || sourceImage.videoHeight || sourceImage.height
  };
}

function setExportProgress(job, progress, label = "Cancel") {
  if (activeExport !== job) return;
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  controls.exportBtn.textContent = `${label} · ${percent}%`;
  controls.exportBtn.setAttribute("aria-label", `Cancel PNG export, ${percent}% complete`);
  setRenderStatus(`Exporting… ${percent}%`, true, true);
}

function setExportFeedback(text, resetDelay = 2200) {
  clearTimeout(exportFeedbackTimer);
  controls.exportBtn.textContent = text;
  controls.exportBtn.removeAttribute("aria-busy");
  controls.exportBtn.removeAttribute("aria-label");
  controls.exportBtn.dataset.exporting = "false";
  exportFeedbackTimer = setTimeout(() => {
    if (activeExport) return;
    controls.exportBtn.textContent = "Export PNG";
  }, resetDelay);
}

function formatFileSize(bytes) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("PNG export is not supported in this browser."));
      return;
    }

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode this PNG."));
    }, "image/png");
  });
}

function downloadExport(blob) {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `halftone-${timestamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function canUseExportWorker() {
  return Boolean(window.Worker && window.OffscreenCanvas && window.createImageBitmap);
}

function renderExportWithWorker(job, dimensions, settings, needsPostEffects) {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const worker = new Worker(new URL("./export-worker.js", import.meta.url), { type: "module" });
    job.worker = worker;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(job.forceCancelTimer);
      worker.terminate();
      job.worker = null;
      callback(value);
    };

    job.forceCancel = () => settle(resolve, { cancelled: true });

    worker.addEventListener("message", (event) => {
      const { type, requestId, progress, blob, bitmap, message } = event.data || {};
      if (requestId !== job.id) {
        if (bitmap && typeof bitmap.close === "function") bitmap.close();
        return;
      }

      if (type === "export-progress") {
        setExportProgress(job, progress);
      } else if (type === "export-cancelled") {
        settle(resolve, { cancelled: true });
      } else if (type === "export-complete") {
        settle(resolve, { blob });
      } else if (type === "export-rendered") {
        settle(resolve, { bitmap });
      } else if (type === "export-error") {
        settle(reject, new Error(message || "Export worker failed."));
      }
    });

    worker.addEventListener("error", (event) => {
      settle(reject, new Error(event.message || "Export worker failed."));
    });

    try {
      const sourceBitmap = await createImageBitmap(sourceImage);
      if (job.cancelled) {
        if (typeof sourceBitmap.close === "function") sourceBitmap.close();
        settle(resolve, { cancelled: true });
        return;
      }

      worker.postMessage({
        type: "export",
        requestId: job.id,
        width: dimensions.width,
        height: dimensions.height,
        settings,
        needsPostEffects,
        sourceBitmap
      }, [sourceBitmap]);
    } catch (error) {
      settle(reject, error);
    }
  });
}

async function renderExportOnMain(job, dimensions, settings) {
  const source = document.createElement("canvas");
  source.width = dimensions.width;
  source.height = dimensions.height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Canvas context is unavailable.");

  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(sourceImage, 0, 0, dimensions.width, dimensions.height);
  const imageData = sourceContext.getImageData(0, 0, dimensions.width, dimensions.height);
  source.width = 1;
  source.height = 1;

  const output = document.createElement("canvas");
  output.width = dimensions.width;
  output.height = dimensions.height;
  const outputContext = output.getContext("2d");
  if (!outputContext) throw new Error("Canvas context is unavailable.");

  const result = await renderHalftoneAsync(
    outputContext,
    imageData.data,
    dimensions.width,
    dimensions.height,
    settings,
    {
      shouldCancel: () => job.cancelled,
      onProgress: (progress) => setExportProgress(job, 4 + progress * 84)
    }
  );

  return result.cancelled ? { cancelled: true } : { canvas: output };
}

function cancelExport() {
  const job = activeExport;
  if (!job || job.cancelled) return;
  job.cancelled = true;
  controls.exportBtn.textContent = "Cancelling…";
  controls.exportBtn.setAttribute("aria-label", "Cancelling PNG export");
  setRenderStatus("Cancelling export…", true, true);

  if (job.worker) {
    job.worker.postMessage({ type: "cancel-export", requestId: job.id });
    job.forceCancelTimer = setTimeout(() => job.forceCancel?.(), 1000);
  }
}

async function exportPng() {
  if (activeExport) {
    cancelExport();
    return;
  }
  if (!sourceImage) return;

  clearTimeout(exportFeedbackTimer);
  const job = { id: ++exportRequestId, cancelled: false, worker: null };
  activeExport = job;
  controls.exportBtn.dataset.exporting = "true";
  controls.exportBtn.setAttribute("aria-busy", "true");
  setExportProgress(job, 0);

  let outputCanvas = null;
  let outputBitmap = null;

  try {
    const needsPostEffects = hasPostEffects();
    const sourceDimensions = getSourceDimensions();
    const maxPixels = getExportPixelBudget({
      compact: isCompactDevice() || isIOS(),
      hasPostEffects: needsPostEffects
    });
    const dimensions = calculateExportDimensions(
      sourceDimensions.width,
      sourceDimensions.height,
      maxPixels
    );
    const settings = getRenderSettings();
    settings.cellSize = Math.max(
      1,
      settings.cellSize * dimensions.width / Math.max(1, previewCanvas.width)
    );

    let result;
    if (canUseExportWorker()) {
      try {
        result = await renderExportWithWorker(job, dimensions, settings, needsPostEffects);
      } catch {
        if (job.cancelled) result = { cancelled: true };
        else result = await renderExportOnMain(job, dimensions, settings);
      }
    } else {
      result = await renderExportOnMain(job, dimensions, settings);
    }

    if (result.cancelled || job.cancelled) return;

    let blob = result.blob;
    if (!blob) {
      outputCanvas = result.canvas || document.createElement("canvas");
      if (result.bitmap) {
        outputBitmap = result.bitmap;
        outputCanvas.width = dimensions.width;
        outputCanvas.height = dimensions.height;
        const context = outputCanvas.getContext("2d");
        if (!context) throw new Error("Canvas context is unavailable.");
        context.drawImage(outputBitmap, 0, 0);
        outputBitmap.close?.();
        outputBitmap = null;
      }

      setExportProgress(job, 92);
      const exportSource = needsPostEffects
        ? runPostProcessChain(outputCanvas, exportPasses)
        : outputCanvas;
      setExportProgress(job, 96);
      blob = await canvasToBlob(exportSource);
    }

    if (job.cancelled) return;
    setExportProgress(job, 100);
    downloadExport(blob);
    setRenderStatus("Export complete", false, true);
    setExportFeedback(`Exported · ${formatFileSize(blob.size)}`);
  } catch (error) {
    if (!job.cancelled) {
      console.error(error);
      setRenderStatus("Export failed", false, true);
      setExportFeedback("Export failed · Retry", 3000);
    }
  } finally {
    clearTimeout(job.forceCancelTimer);
    job.worker?.terminate();
    outputBitmap?.close?.();
    if (outputCanvas) {
      outputCanvas.width = 1;
      outputCanvas.height = 1;
    }
    Object.values(exportPasses).forEach((pass) => pass.release());

    if (activeExport === job) activeExport = null;
    if (job.cancelled) {
      setRenderStatus("Export cancelled", false, true);
      setExportFeedback("Export cancelled", 1600);
    }
  }
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
