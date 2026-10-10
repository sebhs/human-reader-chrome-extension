import {loadCatalog, errorMessage, safePreviewUrl} from './api.js';
import {normalizeSettings, catalogSettings} from './settings.js';

const $ = id => document.getElementById(id);
let settings = normalizeSettings();
let catalogRequest;
let previewAudio;
let previewId = 0;

function notice(message = '', success = false) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
  $('notice').classList.toggle('success', success);
}

async function send(action, extra = {}) {
  try {
    const response = await chrome.runtime.sendMessage({target: 'background', action, ...extra});
    if (!response?.ok) throw new Error(response?.error || 'The extension could not respond. Reload it and try again.');
    return response;
  } catch (error) {
    notice(error.message);
    return null;
  }
}

async function save(values) {
  await chrome.storage.local.set(values);
  settings = {...settings, ...values};
}

function connectionView(show) {
  $('connection').hidden = !show;
  $('reader').hidden = show;
  $('cancelConnection').hidden = !settings.apiKey;
  $('connectionBadge').textContent = settings.apiKey ? 'Connected' : 'Setup';
  $('connect').textContent = settings.apiKey ? 'Save new key' : 'Connect';
  if (!show) stopPreview();
}

function stopPreview() {
  previewId++;
  previewAudio?.pause();
  if (previewAudio) previewAudio.src = '';
  previewAudio = null;
  $('preview').textContent = 'Preview';
}

function voiceDetails() {
  const voice = settings.voices.find(voice => voice.id === settings.selectedVoiceId);
  const labels = Object.values(voice?.labels || {}).filter(value => typeof value === 'string');
  $('voices').title = voice?.description || '';
  $('voiceDescription').textContent = voice ? labels.join(' · ') || voice.description || 'Voice from your ElevenLabs library.' : 'Choose an available voice to start reading.';
  $('preview').disabled = !safePreviewUrl(voice?.previewUrl);
  $('preview').title = voice?.previewUrl ? 'Play the existing voice sample. No speech generation.' : 'No preview is available for this voice.';
}

function renderVoices() {
  const query = $('voiceSearch').value.trim().toLowerCase();
  const matches = settings.voices.filter(voice => [voice.name, voice.description, ...Object.values(voice.labels || {})].join(' ').toLowerCase().includes(query));
  const selected = settings.voices.find(voice => voice.id === settings.selectedVoiceId);
  const visible = selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  $('voices').replaceChildren();
  if (!selected && settings.selectedVoiceId) $('voices').add(new Option('Saved voice unavailable — choose another', settings.selectedVoiceId));
  if (!visible.length && !settings.selectedVoiceId) $('voices').add(new Option('No voices available', ''));
  for (const voice of visible) {
    const label = [voice.name, voice.labels?.language, voice.labels?.accent].filter(Boolean).join(' · ');
    $('voices').add(new Option(label, voice.id));
  }
  $('voices').value = settings.selectedVoiceId;
  $('voiceCount').textContent = !settings.voices.length ? 'Add a voice in ElevenLabs, then refresh.' : query ? `${matches.length} matching voice${matches.length === 1 ? '' : 's'}. Your selected voice stays available.` : `${settings.voices.length} voices in your library.`;
  voiceDetails();
  updateReadAvailability();
}

function modelDetails() {
  const model = settings.models.find(model => model.id === settings.mode);
  $('modelDescription').title = model?.description || '';
  $('modelDescription').textContent = model ? model.maxCharacters ? `Up to ${model.maxCharacters.toLocaleString()} characters per reading.` : 'Uses this model’s default voice settings.' : 'Refresh and choose an available model before reading.';
  updateReadAvailability();
}

function updateReadAvailability() {
  $('read').disabled = !settings.voices.some(voice => voice.id === settings.selectedVoiceId) || !settings.models.some(model => model.id === settings.mode);
}

function renderSettings() {
  renderVoices();
  $('model').replaceChildren();
  if (settings.mode && !settings.models.some(model => model.id === settings.mode)) $('model').add(new Option('Saved model unavailable — choose another', settings.mode));
  for (const model of settings.models) $('model').add(new Option(model.name, model.id));
  $('model').value = settings.mode;
  modelDetails();
  $('speed').value = settings.speed;
  $('speedValue').textContent = `${settings.speed}×`;
  $('selectionButton').checked = settings.showSelectionButton;
}

async function refreshCatalog(candidateKey = settings.apiKey, connect = false) {
  catalogRequest?.abort();
  const controller = new AbortController();
  catalogRequest = controller;
  $('refresh').disabled = true;
  $('connect').disabled = true;
  $('refresh').textContent = 'Refreshing…';
  if (connect) $('connect').textContent = 'Connecting…';
  notice();
  try {
    const catalog = await loadCatalog(candidateKey, {signal: controller.signal});
    if (controller.signal.aborted) return;
    const changedKey = connect && candidateKey !== settings.apiKey;
    const values = catalogSettings(settings, catalog, changedKey);
    if (connect) values.apiKey = candidateKey;
    await save(values);
    if (connect) {
      $('apiKey').value = '';
      $('apiKey').type = 'password';
      $('showKey').textContent = 'Show';
      $('showKey').setAttribute('aria-pressed', 'false');
      $('showKey').setAttribute('aria-label', 'Show API key');
      connectionView(false);
    }
    renderSettings();
    const missing = !catalog.voices.some(voice => voice.id === settings.selectedVoiceId) || !catalog.models.some(model => model.id === settings.mode);
    notice(missing ? 'A saved voice or model is unavailable. Choose an available option below.' : connect ? 'Connected. Voices and models loaded. Speech access is checked when you read.' : '', !missing);
  } catch (error) {
    if (!controller.signal.aborted) notice(errorMessage(error));
  } finally {
    if (catalogRequest === controller) {
      $('refresh').disabled = false;
      $('connect').disabled = false;
      $('refresh').textContent = 'Refresh';
      $('connect').textContent = settings.apiKey ? 'Save new key' : 'Connect';
    }
  }
}

function playbackState(state) {
  if (!state) return;
  const active = ['loading', 'playing', 'paused'].includes(state.status);
  $('pause').hidden = !['playing', 'paused'].includes(state.status);
  $('pause').textContent = state.status === 'paused' ? 'Resume' : 'Pause';
  $('stop').hidden = !active;
  $('playbackStatus').textContent = state.message || ({idle: 'Select text on a page, then press Read selection.', loading: 'Preparing your audio…', playing: 'Reading aloud.', paused: 'Reading paused.'}[state.status]) || 'Ready to read.';
}

$('connectForm').addEventListener('submit', event => {
  event.preventDefault();
  refreshCatalog($('apiKey').value.trim(), true);
});
$('showKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('showKey').textContent = show ? 'Hide' : 'Show';
  $('showKey').setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
  $('showKey').setAttribute('aria-pressed', String(show));
});
$('refresh').addEventListener('click', () => refreshCatalog());
$('voiceSearch').addEventListener('input', renderVoices);
$('voices').addEventListener('change', async event => {
  stopPreview();
  await save({selectedVoiceId: event.target.value});
  voiceDetails();
  updateReadAvailability();
});
$('model').addEventListener('change', async event => {
  await save({mode: event.target.value});
  modelDetails();
});
$('speed').addEventListener('input', async event => {
  const speed = Number(event.target.value);
  $('speedValue').textContent = `${speed}×`;
  await save({speed});
});
$('selectionButton').addEventListener('change', event => save({showSelectionButton: event.target.checked}));
$('preview').addEventListener('click', async () => {
  if (previewAudio) return stopPreview();
  const url = safePreviewUrl(settings.voices.find(voice => voice.id === settings.selectedVoiceId)?.previewUrl);
  if (!url) return;
  const id = ++previewId;
  const result = await send('stop');
  if (id !== previewId || !result) return;
  previewAudio = new Audio(url);
  previewAudio.playbackRate = settings.speed;
  previewAudio.addEventListener('ended', () => { if (id === previewId) stopPreview(); });
  previewAudio.addEventListener('error', () => {
    if (id !== previewId) return;
    stopPreview();
    notice('This voice sample could not be played. You can still select the voice, or try another preview.');
  });
  $('preview').textContent = 'Stop';
  try { await previewAudio.play(); } catch {
    if (id !== previewId) return;
    stopPreview();
    notice('The preview could not play. Try another voice or open your ElevenLabs voice library.');
  }
});
$('read').addEventListener('click', async () => { stopPreview(); notice(); const result = await send('readSelection'); playbackState(result?.state); });
$('pause').addEventListener('click', async () => playbackState((await send('toggle'))?.state));
$('stop').addEventListener('click', async () => playbackState((await send('stop'))?.state));
$('changeKey').addEventListener('click', () => { stopPreview(); connectionView(true); notice(); $('apiKey').focus(); });
$('cancelConnection').addEventListener('click', () => { catalogRequest?.abort(); $('apiKey').value = ''; connectionView(false); notice(); });
$('disconnect').addEventListener('click', async () => {
  catalogRequest?.abort();
  stopPreview();
  await send('stop');
  await chrome.storage.local.remove(['apiKey', 'voices', 'models']);
  settings = normalizeSettings({...settings, apiKey: '', voices: [], models: []});
  $('apiKey').value = '';
  connectionView(true);
  notice('Disconnected. Your key was removed from this device.', true);
});
$('shortcuts').addEventListener('click', () => chrome.tabs.create({url: 'chrome://extensions/shortcuts'}));
chrome.runtime.onMessage.addListener(message => {
  if (message.target === 'ui' && message.action === 'playbackState') playbackState(message.state);
});
window.addEventListener('pagehide', () => { catalogRequest?.abort(); stopPreview(); });
window.addEventListener('unhandledrejection', event => { event.preventDefault(); notice('Could not save this change. Please reopen Human Reader and try again.'); });

try {
  settings = normalizeSettings(await chrome.storage.local.get(null));
  await save({mode: settings.mode, speed: settings.speed});
  connectionView(!settings.apiKey);
  renderSettings();
  playbackState((await send('getPlayback'))?.state);
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find(command => command.name === 'read-selection')?.shortcut;
  $('shortcutHint').textContent = shortcut ? `${shortcut} reads selected text. You can also right-click a selection.` : 'Set a reading shortcut, or right-click selected text to read it.';
  if (settings.apiKey) refreshCatalog();
} catch {
  notice('Could not load extension settings. Reload Human Reader from chrome://extensions and try again.');
}
