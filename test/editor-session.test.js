import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { mountEditorSession, EDITOR_SESSION_KEY } from '../src/editor-session.js';

test('session writes are coalesced and the latest edit is flushed when leaving or hiding the page', async () => {
  const browser = new Window({ url: 'http://localhost:5173' });
  let state = { settings: { contrast: 1 } };
  const session = mountEditorSession({ browser, capture: () => state, restore() {} });
  try {
    for (let contrast = 1; contrast <= 2; contrast += 0.1) {
      state = { settings: { contrast } };
      session.schedule();
    }
    assert.equal(browser.localStorage.getItem(EDITOR_SESSION_KEY), null);
    await new Promise((resolve) => browser.setTimeout(resolve, 300));
    assert.deepEqual(JSON.parse(browser.localStorage.getItem(EDITOR_SESSION_KEY)).settings, state.settings);
    state = { settings: { contrast: 2.2 } };
    session.schedule();
    browser.dispatchEvent(new browser.Event('pagehide'));
    assert.equal(JSON.parse(browser.localStorage.getItem(EDITOR_SESSION_KEY)).settings.contrast, 2.2);
    state = { settings: { contrast: 2.4 } };
    session.schedule();
    Object.defineProperty(browser.document, 'visibilityState', { configurable: true, value: 'hidden' });
    browser.document.dispatchEvent(new browser.Event('visibilitychange'));
    assert.equal(JSON.parse(browser.localStorage.getItem(EDITOR_SESSION_KEY)).settings.contrast, 2.4);
  } finally {
    session.destroy();
    await browser.happyDOM.abort();
    browser.close();
  }
});

test('corrupt and unavailable session storage cannot prevent editing', async () => {
  for (const mode of ['corrupt', 'unavailable']) {
    const browser = new Window({ url: 'http://localhost:5173' });
    if (mode === 'corrupt') browser.localStorage.setItem(EDITOR_SESSION_KEY, '{bad json');
    else Object.defineProperty(browser, 'localStorage', { get() { throw new Error('Storage unavailable'); } });
    const session = mountEditorSession({ browser, capture: () => ({ settings: { contrast: 1.5 } }),
      restore() { assert.fail('invalid data must not be restored'); } });
    assert.doesNotThrow(() => { session.schedule(); session.flush(); session.destroy(); });
    await browser.happyDOM.abort();
    browser.close();
  }
});
