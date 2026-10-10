const API = 'https://api.elevenlabs.io';

export class ApiError extends Error {
  constructor(message, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const permissions = {
  voices: 'Voices → Read (voices_read)',
  models: 'Models → Read (models_read)',
  speech: 'Text to Speech → Access (text_to_speech)',
};

export function errorMessage(error) {
  if (error instanceof ApiError) return error.message;
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return 'The request timed out or was cancelled. Please try again.';
  }
  return 'Could not reach ElevenLabs. Check your connection and try again. Your settings are still saved.';
}

async function checkResponse(response, operation) {
  if (response.ok) return response;
  const body = await response.json().catch(() => ({}));
  const detail = body.detail || {};
  const code = typeof detail === 'object' ? String(detail.status || detail.code || '') : '';
  const message = typeof detail === 'string' ? detail : String(detail.message || '');
  const evidence = `${code} ${message}`.toLowerCase();
  if (/missing.*permission|permission.*missing|insufficient.*permission/.test(evidence)) {
    throw new ApiError(`Your key needs ${permissions[operation]}. Edit it in ElevenLabs → Developers → API Keys, then retry. Keep the key restricted.`, 'permission');
  }
  if (/quota|credit|character_limit|character limit/.test(evidence) && !/max_character_limit/.test(code)) {
    throw new ApiError('ElevenLabs reports a credit limit. Check your account credits and this API key’s credit cap, then try again.', 'quota');
  }
  if (/unusual_activity|abuse|free_tier/.test(evidence)) {
    throw new ApiError('ElevenLabs has restricted free-tier access for this connection. Check your ElevenLabs account or contact their support. Replacing your key may not fix this.', 'account');
  }
  if (/invalid_api_key|unauthorized|needs_authorization|expired/.test(code) || response.status === 401) {
    throw new ApiError('ElevenLabs rejected this key. Copy the full secret API key, not its name or Key ID. Check whether it expired or was revoked.', 'invalid_key');
  }
  if (response.status === 403) {
    throw new ApiError(`ElevenLabs denied access. Check ${permissions[operation]}, the key’s IP restrictions, and your account’s access. Your settings have not been removed.`, 'permission');
  }
  if (/voice_not_found|voice.*not.*found/.test(evidence)) {
    throw new ApiError('This voice is no longer available. Refresh your voices and choose another one.', 'voice');
  }
  if (/model_not_found|model.*not.*found/.test(evidence)) {
    throw new ApiError('This model is no longer available. Refresh the model list and choose another one.', 'model');
  }
  if (/max_character_limit|text_too_long|too many characters/.test(evidence)) {
    throw new ApiError('This selection exceeds the model’s text limit. Select a shorter passage or choose a model with a higher limit.', 'length');
  }
  if (response.status === 429 || /concurrent|system_busy/.test(evidence)) {
    throw new ApiError('ElevenLabs is busy or you have too many requests running. Wait a moment and try again.', 'rate_limit');
  }
  if (response.status >= 500) {
    throw new ApiError('ElevenLabs is temporarily unavailable. Try again shortly. Your settings are still saved.', 'server');
  }
  throw new ApiError(`ElevenLabs could not complete this ${operation === 'speech' ? 'reading' : 'request'} (HTTP ${response.status}). Check your voice, model and account access, then retry.`, code || 'request');
}

async function catalogRequest(path, apiKey, operation, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, {once: true});
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${API}${path}`, {headers: {'xi-api-key': apiKey}, signal: controller.signal});
    await checkResponse(response, operation);
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadCatalog(apiKey, {signal} = {}) {
  const key = apiKey.trim();
  if (!key) throw new ApiError('Paste your full ElevenLabs secret API key first.', 'missing_key');
  const voicesRequest = (async () => {
    const voices = new Map();
    const tokens = new Set();
    let token;
    do {
      const query = new URLSearchParams({page_size: '100', sort: 'name', sort_direction: 'asc'});
      if (token) query.set('next_page_token', token);
      const data = await catalogRequest(`/v2/voices?${query}`, key, 'voices', signal);
      if (!Array.isArray(data.voices)) throw new ApiError('ElevenLabs returned an unreadable voice list. Please retry.');
      for (const voice of data.voices) {
        if (!voice.voice_id || !voice.name) continue;
        voices.set(voice.voice_id, {
          id: voice.voice_id,
          name: voice.name,
          description: voice.description || '',
          labels: voice.labels && typeof voice.labels === 'object' ? voice.labels : {},
          previewUrl: safePreviewUrl(voice.preview_url),
        });
      }
      if (!data.has_more) break;
      token = data.next_page_token;
      if (!token || tokens.has(token)) throw new ApiError('The voice list was incomplete. Please refresh and try again.');
      tokens.add(token);
    } while (true);
    return [...voices.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();
  const modelsRequest = catalogRequest('/v1/models', key, 'models', signal).then(data => {
    if (!Array.isArray(data)) throw new ApiError('ElevenLabs returned an unreadable model list. Please retry.');
    return data.filter(model => model.can_do_text_to_speech && model.model_id && model.name).map(model => ({
      id: model.model_id,
      name: model.name,
      description: model.description || '',
      maxCharacters: Number.isFinite(model.maximum_text_length_per_request) && model.maximum_text_length_per_request > 0
        ? model.maximum_text_length_per_request : null,
    }));
  });
  const [voices, models] = await Promise.all([voicesRequest, modelsRequest]);
  if (!models.length) throw new ApiError('No text-to-speech models are available for this key. Check Models read permission and your account access.');
  return {voices, models};
}

export function safePreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export async function requestSpeech(settings, text, signal) {
  if (!settings.apiKey) throw new ApiError('Open Human Reader and connect your ElevenLabs API key first.', 'missing_key');
  if (!settings.selectedVoiceId || !settings.mode) throw new ApiError('Open Human Reader and choose a voice and model first.', 'settings');
  const selection = typeof text === 'string' ? text.trim() : '';
  if (!selection) throw new ApiError('Select some text on the page first.', 'selection');
  if (settings.maxCharacters && selection.length > settings.maxCharacters) {
    throw new ApiError(`This model accepts up to ${settings.maxCharacters.toLocaleString()} characters per reading. Your selection has ${selection.length.toLocaleString()}. Select a shorter passage.`, 'length');
  }
  const response = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(settings.selectedVoiceId)}/stream?output_format=mp3_44100_128`, {
    method: 'POST', signal,
    headers: {'xi-api-key': settings.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg'},
    body: JSON.stringify({text: selection, model_id: settings.mode}),
  });
  await checkResponse(response, 'speech');
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('audio/')) {
    throw new ApiError('ElevenLabs did not return playable audio. Please try again.', 'audio');
  }
  return response;
}
