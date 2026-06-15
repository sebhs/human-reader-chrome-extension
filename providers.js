// Shared provider configuration used by both content.js (in-page) and popup.js.
// Each provider describes how to authenticate, list voices, validate a key, and
// build a streaming text-to-speech request. The playback engine in content.js is
// provider-agnostic: it only branches on `streamFormat` when reading the response.

const PROVIDER_IDS = ["elevenlabs", "60db"];
const DEFAULT_PROVIDER = "elevenlabs";

// Storage keys are namespaced per provider so switching providers never clobbers
// the other provider's API key, cached voices, or selected voice.
const pkey = (providerId, name) => `${providerId}_${name}`;

// Preserve the exact ElevenLabs model resolution (including legacy mode values).
const resolveElevenLabsModel = (mode) =>
  mode === "englishfast" || mode === "eleven_turbo_v2"
    ? "eleven_turbo_v2"
    : mode === "multilingual" || mode === "eleven_multilingual_v2"
    ? "eleven_multilingual_v2"
    : "eleven_turbo_v2_5";

const PROVIDERS = {
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs",
    // Onboarding (shown in the popup welcome screen)
    signupUrl: "https://elevenlabs.io/?from=partnerlove324",
    signupLabel: "elevenlabs.io",
    apiKeyHelpUrl:
      "https://help.elevenlabs.io/hc/en-us/articles/14599447207697-How-to-authorize-yourself-using-your-xi-api-key",
    homeUrl: "https://elevenlabs.io",
    // Voice / model behaviour
    fallbackVoiceId: "21m00Tcm4TlvDq8ikWAM", // "Rachel"
    models: [
      { value: "eleven_turbo_v2", label: "Turbo v2" },
      { value: "eleven_turbo_v2_5", label: "Turbo v2.5" },
      { value: "eleven_multilingual_v2", label: "Multilingual v2" },
    ],
    defaultModel: "eleven_turbo_v2_5",
    // ElevenLabs streams raw binary MP3 frames straight into the SourceBuffer.
    streamFormat: "binary",
    authHeaders: (apiKey) => ({ "xi-api-key": apiKey }),
    validateUrl: "https://api.elevenlabs.io/v1/user",
    voicesUrl: "https://api.elevenlabs.io/v1/voices",
    parseVoices: (json) =>
      (json.voices || []).map((voice) => ({
        id: voice.voice_id,
        name: voice.name,
      })),
    buildTtsRequest: ({ voiceId, text, mode }) => ({
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      headers: { Accept: "audio/mpeg", "Content-Type": "application/json" },
      body: {
        model_id: resolveElevenLabsModel(mode),
        text: text,
        voice_settings: {
          similarity_boost: 0.5,
          stability: 0.5,
        },
      },
    }),
  },

  "60db": {
    id: "60db",
    label: "60db",
    signupUrl: "https://60db.ai",
    signupLabel: "60db.ai",
    apiKeyHelpUrl: "https://docs.60db.ai",
    homeUrl: "https://60db.ai",
    // 60db has no fallback voice; the user must pick one of their own voices.
    fallbackVoiceId: null,
    // The 60db model is a property of the voice ("60db Fast" / "60db Quality"),
    // not a request parameter, so there is no model selector for this provider.
    models: [],
    defaultModel: null,
    // 60db streams newline-delimited JSON; each chunk holds base64 audio.
    streamFormat: "ndjson",
    authHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    // 60db has no dedicated /user endpoint; listing voices validates the key.
    validateUrl: "https://api.60db.ai/myvoices",
    voicesUrl: "https://api.60db.ai/myvoices",
    parseVoices: (json) =>
      (json.data || []).map((voice) => ({
        id: voice.voice_id,
        name: voice.name,
      })),
    buildTtsRequest: ({ voiceId, text }) => ({
      url: "https://api.60db.ai/tts-stream",
      headers: { "Content-Type": "application/json" },
      body: {
        text: text,
        voice_id: voiceId,
        // Speed is applied uniformly via audioElement.playbackRate (like
        // ElevenLabs) so playback behaviour stays identical across providers.
        stability: 50,
        similarity: 75,
        enhance: true,
        output_format: "mp3", // MP3 so it feeds the audio/mpeg SourceBuffer.
      },
    }),
  },
};
