const grainPass = new GrainPass();
const bloomPass = new BloomPass();
const crtPass = new CRTPass();
let grainSeed = Math.random();

// ── Image persistence via IndexedDB ──
const DB_NAME = "halftone", DB_STORE = "image", DB_KEY = "last";
function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
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
  regenerateBtn: document.getElementById("regenerateBtn"),
  exportBtn: document.getElementById("exportBtn"),
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

let sourceImage = null;
let resizeTimer = null;
let renderFrame = null;
let hiddenJitter = 6;
let hiddenMicroDot = 24;
let hiddenSeed = 0;
let customPresets = {};

let presetCS = null;
let qualityCS = null;

let renderWorker = null;
let workerEnabled = false;
let renderRequestId = 0;

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

function setRenderStatus(text, busy = false) {
  controls.renderStatus.textContent = text;
  controls.renderStatus.dataset.busy = busy ? "true" : "false";
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

class ColorPicker {
  static _registry = [];

  constructor(native) {
    this.native = native;
    this.h = 0; this.s = 0; this.v = 1;
    this._open = false;
    this._build();
    this._fromHex(native.value);
    ColorPicker._registry.push(this);
  }

  _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, v];
  }

  _hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const cases = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]];
    const [r, g, b] = cases[i % 6];
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  _toHex() {
    const { r, g, b } = this._hsvToRgb(this.h, this.s, this.v);
    return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  _fromHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    [this.h, this.s, this.v] = this._rgbToHsv(rgb.r, rgb.g, rgb.b);
  }

  _build() {
    this.native.hidden = true;
    this.native.disabled = true;

    this.wrap = document.createElement("div");
    this.wrap.className = "cpick";
    this.native.parentNode.insertBefore(this.wrap, this.native);
    this.wrap.appendChild(this.native);

    // Trigger: swatch + hex
    this.trigger = document.createElement("div");
    this.trigger.className = "cpick-trigger";
    this.swatch = document.createElement("div");
    this.swatch.className = "cpick-swatch";
    this.hexIn = document.createElement("input");
    this.hexIn.type = "text";
    this.hexIn.className = "cpick-hex";
    this.hexIn.maxLength = 7;
    this.hexIn.spellcheck = false;
    this.trigger.append(this.swatch, this.hexIn);
    this.wrap.appendChild(this.trigger);

    // Panel
    this.panel = document.createElement("div");
    this.panel.className = "cpick-panel";

    // Gradient area (SV picker)
    this.gradWrap = document.createElement("div");
    this.gradWrap.className = "cpick-grad";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cpick-canvas";
    this.canvas.width = 560;
    this.canvas.height = 440;
    this.thumb = document.createElement("div");
    this.thumb.className = "cpick-thumb";
    this.gradWrap.append(this.canvas, this.thumb);

    // Hue row: color dot + slider
    this.hueRow = document.createElement("div");
    this.hueRow.className = "cpick-hue-row";
    this.hueSlider = document.createElement("input");
    this.hueSlider.type = "range";
    this.hueSlider.className = "cpick-hue";
    this.hueSlider.min = "0";
    this.hueSlider.max = "360";
    this.hueSlider.step = "1";
    this.hueRow.append(this.hueSlider);

    this.panel.append(this.gradWrap, this.hueRow);
    document.body.appendChild(this.panel);

    // Events
    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._open ? this.close() : this.open();
    });
    document.addEventListener("click", (e) => {
      if (this._open && !this.panel.contains(e.target)) this.close();
    });

    this.canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this._pickSV(e);
      const move = (e) => this._pickSV(e);
      const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });

    this.canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      this._pickSV(e.touches[0]);
      const move = (e) => this._pickSV(e.touches[0]);
      const up = () => { window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
      window.addEventListener("touchmove", move, { passive: false });
      window.addEventListener("touchend", up);
    }, { passive: false });

    this.hueSlider.addEventListener("input", () => {
      this.h = Number(this.hueSlider.value) / 360;
      this._drawCanvas();
      this._emit();
    });

    this.hexIn.addEventListener("change", () => {
      let v = this.hexIn.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this._fromHex(v);
        this.hueSlider.value = Math.round(this.h * 360);
        this._drawCanvas();
        this._emit();
      }
    });
  }

  _pickSV(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    this.v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
    this._updateThumb();
    this._emit();
  }

  _drawCanvas() {
    const ctx = this.canvas.getContext("2d");
    const w = this.canvas.width, h = this.canvas.height;
    const { r, g, b } = this._hsvToRgb(this.h, 1, 1);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
    const wg = ctx.createLinearGradient(0, 0, w, 0);
    wg.addColorStop(0, "rgba(255,255,255,1)");
    wg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "rgba(0,0,0,0)");
    bg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  }

  _updateThumb() {
    this.thumb.style.left = (this.s * 100) + "%";
    this.thumb.style.top = ((1 - this.v) * 100) + "%";
  }

  _emit() {
    const hex = this._toHex();
    this.native.value = hex;
    this.swatch.style.background = hex;
    this.hexIn.value = hex.toUpperCase();
    this._updateThumb();
    this.native.dispatchEvent(new Event("input", { bubbles: true }));
  }

  syncFromNative() {
    this._fromHex(this.native.value);
    this.hueSlider.value = Math.round(this.h * 360);
    const hex = this.native.value;
    this.swatch.style.background = hex;
    this.hexIn.value = hex.toUpperCase();
    if (this._open) { this._drawCanvas(); this._updateThumb(); }
  }

  open() {
    ColorPicker._registry.forEach(cp => { if (cp !== this) cp.close(); });
    this._open = true;
    this.syncFromNative();
    this._drawCanvas();
    this._updateThumb();
    this.panel.style.display = "block";
    requestAnimationFrame(() => this._reposition());
  }

  _reposition() {
    const rect = this.trigger.getBoundingClientRect();
    const panelW = this.panel.offsetWidth;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    if (left < 8) left = 8;
    this.panel.style.left = left + "px";
    this.panel.style.top = (rect.bottom + 6) + "px";
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.panel.style.display = "none";
  }
}

class CustomSelect {
  constructor(native) {
    this.native = native;
    this._open = false;
    this._init();
  }

  _init() {
    this.native.hidden = true;
    this.wrapper = document.createElement("div");
    this.wrapper.className = "csel";
    this.native.parentNode.insertBefore(this.wrapper, this.native);
    this.wrapper.appendChild(this.native);

    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "csel-trigger";
    this.wrapper.appendChild(this.trigger);

    this.panel = document.createElement("div");
    this.panel.className = "csel-panel";
    this.wrapper.appendChild(this.panel);

    this.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      this._open ? this.close() : this.open();
    });
    document.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") this.close(); });
    this.syncTrigger();
  }

  syncTrigger() {
    const opt = this.native.options[this.native.selectedIndex];
    const label = opt ? opt.text : "";
    this.trigger.innerHTML = `<span>${label}</span><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  _buildPanel() {
    this.panel.innerHTML = "";
    const cur = this.native.value;
    Array.from(this.native.children).forEach((child) => {
      if (child.tagName === "OPTGROUP") {
        const lbl = document.createElement("div");
        lbl.className = "csel-group-label";
        lbl.textContent = child.label;
        this.panel.appendChild(lbl);
        Array.from(child.children).forEach((opt) => this.panel.appendChild(this._makeItem(opt, cur)));
      } else if (child.tagName === "OPTION") {
        this.panel.appendChild(this._makeItem(child, cur));
      }
    });
  }

  _makeItem(opt, cur) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "csel-item" + (opt.value === cur ? " csel-item--active" : "");
    btn.innerHTML = `<span>${opt.text}</span>${opt.value === cur ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.native.value = opt.value;
      this.native.dispatchEvent(new Event("change", { bubbles: true }));
      this.close();
      this.syncTrigger();
    });
    return btn;
  }

  open() {
    this._open = true;
    this._buildPanel();
    this.wrapper.classList.add("csel--open");
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.wrapper.classList.remove("csel--open");
  }

  refresh() {
    this.syncTrigger();
    if (this._open) this._buildPanel();
  }
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
  presetCS?.refresh();
}

function getPresetByName(name) {
  return builtInPresets[name] || customPresets[name] || null;
}

function captureCurrentPreset() {
  return {
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
}

function saveCurrentPreset() {
  const active = controls.presetSelect.value;
  const suggested = Object.prototype.hasOwnProperty.call(customPresets, active) ? active : "";
  const providedName = window.prompt("Save preset as:", suggested);
  if (providedName === null) return;

  const name = providedName.trim();
  if (!name) {
    window.alert("Preset name cannot be empty.");
    return;
  }

  if (Object.prototype.hasOwnProperty.call(builtInPresets, name)) {
    window.alert("That name is reserved by a built-in preset.");
    return;
  }

  customPresets[name] = captureCurrentPreset();
  persistCustomPresets();
  rebuildPresetSelect(name);
  controls.presetSelect.value = name;
}

function deleteCurrentPreset() {
  const selected = controls.presetSelect.value;
  if (!Object.prototype.hasOwnProperty.call(customPresets, selected)) {
    window.alert("Select a saved preset to delete.");
    return;
  }

  const confirmed = window.confirm(`Delete preset "${selected}"?`);
  if (!confirmed) return;

  delete customPresets[selected];
  persistCustomPresets();
  rebuildPresetSelect(DEFAULT_PRESET);
  applyPreset(DEFAULT_PRESET);
}

function updateZoomOutput() {
  controls.zoomOut.textContent = `${Math.round(compareState.zoom * 100)}%`;
  controls.zoomRange.value = compareState.zoom.toFixed(2);
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
  compareState.zoom = clamp(nextZoom, 0.5, 4);
  applyViewTransform();
}

function updateSplitPreview() {
  const split = clamp(compareState.split, 0, 1);
  compareState.split = split;

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

  const dpr = window.devicePixelRatio || 1;
  let backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  let backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  const maxPixels = getQualityConfig().maxPixels;
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
  sourceCtx.drawImage(sourceImage, 0, 0, sourceCanvas.width, sourceCanvas.height);
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

async function createScaledBitmap(image, width, height) {
  try {
    return await createImageBitmap(image, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: "high"
    });
  } catch {
    return createImageBitmap(image);
  }
}

function disableWorker() {
  workerEnabled = false;
  if (renderWorker) {
    renderWorker.terminate();
    renderWorker = null;
  }
}

function initializeWorker() {
  if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
    disableWorker();
    return;
  }

  try {
    renderWorker = new Worker("renderer-worker.js");
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
        return;
      }

      if (type !== "rendered") return;

      if (requestId !== renderRequestId) {
        if (bitmap && typeof bitmap.close === "function") bitmap.close();
        return;
      }

      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(bitmap, 0, 0, previewCanvas.width, previewCanvas.height);
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
      applyPostProcess(previewCtx, previewCanvas);
      setRenderStatus("Ready", false);
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

  const requestId = ++renderRequestId;
  setRenderStatus("Rendering...", true);

  createScaledBitmap(sourceImage, width, height)
    .then((sourceBitmap) => {
      if (requestId !== renderRequestId) {
        if (typeof sourceBitmap.close === "function") sourceBitmap.close();
        return;
      }

      if (!renderWorker || !workerEnabled) {
        if (typeof sourceBitmap.close === "function") sourceBitmap.close();
        renderHalftoneOnMain(previewCtx, width, height, settings);
        applyPostProcess(previewCtx, previewCanvas);
        setRenderStatus("Ready", false);
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
      if (requestId !== renderRequestId) return;
      disableWorker();
      renderHalftoneOnMain(previewCtx, width, height, settings);
      applyPostProcess(previewCtx, previewCanvas);
      setRenderStatus("Ready", false);
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

  setRenderStatus("Rendering...", true);
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

  if (preset.jitter !== undefined) hiddenJitter = preset.jitter;
  if (preset.microDot !== undefined) hiddenMicroDot = preset.microDot;
  if (preset.seed !== undefined) hiddenSeed = preset.seed;

  controls.presetSelect.value = name;
  presetCS?.syncTrigger();
  qualityCS?.syncTrigger();
  inkCP.syncFromNative();
  paperCP.syncFromNative();
  updateOutputs();
  requestRender();
}

function updateSliderFills() {
  document.querySelectorAll('input[type="range"]').forEach((input) => {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    input.style.setProperty("--val", (val - min) / (max - min));
  });
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
      sourceImage = img;
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
  const maxExportPixels = 48_000_000;

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
  const url = exportSource.toDataURL("image/png");
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  link.href = url;
  link.download = `halftone-${timestamp}.png`;
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
});

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
  setZoom(numberValue(controls.zoomRange, 1));
  updateSliderFills();
});

controls.resetViewBtn.addEventListener("click", resetView);

splitHandle.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    compareState.split -= 0.02;
    updateSplitPreview();
    return;
  }

  if (event.key === "ArrowRight") {
    compareState.split += 0.02;
    updateSplitPreview();
  }
});

splitHandle.addEventListener("pointerdown", handleSplitPointerDown);
splitHandle.addEventListener("pointermove", handleSplitPointerMove);
splitHandle.addEventListener("pointerup", handleSplitPointerUp);
splitHandle.addEventListener("pointercancel", handleSplitPointerUp);

window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    requestRender();
  }, 120);
});

controls.regenerateBtn.addEventListener("click", () => { grainSeed = Math.random(); requestRender(); });
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
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("light") ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

applyTheme(localStorage.getItem(THEME_KEY) || "dark");

presetCS = new CustomSelect(controls.presetSelect);
qualityCS = new CustomSelect(controls.quality);
const inkCP = new ColorPicker(controls.inkColor);
const paperCP = new ColorPicker(controls.paperColor);

customPresets = loadCustomPresets();
rebuildPresetSelect(DEFAULT_PRESET);
initializeWorker();
resetView();
updateSplitPreview();
updateOutputs();
applyPreset(DEFAULT_PRESET);

if (!sourceImage) {
  loadImageFromDb().then(dataUrl => {
    const src = dataUrl || "placeholder.jpg";
    const img = new Image();
    img.onload = () => { sourceImage = img; resetView(); requestRender(); };
    img.onerror = () => { drawPlaceholder(); setRenderStatus("Upload an image", false); };
    img.src = src;
  }).catch(() => {
    drawPlaceholder();
    setRenderStatus("Upload an image", false);
  });
}
