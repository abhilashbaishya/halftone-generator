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
  // Happy DOM supplies events/focus, not layout or canvas rasterization.
  browser.HTMLElement.prototype.getBoundingClientRect = () => new browser.DOMRect(20, 20, 280, 34);
  browser.HTMLElement.prototype.getClientRects = () => [new browser.DOMRect(20, 20, 280, 34)];
  browser.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {}, clearRect() {}, fillRect() {},
  });
  document.body.innerHTML = '<div id="dialPanelRoot"></div><div id="exportControlsRoot"></div>';
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
  pointer('pointerup', 280, 25);
  assert.ok(state.settings.cellSize > defaults.cellSize);
});
