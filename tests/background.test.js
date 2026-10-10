import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackground } from '../background.js';
const event = () => ({ listeners: [], addListener(listener) { this.listeners.push(listener); } });
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  let context = false;
  const messages = [];
  const chrome = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, getContexts: async () => context ? [{}] : [], sendMessage: async message => { messages.push(message); return { ok: true }; }, onMessage: event(), onInstalled: event() },
    storage: { local: { setAccessLevel: async () => {}, get: async () => ({ apiKey: 'secret', selectedVoiceId: 'voice', mode: 'model' }) }, onChanged: event() },
    offscreen: { createDocument: async () => { context = true; }, closeDocument: async () => { context = false; } },
    tabs: { sendMessage: async () => {}, query: async () => [{ id: 1 }] },
    contextMenus: { onClicked: event() }, commands: { onCommand: event() }
  };
  return { chrome, messages };
}
test('Stop wins against a read still loading settings, and a later read works', async () => {
  const { chrome, messages } = setup();
  const background = createBackground(chrome);
  let finish;
  chrome.storage.local.get = () => new Promise(resolve => { finish = resolve; });
  const pending = background.read('hello', 7);
  await tick();
  await background.stop();
  finish({ apiKey: 'secret', selectedVoiceId: 'voice', mode: 'model' });
  await pending;
  assert.equal((await background.getPlayback()).state.status, 'idle');
  assert.equal(messages.filter(message => message.action === 'start').length, 0);
  chrome.storage.local.get = async () => ({ apiKey: 'secret', selectedVoiceId: 'voice', mode: 'model' });
  await background.read('new text', 8);
  assert.equal(messages.find(message => message.action === 'start').text, 'new text');
});
test('Stop wins while the offscreen document is being created', async () => {
  const { chrome, messages } = setup();
  let finish;
  const create = chrome.offscreen.createDocument;
  let closed = 0;
  const close = chrome.offscreen.closeDocument;
  chrome.offscreen.closeDocument = async () => { closed++; await close(); };
  chrome.offscreen.createDocument = () => new Promise(resolve => { finish = async () => { await create(); resolve(); }; });
  const background = createBackground(chrome);
  const pending = background.read('hello', 7);
  await tick();
  const stopping = background.stop();
  await finish();
  await Promise.all([pending, stopping]);
  assert.equal(closed, 1);
  assert.equal((await background.getPlayback()).state.status, 'idle');
  assert.equal(messages.filter(message => message.action === 'start').length, 0);
});
test('Stop also cancels a delayed selection lookup', async () => {
  const { chrome, messages } = setup();
  let finish;
  chrome.tabs.sendMessage = () => new Promise(resolve => { finish = resolve; });
  const background = createBackground(chrome);
  const pending = background.handle({ action: 'readSelection' });
  await tick();
  await background.stop();
  finish({ text: 'old selection' });
  await pending;
  assert.equal((await background.getPlayback()).state.status, 'idle');
  assert.equal(messages.filter(message => message.action === 'start').length, 0);
});
test('a late settings response cannot replace a newer reading', async () => {
  const { chrome, messages } = setup();
  let finish;
  const settings = { apiKey: 'secret', selectedVoiceId: 'voice', mode: 'model' };
  chrome.storage.local.get = () => new Promise(resolve => { finish = resolve; });
  const background = createBackground(chrome);
  const first = background.read('old text', 1);
  await tick();
  chrome.storage.local.get = async () => settings;
  await background.read('new text', 2);
  finish(settings);
  await first;
  assert.deepEqual(messages.filter(message => message.action === 'start').map(message => message.text), ['new text']);
  assert.equal((await background.getPlayback()).state.sourceTabId, 2);
});
test('a restarted worker restores actual offscreen playback without returning credentials', async () => {
  const { chrome } = setup();
  chrome.runtime.getContexts = async () => [{}];
  chrome.runtime.sendMessage = async message => message.action === 'getState'
    ? { requestId: 'existing', state: { status: 'paused', message: '', sourceTabId: 12 } } : {};
  const background = createBackground(chrome);
  assert.deepEqual(await background.getPlayback(), { ok: true, state: { status: 'paused', message: '', sourceTabId: 12 } });
  assert.deepEqual(await background.handle({ action: 'getPreferences' }), { ok: true, showSelectionButton: true });
});
test('offscreen events restore a restarted worker but cannot undo Stop', async () => {
  const { chrome, messages } = setup();
  const background = createBackground(chrome);
  const sender = { url: chrome.runtime.getURL('offscreen.html') };
  const message = { action: 'playerState', requestId: 'existing', state: { status: 'playing', message: '', sourceTabId: 12 } };
  assert.deepEqual(await background.handle(message, sender), { ok: true });
  assert.deepEqual(messages.at(-1).state, { status: 'playing', message: '', sourceTabId: 12 });
  await background.stop();
  assert.deepEqual(await background.handle(message, sender), { ok: false, error: 'Stale audio session.' });
  assert.equal((await background.getPlayback()).state.status, 'idle');
});

test('terminal cleanup cannot close an immediate new reading, including transient start idle', async () => {
  const { chrome, messages } = setup();
  let closed = 0;
  chrome.offscreen.closeDocument = async () => { closed++; };
  const background = createBackground(chrome);
  const sender = { url: chrome.runtime.getURL('offscreen.html') };
  const notify = (id, status) => background.handle({ action: 'playerState', requestId: id, state: { status, message: '', sourceTabId: 1 } }, sender);
  await background.read('first', 1);
  const first = messages.find(message => message.action === 'start').requestId;
  await notify(first, 'idle');
  await tick();
  assert.equal(closed, 0);
  await notify(first, 'loading');
  await notify(first, 'playing');
  const terminal = notify(first, 'idle');
  const second = background.read('second', 2);
  await Promise.all([terminal, second]);
  await tick();
  assert.equal(closed, 0);
  assert.deepEqual(messages.filter(message => message.action === 'start').map(message => message.text), ['first', 'second']);
  assert.equal((await notify(first, 'idle')).ok, false);
});
test('new reading waits for an already pending close and creates a fresh player', async () => {
  const { chrome, messages } = setup();
  const background = createBackground(chrome);
  await background.read('first', 1);
  const close = chrome.offscreen.closeDocument;
  let finish;
  chrome.offscreen.closeDocument = () => new Promise(resolve => { finish = async () => { await close(); resolve(); }; });
  const stopping = background.stop();
  await tick();
  const reading = background.read('second', 2);
  await tick();
  assert.equal(messages.filter(message => message.action === 'start').length, 1);
  await finish();
  await Promise.all([stopping, reading]);
  assert.equal(messages.filter(message => message.action === 'start').length, 2);
  assert.equal((await chrome.runtime.getContexts()).length, 1);
});
test('restarted worker accepts a finished session and closes its document', async () => {
  const { chrome } = setup();
  await chrome.offscreen.createDocument();
  const background = createBackground(chrome);
  await background.handle({ action: 'playerState', requestId: 'existing', state: { status: 'idle', message: '', sourceTabId: 12 } }, { url: chrome.runtime.getURL('offscreen.html') });
  await tick();
  assert.equal((await chrome.runtime.getContexts()).length, 0);
});
test('speed changes reach an existing player without creating a document', async () => {
  const { chrome, messages } = setup();
  createBackground(chrome);
  const change = chrome.storage.onChanged.listeners[0];
  change({ speed: { newValue: 2.5 } }, 'local');
  await tick();
  assert.equal(messages.length, 0);
  await chrome.offscreen.createDocument();
  change({ speed: { newValue: 2.5 } }, 'local');
  await tick();
  assert.deepEqual(messages, [{ target: 'offscreen', action: 'setSpeed', speed: 2.5 }]);
});
test('player declares audio playback and retained object URL purposes', async () => {
  const { chrome } = setup();
  const create = chrome.offscreen.createDocument;
  let options;
  chrome.offscreen.createDocument = async value => { options = value; await create(); };
  await createBackground(chrome).read('hello', 1);
  assert.deepEqual(options.reasons, ['AUDIO_PLAYBACK', 'BLOBS']);
});

test('finished and failed active readings release the offscreen document', async () => {
  for (const status of ['idle', 'error']) {
    const { chrome, messages } = setup();
    const background = createBackground(chrome);
    const sender = { url: chrome.runtime.getURL('offscreen.html') };
    await background.read('hello', 1);
    const requestId = messages.find(message => message.action === 'start').requestId;
    for (const next of ['loading', status]) {
      await background.handle({ action: 'playerState', requestId, state: { status: next, sourceTabId: 1, message: '' } }, sender);
    }
    await tick();
    assert.equal((await chrome.runtime.getContexts()).length, 0);
    assert.equal((await background.getPlayback()).state.status, status);
  }
});
test('restarted worker cleans up an idle document found while retrieving playback', async () => {
  const { chrome } = setup();
  await chrome.offscreen.createDocument();
  chrome.runtime.sendMessage = async message => message.action === 'getState'
    ? { requestId: 'done', state: { status: 'idle', message: '', sourceTabId: 12 } } : {};
  const background = createBackground(chrome);
  assert.equal((await background.getPlayback()).state.status, 'idle');
  await tick();
  assert.equal((await chrome.runtime.getContexts()).length, 0);
});

test('moving a reading to another tab clears only the previous tab controls', async () => {
  const { chrome } = setup();
  const sent=[];
  chrome.tabs.sendMessage=async(tabId,message)=>{sent.push({tabId,state:message.state})};
  const background=createBackground(chrome);
  await background.read('first',1);
  await background.read('second',2);
  const previous=sent.filter(item=>item.tabId===1).at(-1);
  const current=sent.filter(item=>item.tabId===2).at(-1);
  assert.equal(previous.state.status,'idle');
  assert.equal(current.state.status,'loading');
  assert.equal(current.state.sourceTabId,2);
});


test('a blocked selection stops existing audio before replacing its controls with an error', async () => {
  const { chrome, messages } = setup();
  const background = createBackground(chrome);
  await background.read('previous reading', 1);
  chrome.tabs.query = async () => [{ id: 2 }];
  chrome.tabs.sendMessage = async (_id, message) => {
    if (message.action === 'getSelection') throw new Error('Cannot access page');
  };
  const result = await background.handle({ action: 'readSelection' });
  assert.equal(result.ok, false);
  assert.match(result.error, /Chrome blocks/);
  assert.equal(messages.filter(message => message.action === 'stop').length, 1);
  assert.equal((await chrome.runtime.getContexts()).length, 0);
  assert.equal((await background.getPlayback()).state.status, 'error');
});

test('upgraded users can read with legacy model preferences before opening the popup', async () => {
  const { chrome, messages } = setup();
  chrome.storage.local.get = async () => ({ apiKey: 'secret', selectedVoiceId: 'voice', mode: 'englishfast', speed: 1.5 });
  const background = createBackground(chrome);
  await background.read('hello', 1);
  assert.equal(messages.find(message => message.action === 'start').settings.mode, 'eleven_turbo_v2');
});
