import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountDesktopPanelDrag } from '../src/desktop-panel-drag.js';

function media(matches) {
  const target = new EventTarget();
  Object.defineProperty(target, 'matches', { value: matches });
  return target;
}

test('desktop panel dragging stays within the viewport and resets when remounted', async () => {
  const browser = new Window({ url: 'http://localhost:5173', width: 1200, height: 800 });
  const desktop = media(true);
  const touch = media(false);
  browser.matchMedia = (query) => query.includes('any-pointer: coarse') ? touch : desktop;
  globalThis.window = browser;
  globalThis.document = browser.document;
  globalThis.getComputedStyle = browser.getComputedStyle.bind(browser);
  globalThis.requestAnimationFrame = browser.requestAnimationFrame.bind(browser);
  globalThis.cancelAnimationFrame = browser.cancelAnimationFrame.bind(browser);
  globalThis.ResizeObserver = undefined;

  const rail = document.createElement('aside');
  const handle = document.createElement('div');
  rail.append(handle);
  document.body.append(rail);
  rail.getBoundingClientRect = () => new browser.DOMRect(16, 16, 400, 500);
  const captures = new Set();
  handle.setPointerCapture = (id) => captures.add(id);
  handle.hasPointerCapture = (id) => captures.has(id);
  handle.releasePointerCapture = (id) => captures.delete(id);

  const unmount = mountDesktopPanelDrag(rail, handle);
  await new Promise((resolve) => browser.requestAnimationFrame(resolve));
  assert.equal(rail.dataset.panelDraggable, 'true');

  const pointer = (type, x, y) => handle.dispatchEvent(new browser.PointerEvent(type, {
    pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0,
    clientX: x, clientY: y, bubbles: true, cancelable: true
  }));
  pointer('pointerdown', 40, 40);
  pointer('pointermove', 1100, 760);
  pointer('pointerup', 1100, 760);

  assert.equal(rail.style.getPropertyValue('--studio-panel-drag-x'), '768px');
  assert.equal(rail.style.getPropertyValue('--studio-panel-drag-y'), '268px');
  assert.equal(browser.sessionStorage.getItem('halftone.panel-position.v1'), null);
  assert.equal(rail.classList.contains('is-panel-dragging'), false);

  unmount();
  assert.equal(rail.hasAttribute('data-panel-draggable'), false);
  assert.equal(rail.style.getPropertyValue('--studio-panel-drag-x'), '');

  const remount = mountDesktopPanelDrag(rail, handle);
  assert.equal(rail.style.getPropertyValue('--studio-panel-drag-x'), '');
  assert.equal(rail.style.getPropertyValue('--studio-panel-drag-y'), '');
  remount();
  await browser.happyDOM.abort();
  browser.close();
});
