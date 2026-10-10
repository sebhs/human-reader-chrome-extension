import { normalizeSettings } from './settings.js';

export function createBackground(chrome) {
  let generation = 0;
  let requestId = null;
  let lifecycle = Promise.resolve();
  let startingRequest = null;
  let state = { status: 'idle', message: '', sourceTabId: null };
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const trusted = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const sendPlayer = message => chrome.runtime.sendMessage({ target: 'offscreen', ...message });
  const exists = async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [offscreenUrl] })).length > 0;

  function publish(next) {
    const previousTab = state.sourceTabId;
    state = next;
    const message = { target: 'ui', action: 'playbackState', state };
    chrome.runtime.sendMessage(message).catch(() => {});
    for (const tabId of new Set([previousTab, state.sourceTabId])) {
      if (Number.isInteger(tabId)) {
        const tabMessage = tabId === state.sourceTabId ? message : { ...message, state: { status: 'idle', message: '', sourceTabId: tabId } };
        chrome.tabs.sendMessage(tabId, tabMessage).catch(() => {});
      }
    }
    return state;
  }

  function serialize(operation) {
    const result = lifecycle.then(operation);
    lifecycle = result.catch(() => {});
    return result;
  }

  function cleanup(current, id, expectedState) {
    return serialize(async () => {
      const matches = () => current === generation && id === requestId && state === expectedState;
      if (!matches() || !await exists() || !matches()) return;
      await chrome.offscreen.closeDocument();
    });
  }

  async function ensurePlayer() {
    if (!await exists()) await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK', 'BLOBS'],
      justification: 'Stream speech and retain its MediaSource object URL for playback and resume after a pause.'
    });
  }

  async function read(text, sourceTabId) {
    const current = ++generation;
    requestId = null;
    publish({ status: 'loading', message: '', sourceTabId });
    try {
      if (typeof text !== 'string' || !text.trim()) throw new Error('Select some text on the page first.');
      await trusted;
      const settings = normalizeSettings(await chrome.storage.local.get(['apiKey', 'selectedVoiceId', 'mode', 'speed', 'models']));
      if (current !== generation) return { ok: true, state };
      if (!settings.apiKey || !settings.selectedVoiceId || !settings.mode) throw new Error('Open Human Reader and connect your ElevenLabs key, then choose a voice and model.');
      const maxCharacters = settings.models?.find(model => model.id === settings.mode)?.maxCharacters;
      if (maxCharacters && text.length > maxCharacters) throw new Error(`Select less text. This model supports up to ${maxCharacters.toLocaleString()} characters per request.`);
      await serialize(async () => {
        if (current !== generation) return;
        await ensurePlayer();
        if (current !== generation) return;
        requestId = crypto.randomUUID();
        startingRequest = requestId;
        await sendPlayer({ action: 'start', requestId, text: text.trim(), sourceTabId, settings: { apiKey: settings.apiKey, selectedVoiceId: settings.selectedVoiceId, mode: settings.mode, speed: settings.speed, maxCharacters } });
      });
      return { ok: true, state };
    } catch (error) {
      if (current !== generation) return { ok: true, state };
      await serialize(async () => {
        if (current !== generation) return;
        requestId = null;
        startingRequest = null;
        if (await exists()) {
          if (current !== generation) return;
          await sendPlayer({ action: 'stop' }).catch(() => {});
          await chrome.offscreen.closeDocument();
        }
      });
      if (current !== generation) return { ok: true, state };
      publish({ status: 'error', message: error.message || 'Reading could not start. Try again.', sourceTabId });
      return { ok: false, error: state.message };
    }
  }

  async function stop() {
    const current = ++generation;
    requestId = null;
    publish({ status: 'idle', message: '', sourceTabId: state.sourceTabId });
    startingRequest = null;
    await serialize(async () => {
      if (current !== generation || !await exists() || current !== generation) return;
      await sendPlayer({ action: 'stop' }).catch(() => {});
      await chrome.offscreen.closeDocument();
    });
    return { ok: true, state };
  }

  async function getPlayback() {
    await lifecycle;
    const current = generation;
    if (await exists()) {
      const result = await sendPlayer({ action: 'getState' }).catch(() => null);
      if (result?.state && current === generation && state.status !== 'loading') {
        requestId = result.requestId;
        state = result.state;
        if (['idle', 'error'].includes(state.status)) void cleanup(generation, requestId, state).catch(() => {});
      }
    } else if (current === generation && ['playing', 'paused'].includes(state.status)) {
      publish({ status: 'idle', message: 'The audio session ended. Select text to read again.', sourceTabId: state.sourceTabId });
    }
    return { ok: true, state };
  }

  async function readSelection() {
    const current = ++generation;
    let tab;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (current !== generation) return { ok: true, state };
      if (!tab?.id) throw new Error('No active page');
      const selection = await chrome.tabs.sendMessage(tab.id, { target: 'content', action: 'getSelection' });
      if (current !== generation) return { ok: true, state };
      return read(selection?.text, tab.id);
    } catch {
      if (current !== generation) return { ok: true, state };
      const stoppedGeneration = generation + 1;
      await stop();
      if (generation !== stoppedGeneration) return { ok: true, state };
      const error = 'Chrome blocks extensions on this page. Open a regular website and reload it, then select text to read.';
      publish({ status: 'error', message: error, sourceTabId: tab?.id ?? null });
      return { ok: false, error };
    }
  }

  async function handle(message, sender = {}) {
    if (message.action === 'playerState') {
      if (sender.url !== offscreenUrl) return { ok: false, error: 'Unknown audio session.' };
      if (generation === 0 && requestId === null) requestId = message.requestId;
      if (message.requestId !== requestId) return { ok: false, error: 'Stale audio session.' };
      if (startingRequest !== null && message.requestId === startingRequest && message.state.status === 'idle') return { ok: true };
      if (message.requestId === startingRequest) startingRequest = null;
      publish(message.state);
      if (['idle', 'error'].includes(state.status)) void cleanup(generation, requestId, state).catch(() => {});
      return { ok: true };
    }
    switch (message.action) {
      case 'read': return read(message.text, sender.tab?.id ?? null);
      case 'stop': return stop();
      case 'toggle': {
        if (await exists()) {
          const result = await sendPlayer({ action: 'toggle' });
          return { ok: true, state: result.state };
        }
        return getPlayback();
      }
      case 'getPlayback': {
        const result = await getPlayback();
        if (sender.tab && result.state.sourceTabId !== sender.tab.id) return { ok: true, state: { status: 'idle', message: '', sourceTabId: sender.tab.id } };
        return result;
      }
      case 'readSelection': return readSelection();
      case 'openSettings':
        try { await chrome.action.openPopup(); }
        catch { await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') }); }
        return { ok: true };
      case 'getPreferences': {
        await trusted;
        const { showSelectionButton } = await chrome.storage.local.get('showSelectionButton');
        return { ok: true, showSelectionButton: showSelectionButton !== false };
      }
      default: return { ok: false, error: 'Unknown command.' };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.target !== 'background' || sender.id !== chrome.runtime.id) return;
    handle(message, sender).then(respond, error => respond({ ok: false, error: error.message }));
    return true;
  });
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'readOutLoud', title: 'Read selection with Human Reader', contexts: ['selection'] }));
  });
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'readOutLoud') void read(info.selectionText, tab?.id ?? null);
  });
  chrome.commands.onCommand.addListener(command => {
    if (command === 'read-selection') void readSelection();
    if (command === 'stop-reading') void stop();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.speed) void serialize(async () => {
      if (await exists()) await sendPlayer({ action: 'setSpeed', speed: changes.speed.newValue });
    }).catch(() => {});
    if (!changes.showSelectionButton) return;
    chrome.tabs.query({}).then(tabs => {
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { target: 'ui', action: 'preferencesChanged' }).catch(() => {});
    });
  });
  return { handle, read, stop, getPlayback };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) createBackground(chrome);
