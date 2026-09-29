import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountHistoryControls } from '../src/history-controls.js';
import { mountTouchSlider } from '../src/touch-slider.js';
import { createEditHistory } from '../src/edit-history.js';

let browser, studio, h, current, dispose;
beforeEach(() => {
  browser = new Window();
  globalThis.window = browser;
  globalThis.document = browser.document;
  document.body.innerHTML = '<div class="halftone-dialkit"><div id="toolbar"></div><div class="dialkit-slider"></div><input aria-label="Color"></div>';
  current = 5;
  h = createEditHistory(current);
  const emit = () => browser.dispatchEvent(new browser.Event('state'));
  studio = {
    eventName: 'state', getState: () => ({ history: h.getState() }),
    setHistoryEnabled() { h.reset(current); emit(); },
    beginEdit: () => h.begin(), endEdit() { h.end(); emit(); },
    undo() { const value = h.undo(); if (value !== null) current = value; emit(); },
    redo() { const value = h.redo(); if (value !== null) current = value; emit(); },
    edit(value) { current = value; h.record(value); emit(); }
  };
  dispose = mountHistoryControls(studio, document.getElementById('toolbar'));
});
afterEach(async () => { dispose(); await browser.happyDOM.abort(); browser.close(); });

const button = (name) => document.querySelector(`[aria-label="${name}"]`);
const pointer = (target, type) => target.dispatchEvent(new browser.PointerEvent(type, {
  pointerId: 1, button: 0, pointerType: 'mouse', bubbles: true
}));

test('desktop buttons group a real pointer sequence and include the release sample', async () => {
  assert.equal(button('Edit history').hidden, false);
  assert.equal(button('Undo').disabled, true);
  const slider = document.querySelector('.dialkit-slider');
  slider.addEventListener('pointerup', () => studio.edit(9));
  pointer(slider, 'pointerdown');
  studio.edit(6); studio.edit(7); studio.edit(8);
  pointer(slider, 'pointerup');
  await Promise.resolve();
  button('Undo').click();
  assert.equal(current, 5);
  assert.equal(button('Undo').disabled, true);
  button('Redo').click();
  assert.equal(current, 9);
});

test('shortcuts leave text editing native and resizing keeps history', () => {
  studio.edit(7);
  const key = (target, extra = {}) => {
    const event = new browser.KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true, ...extra });
    target.dispatchEvent(event);
    return event;
  };
  assert.equal(key(document.querySelector('input')).defaultPrevented, false);
  assert.equal(current, 7);
  key(document.body);
  assert.equal(current, 5);
  key(document.body, { shiftKey: true });
  assert.equal(current, 7);
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  assert.equal(button('Edit history').hidden, false);
  button('Undo').click();
  assert.equal(current, 5, 'history survives switching to a narrow layout');
});

test('losing window focus completes the active drag', () => {
  pointer(document.querySelector('.dialkit-slider'), 'pointerdown');
  studio.edit(8);
  browser.dispatchEvent(new browser.Event('blur'));
  studio.edit(10);
  button('Undo').click();
  assert.equal(current, 8);
  button('Undo').click();
  assert.equal(current, 5);
});

for (const endEvent of ['pointerup', 'pointercancel']) test(`touch slider ${endEvent} commits one undo step`, async () => {
  browser.happyDOM.setWindowSize({ width: 390, height: 844 });
  const slider = document.querySelector('.dialkit-slider');
  slider.getBoundingClientRect = () => ({ left: 0, width: 300 });
  slider.setPointerCapture = () => {};
  slider.hasPointerCapture = () => false;
  const removeTouch = mountTouchSlider(slider, { min: 3, max: 12, step: 1, onChange: studio.edit });
  const send = (type, x, y = 20) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerId: 2, pointerType: 'touch', button: 0, clientX: x, clientY: y, bubbles: true
  }));
  send('pointerdown', 60);
  send('pointermove', 150);
  send('pointermove', 260);
  send(endEvent, 260);
  await Promise.resolve();
  assert.equal(current, 11);
  button('Undo').click();
  assert.equal(current, 5);
  assert.equal(button('Undo').disabled, true);
  // Scrolling through a slider must leave its value and redo history alone.
  send('pointerdown', 60);
  send('pointermove', 61, 80);
  send('pointercancel', 61, 80);
  await Promise.resolve();
  assert.equal(current, 5);
  assert.equal(button('Redo').disabled, false);
  button('Redo').click();
  assert.equal(current, 11);
  removeTouch();
});

for (const name of ['hue', 'opacity']) test(`color ${name} range drag is one undo step`, async () => {
  const range = document.createElement('input');
  range.type = 'range';
  range.className = `dialkit-color-track dialkit-color-${name}`;
  document.querySelector('.halftone-dialkit').append(range);
  range.addEventListener('input', () => studio.edit(Number(range.value)));
  pointer(range, 'pointerdown');
  for (const value of [10, 20, 30]) {
    range.value = String(value);
    range.dispatchEvent(new browser.Event('input', { bubbles: true }));
  }
  assert.equal(button('Undo').disabled, true, 'undo cannot interrupt a drag');
  pointer(range, 'pointerup');
  await Promise.resolve();
  button('Undo').click();
  assert.equal(current, 5);
  assert.equal(button('Undo').disabled, true);
  button('Redo').click();
  assert.equal(current, 30);
});

test('simultaneous pointers complete their edits before history can be used', async () => {
  const slider = document.querySelector('.dialkit-slider');
  const send = (type, id) => slider.dispatchEvent(new browser.PointerEvent(type, {
    pointerId: id, button: 0, pointerType: 'touch', bubbles: true
  }));
  send('pointerdown', 1); studio.edit(7);
  send('pointerdown', 2); studio.edit(8);
  send('pointerup', 1); await Promise.resolve();
  assert.equal(button('Undo').disabled, true);
  studio.edit(9);
  send('pointerup', 2); await Promise.resolve();
  button('Undo').click();
  assert.equal(current, 5);
  assert.equal(button('Undo').disabled, true);
});
