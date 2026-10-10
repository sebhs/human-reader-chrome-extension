# Verification for the 2.0 refresh

Checked 2026-10-10. This report separates production-code tests from checks that still require the installed extension.

## Confirmed

- Reproduced the original popup rejecting a valid restricted-key response because `/v1/user` lacked permission. The original error handler also cleared all saved settings.
- `npm test` passes 45 tests covering API permission/error handling, paginated voices, dynamic models, selection limits, legacy preferences, failed key replacement, preview cancellation, stream completion, pause/resume races, cross-tab routing, worker restart, and offscreen lifecycle ordering.
- `npm run check` validates the manifest, bundled file references, JavaScript syntax, and the credential boundary between content scripts and extension contexts.
- Browser popup fixtures confirmed permission-specific guidance, successful connection, failed-key replacement preserving preferences, searchable voices, a missing preview, new model selection, 2.5× speed persistence, and disabled reading for an empty voice library.
- A browser fixture ran the production content script, background router, API module, and player with simulated Chrome APIs and network responses. The browser decoded a real bundled MP3 through MediaSource, reached `ended` at 4.62 seconds of 4.62 seconds, retained its exact position through a pause longer than 30 seconds, resumed to completion, and aborted a request stopped before audio arrived. Audio was muted.
- Independent source review identified cross-tab controls, speed clamping, pending previews, asynchronous pause/resume bugs, and audio left playing after a blocked-page selection. Fixes have regression coverage.

## Release checks still needed

Load the unpacked extension in Chrome with a real restricted ElevenLabs key. The available automated browser could exercise local fixtures but could not load the unpacked extension. No real secret or paid generation was used during this work.

Before publishing, check these behaviors:

1. Create a restricted key with `text_to_speech`, `voices_read`, and `models_read`, without `user_read`. Connect and read a short passage.
2. Listen to its final word. Try both an available recent model and an older model in your account.
3. Pause for more than 30 seconds and resume. Confirm the real offscreen document persists while paused and closes after Stop or completion.
4. Stop while a response is loading, then start another reading. Repeat across two tabs.
5. Try the selection button, right-click selection, and shortcuts on an ordinary article and a site with restrictive content security policy. Browser internal pages remain unsupported.
6. Disable Voices permission and retry a refresh. Confirm the error names Voices read and preserves preferences. Repeat for Models and Text to Speech.
7. Confirm the upgrade retains an existing user's key, voice, and speed. Reload already-open pages after the update.

These are pending release checks, not claimed passes. The packaged ZIP and pull request do not publish a Chrome Web Store update.

## Design choices

The extension remains vanilla JavaScript with no build dependencies. A single extension-owned player avoids authenticated fetch and audio in the host page. The offscreen document declares audio playback and object URL ownership. Explicit idle cleanup releases it after reading, while paused audio can retain its MediaSource URL. [Chrome documents both reasons](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

Model the Domain shaped the per-reading session and catalog objects. Laziness Protocol kept the extension free of a framework and build pipeline. Prove It Works shaped the reproduction and browser checks, including the explicit limits above. Parallel implementation used separate file ownership. The review used OpenAI models; no cross-family review was available.
