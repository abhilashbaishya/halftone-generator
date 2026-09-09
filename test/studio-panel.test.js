import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { mountStudioPanel } from "../src/studio-panel.js";
import { mountPresetMenuMotion } from "../src/preset-menu-motion.js";

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
    export: { format: "png", exporting: false }, uploadError: "", hasUserImage: false
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

test('visual preset options preserve selection and distinguish built-in samples from saved presets', async () => {
  state.presets = [{ value: 'red', label: 'Crimson Poster' }, { value: 'fine', label: 'Fine Screen' },
    { value: 'My print', label: 'My print' }];
  state.selectedPreset = 'red';
  emit();
  const trigger = document.querySelector('.dialkit-select-trigger');
  trigger.click();
  let popup = document.querySelector('.studio-preset-menu');
  let options = popup.querySelectorAll('.studio-preset-option');
  assert.equal(options.length, 3);
  assert.equal(options[0].querySelector('img').alt, '');
  assert.equal(options[0].querySelector('.studio-preset-description').textContent, 'Crisp, balanced poster');
  assert.equal(options[2].querySelector('img'), null);
  assert.equal(options[2].querySelector('.studio-preset-description').textContent, 'Your saved preset');
  options[1].click();
  assert.equal(state.selectedPreset, 'fine');
  assert.equal(document.querySelector('.studio-preset-menu'), null);
  key(trigger, 'ArrowDown');
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  popup = document.querySelector('.studio-preset-menu');
  assert.equal(popup.querySelectorAll('img').length, 2);
  key(document.activeElement, 'End');
  key(document.activeElement, 'Enter');
  assert.equal(state.selectedPreset, 'My print');
  assert.equal(document.activeElement, trigger);
});

test('preset menu fades out without keeping interactive options and clears an interrupted exit', async (t) => {
  const prototype = browser.HTMLElement.prototype;
  const original = prototype.animate;
  const animations = [];
  prototype.animate = function(frames, options) {
    let finish;
    const animation = { node: this, frames, options, cancelled: false,
      finished: new Promise((resolve) => { finish = resolve; }),
      cancel() { this.cancelled = true; }, finish: () => finish() };
    animations.push(animation);
    return animation;
  };
  t.after(() => { if (original) prototype.animate = original; else delete prototype.animate; });
  const trigger = document.querySelector('.dialkit-select-trigger');
  trigger.click();
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(animations[0].options.duration, 300);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  document.querySelector('.studio-preset-option').click();
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  const exit = document.querySelector('.studio-preset-menu-exit');
  assert.ok(exit);
  assert.equal(exit.inert, true);
  assert.equal(exit.getAttribute('aria-hidden'), 'true');
  assert.equal(exit.hasAttribute('role'), false);
  assert.equal(exit.querySelectorAll('[id]').length, 0);
  assert.equal(animations[1].options.duration, 240);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  trigger.click();
  assert.equal(document.querySelector('.studio-preset-menu-exit'), null);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(animations[1].cancelled, true);
  assert.ok(document.querySelector('.studio-preset-menu'));
  animations[1].finish();
  await Promise.resolve();
  assert.ok(document.querySelector('.studio-preset-menu'), 'old exit cannot remove a reopened menu');
  key(document.activeElement, 'Escape');
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(document.querySelector('.studio-preset-menu'), null);
  assert.equal(document.activeElement, trigger);
  animations.at(-1).finish();
  await Promise.resolve();
  assert.equal(document.querySelector('.studio-preset-menu-exit'), null);
});

test('preset exit waits beyond a microtask checkpoint for the menu to be removed', async (t) => {
  const prototype = browser.HTMLElement.prototype;
  const original = prototype.animate;
  prototype.animate = () => ({ finished: new Promise(() => {}), cancel() {} });
  const root = document.querySelector('.halftone-dialkit');
  const host = document.createElement('div');
  const trigger = document.createElement('button');
  host.append(trigger);
  root.append(host);
  const popup = document.createElement('div');
  popup.className = 'dialkit-select-dropdown studio-preset-menu';
  root.append(popup);
  const motion = mountPresetMenuMotion(host, trigger);
  t.after(() => {
    motion.destroy(); host.remove(); popup.remove();
    if (original) prototype.animate = original; else delete prototype.animate;
  });
  motion.open(popup);
  trigger.click();
  // Model a native event checkpoint before the library's later close handler.
  await Promise.resolve();
  assert.equal(popup.isConnected, true);
  popup.remove();
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.ok(document.querySelector('.studio-preset-menu-exit'), 'exit must not be skipped by the earlier checkpoint');
});

test('reduced motion skips preset entrance and exit animation', async (t) => {
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  browser.matchMedia = (query) => query === '(prefers-reduced-motion: reduce)' ? { matches: true } : nativeMatchMedia(query);
  const prototype = browser.HTMLElement.prototype;
  const original = prototype.animate;
  prototype.animate = () => { throw new Error('reduced motion must not animate'); };
  t.after(() => { if (original) prototype.animate = original; else delete prototype.animate; });
  const trigger = document.querySelector('.dialkit-select-trigger');
  trigger.click();
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  key(document.activeElement, 'Escape');
  await Promise.resolve();
  assert.equal(document.querySelector('.studio-preset-menu-exit'), null);
  assert.equal(document.querySelector('.studio-preset-menu'), null);
  assert.equal(document.activeElement, trigger);
});

test('section transitions reverse from their visible height and restore natural sizing', () => {
  const trigger = findButton('Tone');
  const content = document.getElementById(trigger.getAttribute('aria-controls'));
  const body = content.firstElementChild;
  Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 180 });
  let visibleHeight = 180;
  content.getBoundingClientRect = () => new browser.DOMRect(0, 0, 280, visibleHeight);
  const starts = [];
  Object.defineProperty(content, 'offsetHeight', { configurable: true, get() {
    starts.push(content.style.height);
    return visibleHeight;
  } });
  trigger.click();
  assert.equal(content.style.height, '0px');
  assert.equal(content.inert, true);
  visibleHeight = 75; // tap again before the closing animation completes
  trigger.click();
  assert.deepEqual(starts, ['180px', '75px']);
  assert.equal(content.style.height, '180px');
  assert.equal(content.inert, false);
  const end = new browser.Event('transitionend', { bubbles: true });
  Object.defineProperty(end, 'propertyName', { value: 'height' });
  content.dispatchEvent(end);
  assert.equal(content.style.height, 'auto');
});

test('reduced motion opens and closes sections without measured animation', () => {
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  browser.matchMedia = (query) => query === '(prefers-reduced-motion: reduce)' ? { matches: true } : nativeMatchMedia(query);
  const trigger = findButton('Tone');
  const content = document.getElementById(trigger.getAttribute('aria-controls'));
  content.getBoundingClientRect = () => { throw new Error('should not measure reduced-motion transitions'); };
  trigger.click();
  assert.equal(content.style.height, '0px');
  trigger.click();
  assert.equal(content.style.height, 'auto');
});

test('mobile scrolling reports one busy interval through momentum and resumes after settling', async () => {
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const calls = [];
  studio.setPanelScrolling = (active) => calls.push(active);
  const panel = document.getElementById('dialPanelRoot');
  panel.dispatchEvent(new browser.Event('scroll'));
  panel.dispatchEvent(new browser.Event('scroll'));
  assert.deepEqual(calls, [true]);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.deepEqual(calls, [true, false]);
  panel.dispatchEvent(new browser.Event('scroll'));
  document.querySelector('.mobile-editor-tabs').children[1].click();
  assert.deepEqual(calls, [true, false, true, false]);
});

test('iPad follows the system theme and fits the preview even with a saved desktop override', async () => {
  const { TOUCH_LAYOUT } = await import('../src/mobile-layout.js');
  const { mountStudioTheme } = await import('../src/theme.js');
  const { mountMobilePreview } = await import('../src/mobile-preview.js');
  browser.happyDOM.setWindowSize({ width: 1194, height: 834 });
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  const touch = new browser.EventTarget();
  touch.matches = true;
  const system = new browser.EventTarget();
  system.matches = true;
  browser.matchMedia = (query) => query === TOUCH_LAYOUT ? touch
    : query === '(prefers-color-scheme: dark)' ? system : nativeMatchMedia(query);
  globalThis.localStorage = browser.localStorage;
  localStorage.setItem('halftone.theme', 'light');
  document.body.insertAdjacentHTML('beforeend', '<canvas id="sourceCanvas"></canvas><button id="themeToggle"><span id="iconSun"></span><span id="iconMoon"></span></button>');
  const disposeTheme = mountStudioTheme();
  let fitted = 0;
  const disposePreview = mountMobilePreview(() => fitted++);
  assert.equal(document.getElementById('themeToggle').hidden, true);
  assert.equal(document.documentElement.classList.contains('light'), false);
  assert.equal(fitted, 1);
  system.matches = false;
  system.dispatchEvent(new browser.Event('change'));
  assert.equal(document.documentElement.classList.contains('light'), true);
  disposeTheme();
  disposePreview();
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

test("color picker starts at the color field without format tabs and returns focus on Escape", () => {
  const swatch = document.querySelector('[aria-label="Pick ink color"]');
  swatch.click();
  const popup = document.querySelector('.dialkit-color-popover');
  assert.ok(popup);
  assert.equal(popup.querySelector('.dialkit-color-format-row').hidden, true);
  assert.equal(document.activeElement, popup.querySelector('.dialkit-color-plane'));
  assert.equal(popup.querySelector('.dialkit-color-css-input').value, defaults.inkColor);
  assert.ok(popup.querySelector('[aria-label="Hue"]'));
  assert.ok(popup.querySelector('[aria-label="Opacity"]'));
  key(document.activeElement, 'Escape');
  assert.equal(document.querySelector('.dialkit-color-popover'), null);
  assert.equal(document.activeElement, swatch);
});

test("Shift-Tab leaves the simplified picker and opening preserves pasted CSS colors", () => {
  studio.setSetting('inkColor', 'oklch(0.65 0.2 30 / 0.5)');
  const swatch = document.querySelector('[aria-label="Pick ink color"]');
  swatch.click();
  assert.equal(state.settings.inkColor, 'oklch(0.65 0.2 30 / 0.5)');
  key(document.activeElement, 'Tab', { shiftKey: true });
  assert.equal(document.querySelector('.dialkit-color-popover'), null);
  assert.equal(document.activeElement, swatch);
});

test("export radio groups support keyboard changes and disabled export state", () => {
  const group = document.querySelector('[role="radiogroup"][aria-label="Export format"]');
  key(group.querySelector('[aria-checked="true"]'), 'End');
  assert.equal(state.export.format, 'webp');
  assert.equal(document.activeElement.getAttribute('aria-checked'), 'true');
  state.export.exporting = true; emit();
  assert.ok([...group.querySelectorAll('button')].every((node) => node.disabled));
  key(group, 'Home');
  assert.equal(state.export.format, 'webp');
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
  assert.equal(nav.children[0].textContent, "Image");
  assert.equal(folder('source').hidden, false);
  assert.equal(folder('tone').hidden, true);
  assert.equal(folder('presets').hidden, true);
  assert.equal(folder('source').querySelector('.dialkit-select-trigger'), null);
  assert.ok(folder('source').querySelector('.studio-upload-button'));
  assert.equal(actions.hidden, true);
  nav.children[1].click();
  assert.equal(folder('source').hidden, true);
  for (const name of ['presets', 'layout', 'tone', 'advanced']) assert.equal(folder(name).hidden, false);
  for (const name of ['layout', 'tone', 'colors', 'advanced']) {
    const group = folder(name);
    const trigger = group.querySelector('button.dialkit-folder-header-top');
    const heading = group.querySelector('h2.studio-folder-static-heading');
    assert.equal(group.dataset.phoneFlat, 'true');
    assert.equal(group.dataset.open, 'true');
    assert.equal(group.querySelector('.dialkit-folder-content').inert, false);
    assert.equal(trigger.hidden, true);
    assert.equal(heading.hidden, false);
    assert.equal(heading.getAttribute('role'), null);
  }
  assert.equal(document.querySelector('button[role="heading"]'), null);
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
  for (const name of ['source', 'presets', 'layout', 'tone', 'colors', 'advanced']) assert.equal(folder(name).hidden, false);
  assert.equal(folder('layout').dataset.phoneFlat, 'false');
  assert.equal(folder('layout').querySelector('button.dialkit-folder-header-top').hidden, false);
  assert.equal(folder('layout').querySelector('h2.studio-folder-static-heading').hidden, true);
  assert.equal(folder('layout').querySelector('button.dialkit-folder-header-top').getAttribute('aria-expanded'), 'true');
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(nav.children[3].getAttribute('aria-pressed'), 'true');
  nav.children[1].click();
  assert.equal(folder('layout').querySelector('[role="slider"]'), slider);
  assert.equal(state.settings.cellSize, 12);
});

test('phone preset and color pickers open as sheets while desktop keeps popovers', async () => {
  const presetTrigger = document.querySelector('.dialkit-select-trigger');
  presetTrigger.click();
  assert.equal(document.querySelector('.studio-preset-menu').classList.contains('studio-phone-sheet'), false);
  presetTrigger.click();

  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const tabs = document.querySelector('.mobile-editor-tabs').children;
  tabs[1].click();
  presetTrigger.click();
  assert.equal(document.querySelector('.studio-preset-menu').classList.contains('studio-phone-sheet'), true);
  key(document.activeElement, 'Escape');
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));

  tabs[2].click();
  const swatch = document.querySelector('.dialkit-color-swatch');
  swatch.click();
  const color = document.querySelector('.dialkit-color-popover');
  assert.ok(color);
  assert.equal(color.classList.contains('studio-phone-sheet'), true);
  assert.equal(document.activeElement, color.querySelector('.dialkit-color-plane'));
  browser.happyDOM.setWindowSize({ width: 1024, height: 768 });
  assert.equal(document.querySelector('.dialkit-color-popover'), null);

  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  tabs[1].click();
  presetTrigger.click();
  assert.ok(document.querySelector('.studio-preset-menu.studio-phone-sheet'));
  browser.happyDOM.setWindowSize({ width: 1024, height: 768 });
  assert.equal(document.querySelector('.studio-preset-menu'), null);
});

test('entering phone landscape closes any open top-layer sheet', async () => {
  const { PHONE_LANDSCAPE } = await import('../src/mobile-layout.js');
  unmount();
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  const landscape = new browser.EventTarget();
  landscape.matches = false;
  browser.matchMedia = (query) => query === PHONE_LANDSCAPE ? landscape : nativeMatchMedia(query);
  unmount = mountStudioPanel(studio);

  const tabs = document.querySelector('.mobile-editor-tabs').children;
  tabs[1].click();
  const presetTrigger = document.querySelector('.dialkit-select-trigger');
  presetTrigger.click();
  assert.ok(document.querySelector('.studio-preset-menu.studio-phone-sheet'));
  landscape.matches = true;
  landscape.dispatchEvent(new browser.Event('change'));
  assert.equal(document.querySelector('.studio-preset-menu'), null);

  landscape.matches = false;
  landscape.dispatchEvent(new browser.Event('change'));
  tabs[2].click();
  document.querySelector('.dialkit-color-swatch').click();
  assert.ok(document.querySelector('.dialkit-color-popover.studio-phone-sheet'));
  landscape.matches = true;
  landscape.dispatchEvent(new browser.Event('change'));
  assert.equal(document.querySelector('.dialkit-color-popover:not(.studio-phone-sheet-exit)'), null);
});

test('phone sheets use a slower entrance and a shorter exit', async (t) => {
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const prototype = browser.HTMLElement.prototype;
  const original = prototype.animate;
  const animations = [];
  prototype.animate = function(frames, options) {
    const animation = { node: this, frames, options, finished: new Promise(() => {}), cancel() {} };
    animations.push(animation);
    return animation;
  };
  t.after(() => { if (original) prototype.animate = original; else delete prototype.animate; });
  document.querySelector('.mobile-editor-tabs').children[1].click();
  const trigger = document.querySelector('.dialkit-select-trigger');
  trigger.click();
  assert.equal(animations.at(-1).options.duration, 260);
  document.querySelector('.studio-preset-option').click();
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(animations.at(-1).options.duration, 180);
  const presetExit = document.querySelector('.studio-preset-menu-exit');
  assert.equal(presetExit.classList.contains('studio-phone-sheet'), true);
  assert.equal(presetExit.classList.contains('studio-phone-sheet-exit'), true);

  document.querySelector('.mobile-editor-tabs').children[2].click();
  const swatch = document.querySelector('.dialkit-color-swatch');
  swatch.click();
  assert.equal(animations.at(-1).options.duration, 260);
  const plane = document.querySelector('.dialkit-color-plane');
  key(plane, 'Escape');
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(animations.at(-1).options.duration, 180);
  assert.ok(document.querySelector('.dialkit-color-popover.studio-phone-sheet-exit'));
});

test('iPad sidebar tabs separate editing from export and preserve controls across rotation', async () => {
  const { TOUCH_LAYOUT } = await import('../src/mobile-layout.js');
  unmount();
  browser.happyDOM.setWindowSize({ width: 1194, height: 834 });
  const nativeMatchMedia = browser.matchMedia.bind(browser);
  const touch = new browser.EventTarget();
  touch.matches = true;
  browser.matchMedia = (query) => query === TOUCH_LAYOUT ? touch : nativeMatchMedia(query);
  unmount = mountStudioPanel(studio);
  const tabs = document.querySelector('.mobile-editor-tabs');
  const panel = document.getElementById('dialPanelRoot');
  const actions = document.querySelector('.rail-actions');
  const folder = (name) => document.getElementById(`studio-section-${name}`).closest('.studio-folder');
  const slider = folder('layout').querySelector('[role="slider"]');
  assert.equal(tabs.hidden, false);
  assert.equal(folder('source').hidden, false);
  assert.equal(actions.hidden, true);
  tabs.children[1].click();
  assert.equal(folder('source').hidden, true);
  assert.equal(folder('layout').hidden, false);
  assert.equal(folder('presets').hidden, false);
  panel.scrollTop = 140;
  tabs.children[2].click();
  assert.equal(folder('colors').hidden, false);
  assert.equal(folder('layout').hidden, true);
  tabs.children[3].click();
  assert.equal(panel.hidden, true);
  assert.equal(actions.hidden, false);
  browser.happyDOM.setWindowSize({ width: 834, height: 1194 });
  assert.equal(tabs.hidden, false);
  assert.equal(actions.hidden, false);
  tabs.children[1].click();
  assert.equal(panel.scrollTop, 140);
  assert.equal(folder('layout').querySelector('[role="slider"]'), slider);
  touch.matches = false;
  touch.dispatchEvent(new browser.Event('change'));
  assert.equal(tabs.hidden, true);
  assert.equal(panel.hidden, false);
  assert.equal(actions.hidden, false);
  for (const name of ['source', 'presets', 'layout', 'tone', 'colors', 'advanced']) assert.equal(folder(name).hidden, false);
});

test('phone tabs restore independent scroll positions and ignore active-tab taps', () => {
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const tabs = document.querySelector('.mobile-editor-tabs').children;
  const panel = document.getElementById('dialPanelRoot');
  const actions = document.querySelector('.rail-actions');
  tabs[1].click();
  panel.scrollTop = 180;
  tabs[1].click();
  assert.equal(panel.scrollTop, 180);
  tabs[2].click();
  assert.equal(panel.scrollTop, 0);
  panel.scrollTop = 65;
  tabs[3].click();
  actions.scrollTop = 95;
  tabs[0].click();
  assert.equal(panel.scrollTop, 0);
  tabs[1].click();
  assert.equal(panel.scrollTop, 180);
  tabs[2].click();
  assert.equal(panel.scrollTop, 65);
  tabs[3].click();
  assert.equal(actions.scrollTop, 95);
});

test('diagonal scroll and an undecided gesture returning to its start do not change a slider', () => {
  const slider = document.querySelector('[role="slider"][aria-label="Cell size"]');
  const pointer = (type, x, y) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  pointer('pointerdown', 50, 25);
  pointer('pointermove', 58, 34);
  assert.equal(slider.hasPointerCapture(1), false);
  pointer('pointerup', 58, 34);
  pointer('pointerdown', 50, 25);
  pointer('pointermove', 60, 34); // undecided: almost equal horizontal/vertical movement
  pointer('pointermove', 50, 25);
  pointer('pointerup', 50, 25);
  assert.equal(settingsChanged.length, 0);
});

test('horizontal touch stays attached through thumb drift and cancellation refines once', async () => {
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
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(state.settings.cellSize, 12);
  const count = settingsChanged.length;
  pointer('pointermove', 390, 90);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(settingsChanged.length, count); // no duplicate bound updates
  pointer('pointercancel', 390, 90);
  pointer('lostpointercapture', 390, 90);
  assert.deepEqual(calls, [true, false]);
  assert.equal(slider.hasPointerCapture(1), false);
  pointer('pointermove', 20, 20);
  assert.equal(state.settings.cellSize, 12);
});

test('touch updates once per frame and flushes the final value before refinement', async () => {
  const slider = document.querySelector('[role="slider"][aria-label="Cell size"]');
  const pointer = (type, x) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerType: 'touch', pointerId: 1, button: 0, clientX: x, clientY: 25, bubbles: true, cancelable: true
  }));
  const refinements = [];
  studio.setPreviewInteraction = (active) => { if (!active) refinements.push(state.settings.cellSize); };
  pointer('pointerdown', 50);
  for (let x = 60; x <= 200; x += 5) pointer('pointermove', x);
  assert.equal(settingsChanged.length, 0);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(settingsChanged.length, 1);
  assert.equal(state.settings.cellSize, 9);
  pointer('pointermove', 240);
  pointer('pointerup', 300);
  assert.equal(state.settings.cellSize, 12);
  assert.deepEqual(refinements, [12]);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(settingsChanged.length, 2);

  pointer('pointerdown', 300);
  pointer('pointermove', 160);
  pointer('pointercancel', 160);
  assert.equal(state.settings.cellSize, 8);
  assert.deepEqual(refinements, [12, 8]);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(settingsChanged.length, 3);
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

test('mobile split preview stays fitted and exposes the source to assistive technology', async () => {
  const { mountMobilePreview } = await import('../src/mobile-preview.js');
  document.body.insertAdjacentHTML('beforeend', '<canvas id="sourceCanvas"></canvas><canvas id="previewCanvas"></canvas>');
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  let resetCount = 0;
  const dispose = mountMobilePreview(() => resetCount++);
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'false');
  browser.happyDOM.setWindowSize({ width: 1200, height: 900 });
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'false');
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(document.getElementById('sourceCanvas').getAttribute('aria-hidden'), 'false');
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
