import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mountStudioPanel } from "../src/studio-panel.js";

let browser, state, studio, unmount, settingsChanged, savedName;
const defaults = {
  quality: "high", cellSize: 8, screenAngle: 28, contrast: 1.1, gamma: 1,
  toneCurve: .88, minDot: 0, inkColor: "#111111", paperColor: "#f5f5f5",
  grainStrength: 0, bloomStrength: 0, crtStrength: 0
};
function emit() {
  browser.dispatchEvent(new browser.CustomEvent(studio.eventName, { detail: structuredClone(state) }));
}
function key(node, key, extra = {}) {
  node.dispatchEvent(new browser.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
}
function findButton(text) {
  return [...document.querySelectorAll("button")].find((node) => node.textContent === text);
}

beforeEach(() => {
  browser = new Window({ url: "http://localhost:5173", width: 1440, height: 1000 });
  for (const name of ["document", "HTMLButtonElement", "HTMLInputElement", "HTMLElement", "Element", "MutationObserver", "ResizeObserver", "CustomEvent", "ImageData"])
    globalThis[name] = browser[name];
  globalThis.window = browser;
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  globalThis.requestAnimationFrame = browser.requestAnimationFrame.bind(browser);
  globalThis.cancelAnimationFrame = browser.cancelAnimationFrame.bind(browser);
  // Happy DOM incorrectly ANDs comma-separated media queries. Model browser
  // OR semantics here while retaining real viewport queries and resize events.
  const matchMedia = browser.matchMedia.bind(browser);
  browser.matchMedia = (query) => {
    if (!query.includes(',')) return matchMedia(query);
    const parts = query.split(',').map((part) => matchMedia(part.trim()));
    const media = new browser.EventTarget();
    Object.defineProperty(media, 'matches', { get: () => parts.some((part) => part.matches) });
    browser.addEventListener('resize', () => media.dispatchEvent(new browser.Event('change')));
    return media;
  };
  const captured = new WeakMap();
  browser.HTMLElement.prototype.setPointerCapture = function(id) { captured.set(this, id); };
  browser.HTMLElement.prototype.hasPointerCapture = function(id) { return captured.get(this) === id; };
  browser.HTMLElement.prototype.releasePointerCapture = function() { captured.delete(this); };
  // Happy DOM supplies events/focus, not layout or canvas rasterization.
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(20, 20, 280, 34);
  browser.HTMLElement.prototype.getClientRects = () => [new browser.DOMRect(20, 20, 280, 34)];
  browser.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, clearRect() {}, fillRect() {},
  });
  document.body.innerHTML = '<aside class="control-rail"><div id="dialPanelRoot"></div><div class="rail-actions"><div id="exportControlsRoot"></div></div></aside>';
  settingsChanged = [];
  savedName = null;
  state = {
    settings: { ...defaults }, theme: "dark", selectedPreset: "Default", presetModified: false,
    isCustomPreset: false, presets: [{ value: "Default", label: "Default" }, { value: "Poster", label: "Poster" }],
    export: { format: "webp", exporting: false }, uploadError: "", hasUserImage: false
  };
  studio = {
    eventName: "halftone:test", getState: () => structuredClone(state),
    setSetting: (name, value) => { settingsChanged.push([name, value]); state.settings[name] = value; state.presetModified = true; emit(); },
    selectPreset: (name) => { state.selectedPreset = name; state.settings = { ...defaults }; state.presetModified = false; emit(); },
    setExportFormat: (value) => { state.export.format = value; emit(); },
    savePreset: (name) => {
      if (!name.trim()) return { ok: false, message: "Give the preset a name." };
      savedName = name; state.presetModified = false; state.isCustomPreset = true; emit(); return { ok: true };
    },
    revertPreset: () => { state.settings = { ...defaults }; state.presetModified = false; emit(); },
    deletePreset() {}, openImageFile() {}
  };
  unmount = mountStudioPanel(studio);
});

afterEach(async () => {
  unmount?.();
  await browser.happyDOM.abort();
  browser.close();
});

test("sliders opt out of the new keyboard shortcuts", () => {
  const slider = document.querySelector('[role="slider"][aria-label="Cell size"]');
  assert.equal(slider.tabIndex, -1);
  slider.focus();
  for (const name of ["ArrowRight", "ArrowLeft", "Home", "End", "Enter"]) key(slider, name);
  key(slider, "ArrowRight", { shiftKey: true });
  assert.equal(state.settings.cellSize, defaults.cellSize);
  assert.equal(settingsChanged.length, 0);
  assert.equal(document.activeElement, slider);
  assert.equal(slider.querySelector("input").style.display, "none");
});

test("collapsing a section makes its controls inert without replacing them", () => {
  const trigger = findButton("Tone");
  const content = document.getElementById(trigger.getAttribute("aria-controls"));
  const slider = content.querySelector('[role="slider"]');
  assert.equal(trigger.tagName, "BUTTON");
  trigger.click();
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(content.inert, true);
  trigger.click();
  assert.equal(content.inert, false);
  assert.equal(content.querySelector('[role="slider"]'), slider);
});

test("preset dropdown supports keyboard selection and restores trigger focus", async () => {
  const trigger = document.querySelector('.dialkit-select-trigger');
  trigger.focus();
  key(trigger, "ArrowDown");
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.ok(document.querySelector('[role="listbox"]'));
  key(document.activeElement, "End");
  key(document.activeElement, "Enter");
  assert.equal(state.selectedPreset, "Poster");
  assert.equal(document.activeElement, trigger);
  assert.equal(document.querySelector('[role="listbox"]'), null);
});

test("preset names stay single-line, validate, save, and return focus", () => {
  studio.setSetting("cellSize", 9);
  findButton("Save preset").click();
  const input = document.activeElement;
  assert.equal(input.tagName, "INPUT");
  assert.equal(input.type, "text");
  assert.equal(input.maxLength, 40);
  const form = input.closest('form');
  form.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.value = "My print";
  input.dispatchEvent(new browser.Event('input', { bubbles: true }));
  form.dispatchEvent(new browser.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(savedName, "My print");
  assert.equal(form.hidden, true);
  assert.equal(document.activeElement, document.querySelector('.dialkit-select-trigger'));
});

test("color edits keep supported CSS formats and reject invalid values", () => {
  const input = document.querySelector('[aria-label="Ink color value"]');
  for (const value of ["#33669980", "rgb(20 40 60 / 0.5)", "hsl(180 50% 50%)", "oklch(0.65 0.2 30 / 0.5)", "color(display-p3 1 0.2 0.1)"]) {
    input.focus(); input.value = value; key(input, "Enter");
    assert.equal(state.settings.inkColor, value);
  }
  const previous = state.settings.inkColor;
  input.focus(); input.value = "invalid-color"; key(input, "Enter");
  assert.equal(state.settings.inkColor, previous);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  key(input, 'Escape');
  assert.equal(input.value, previous);
  studio.revertPreset();
  assert.equal(input.value, defaults.inkColor);
});

test("color picker offers all three formats and returns focus on Escape", () => {
  const swatch = document.querySelector('[aria-label="Pick ink color"]');
  swatch.click();
  const popup = document.querySelector('.dialkit-color-popover');
  assert.ok(popup);
  assert.deepEqual([...popup.querySelectorAll('.dialkit-color-format')].map((node) => node.textContent), ['Hex', 'OKLCH', 'Display P3']);
  key(document.activeElement, 'Escape');
  assert.equal(document.querySelector('.dialkit-color-popover'), null);
  assert.equal(document.activeElement, swatch);
});

test("export radio groups support keyboard changes and disabled export state", () => {
  const group = document.querySelector('[role="radiogroup"][aria-label="Export format"]');
  key(group.querySelector('[aria-checked="true"]'), 'End');
  assert.equal(state.export.format, 'png');
  assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
  state.export.exporting = true; emit();
  assert.ok([...group.querySelectorAll('button')].every((node) => node.disabled));
  key(group, 'Home');
  assert.equal(state.export.format, 'png');
});

test("vertical touch scrolling leaves slider values alone", () => {
  const slider = document.querySelector('[role="slider"][aria-label="Cell size"]');
  const pointer = (type, x, y) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  pointer('pointerdown', 50, 25);
  pointer('pointermove', 51, 70);
  pointer('pointerup', 51, 70);
  assert.equal(settingsChanged.length, 0);
  pointer('pointerdown', 50, 25);
  pointer('pointermove', 280, 25);
  pointer('pointerup', 280, 25);
  assert.ok(state.settings.cellSize > defaults.cellSize);
});

test("phone tabs keep one group visible and preserve controls across desktop resizing", () => {
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const nav = document.querySelector('.mobile-editor-tabs');
  const folder = (name) => document.getElementById(`studio-section-${name}`).closest('.studio-folder');
  const panel = document.getElementById('dialPanelRoot');
  const actions = document.querySelector('.rail-actions');
  const slider = folder('layout').querySelector('[role="slider"]');
  assert.equal(nav.hidden, false);
  assert.equal(folder('source').hidden, false);
  assert.equal(folder('tone').hidden, true);
  assert.equal(actions.hidden, true);
  nav.children[1].click();
  assert.equal(folder('source').hidden, true);
  for (const name of ['layout', 'tone', 'advanced']) assert.equal(folder(name).hidden, false);
  studio.setSetting('cellSize', 12);
  nav.children[2].click();
  assert.equal(folder('colors').hidden, false);
  assert.equal(folder('tone').hidden, true);
  nav.children[3].click();
  assert.equal(panel.hidden, true);
  assert.equal(actions.hidden, false);
  browser.happyDOM.setWindowSize({ width: 1024, height: 768 });
  assert.equal(nav.hidden, true);
  assert.equal(panel.hidden, false);
  assert.equal(actions.hidden, false);
  for (const name of ['source', 'layout', 'tone', 'colors', 'advanced']) assert.equal(folder(name).hidden, false);
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(nav.children[3].getAttribute('aria-pressed'), 'true');
  nav.children[1].click();
  assert.equal(folder('layout').querySelector('[role="slider"]'), slider);
  assert.equal(state.settings.cellSize, 12);
});

test('horizontal touch stays attached through thumb drift and cancellation refines once', () => {
  const calls = [];
  studio.setPreviewInteraction = (active) => calls.push(active);
  const slider = document.querySelector('[role="slider"][aria-label="Cell size"]');
  const pointer = (type, x, y, id = 1) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerType: 'touch', pointerId: id, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  pointer('pointerdown', 120, 25);
  assert.equal(slider.hasPointerCapture(1), true);
  pointer('pointermove', 132, 30);
  assert.deepEqual(calls, [true]);
  pointer('pointermove', 350, 85); // beyond the row, with vertical drift
  assert.equal(state.settings.cellSize, 20);
  const count = settingsChanged.length;
  pointer('pointermove', 390, 90);
  assert.equal(settingsChanged.length, count); // no duplicate bound updates
  pointer('pointercancel', 390, 90);
  pointer('lostpointercapture', 390, 90);
  assert.deepEqual(calls, [true, false]);
  assert.equal(slider.hasPointerCapture(1), false);
  pointer('pointermove', 20, 20);
  assert.equal(state.settings.cellSize, 20);
});

test('color gestures enable draft rendering and finish on cancellation', () => {
  const calls = [];
  studio.setPreviewInteraction = (active) => calls.push(active);
  document.querySelector('.dialkit-color-swatch').click();
  const plane = document.querySelector('.dialkit-color-plane');
  plane.dispatchEvent(new browser.PointerEvent('pointerdown', {
    pointerType: 'touch', pointerId: 9, button: 0, clientX: 50, clientY: 50, bubbles: true
  }));
  plane.dispatchEvent(new browser.PointerEvent('pointercancel', { pointerId: 9, bubbles: true }));
  assert.deepEqual(calls, [true, false]);
});

test('mobile preview stays fitted and exposes only the halftone to assistive technology', async () => {
  const { mountMobilePreview } = await import('../src/mobile-preview.js');
  document.body.insertAdjacentHTML('beforeend', '<canvas id="sourceCanvas"></canvas><canvas id="previewCanvas"></canvas>');
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  let resetCount = 0;
  const dispose = mountMobilePreview(() => resetCount++);
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'true');
  browser.happyDOM.setWindowSize({ width: 1200, height: 900 });
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'false');
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'true');
  assert.ok(resetCount >= 2);
  dispose();
});

test('theme follows the system by default, with desktop-only explicit overrides', async () => {
  const { mountStudioTheme } = await import('../src/theme.js');
  document.body.insertAdjacentHTML('beforeend', '<button id="themeToggle"><span id="iconSun"></span><span id="iconMoon"></span></button>');
  globalThis.localStorage = browser.localStorage;
  const system = new browser.EventTarget();
  system.matches = false;
  const matchMedia = browser.matchMedia.bind(browser);
  browser.matchMedia = (query) => query === '(prefers-color-scheme: dark)' ? system : matchMedia(query);
  let changes = 0;
  const dispose = mountStudioTheme(() => changes++);
  const toggle = document.getElementById('themeToggle');
  const isLight = () => document.documentElement.classList.contains('light');
  assert.equal(isLight(), true);
  assert.equal(toggle.hidden, false);
  system.matches = true;
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(isLight(), false);
  toggle.click();
  assert.equal(isLight(), true);
  assert.equal(localStorage.getItem('halftone.theme'), 'light');
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(isLight(), true); // desktop choice wins
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(toggle.hidden, true);
  assert.equal(isLight(), false); // mobile always follows system
  system.matches = false;
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(isLight(), true);
  system.matches = true;
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(isLight(), false);
  browser.happyDOM.setWindowSize({ width: 1200, height: 900 });
  assert.equal(isLight(), true); // explicit desktop choice is preserved
  assert.equal(toggle.hidden, false);
  const before = changes;
  dispose();
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(changes, before);
});
