export function normalizeSettings(raw = {}) {
  const aliases = {englishfast: 'eleven_turbo_v2', multilingual: 'eleven_multilingual_v2'};
  const speed = Number(raw.speed);
  return {
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
    selectedVoiceId: raw.selectedVoiceId || '',
    mode: aliases[raw.mode] || raw.mode || '',
    speed: Number.isFinite(speed) && speed >= 0.5 && speed <= 2.5 ? speed : 1,
    voices: Array.isArray(raw.voices) ? raw.voices : [],
    models: Array.isArray(raw.models) ? raw.models : [],
    showSelectionButton: raw.showSelectionButton !== false,
  };
}

export function catalogSettings(settings, catalog, replacingKey = false) {
  const voice = catalog.voices.find(voice => voice.id === settings.selectedVoiceId);
  const model = catalog.models.find(model => model.id === settings.mode);
  return {
    ...catalog,
    selectedVoiceId: voice?.id || (!settings.selectedVoiceId || replacingKey ? catalog.voices[0]?.id || '' : settings.selectedVoiceId),
    mode: model?.id || (!settings.mode || replacingKey
      ? catalog.models.find(model => model.id === 'eleven_flash_v2_5')?.id || catalog.models[0]?.id || ''
      : settings.mode),
  };
}
