import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountImageDrop } from '../src/image-drop.js';

function setup() {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = '<main><div id="preview"><canvas></canvas><button></button></div><aside></aside></main>';
  const zone = document.getElementById('preview');
  const loaded = [];
  const errors = [];
  const unmount = mountImageDrop(zone, { onFile: (file) => loaded.push(file), onError: (error) => errors.push(error) });
  const fire = (type, target = zone, transfer = { types: ['Files'], files: [] }) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    target.dispatchEvent(event);
    return event;
  };
  return { window, document, zone, loaded, errors, unmount, fire };
}

test('file hover survives child boundaries, accepts one file, and resets after drop', () => {
  const { window, zone, loaded, errors, fire, unmount } = setup();
  fire('dragenter');
  fire('dragenter', zone.querySelector('canvas'));
  fire('dragleave');
  assert.equal(zone.classList.contains('is-file-over'), true);
  const transfer = { types: ['Files'], files: [] };
  assert.equal(fire('dragover', zone.querySelector('button'), transfer).defaultPrevented, true);
  assert.equal(transfer.dropEffect, 'copy');
  // The protected drag store has no files until drop; empty MIME must be allowed
  // through to the existing byte-level image validator.
  const file = new window.File(['image data'], 'photo.png', { type: '' });
  assert.equal(fire('drop', zone.querySelector('canvas'), { types: ['Files'], files: [file] }).defaultPrevented, true);
  assert.deepEqual(loaded, [file]);
  assert.deepEqual(errors, []);
  assert.equal(zone.classList.contains('is-file-over'), false);
  unmount();
  window.close();
});

test('missed drops cannot navigate away; multiple files cannot replace the image arbitrarily', () => {
  const { window, document, zone, loaded, errors, fire, unmount } = setup();
  const files = [new window.File(['a'], 'a.png'), new window.File(['b'], 'b.png')];
  fire('dragenter');
  const outside = { types: ['Files'], files };
  assert.equal(fire('dragover', document.querySelector('aside'), outside).defaultPrevented, true);
  assert.equal(outside.dropEffect, 'none');
  assert.equal(zone.classList.contains('is-file-over'), false);
  assert.equal(fire('drop', document.body, outside).defaultPrevented, true);
  assert.deepEqual(loaded, []);
  assert.deepEqual(errors, []);
  fire('drop', zone, outside);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /one image at a time/);
  assert.deepEqual(loaded, []);
  unmount();
  window.close();
});

test('links and text remain native; leaving, cancelling and unmounting clear the hint', () => {
  const { window, document, zone, loaded, fire, unmount } = setup();
  const link = { types: ['text/uri-list'], files: [] };
  fire('dragenter', zone, link);
  assert.equal(zone.classList.contains('is-file-over'), false);
  assert.equal(fire('dragover', zone, link).defaultPrevented, false);
  assert.equal(fire('drop', zone, link).defaultPrevented, false);
  assert.deepEqual(loaded, []);
  for (const clear of [
    () => fire('dragleave'),
    () => fire('dragend', document),
    () => window.dispatchEvent(new window.Event('blur')),
    () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  ]) {
    fire('dragenter');
    clear();
    assert.equal(zone.classList.contains('is-file-over'), false);
  }
  fire('dragenter');
  unmount();
  assert.equal(zone.classList.contains('is-file-over'), false);
  assert.equal(fire('dragover').defaultPrevented, false);
  window.close();
});
