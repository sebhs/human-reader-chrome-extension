# Human Reader

Read selected text aloud with voices from your ElevenLabs account. Human Reader is an independent, free browser extension. ElevenLabs API usage draws from your own account credits.

[Chrome Web Store](https://chromewebstore.google.com/detail/human-reader-powered-by-e/klohmfhfijipahknljjelpfgjpmandmg)

## Connect your account

1. Open [ElevenLabs → Developers → API Keys](https://elevenlabs.io/app/developers/api-keys).
2. Create a key for Human Reader. Keep **Restrict Key** enabled.
3. Give **Text to Speech** access, **Voices** read access, and **Models** read access. You do not need User access or any write permission.
4. Copy the full secret key when ElevenLabs shows it. The key's name and **Copy Key ID** value are not the secret.
5. Open Human Reader, paste the key, and click **Connect**.

Connecting checks voice and model access without generating speech. Text to Speech permission and available credits are checked when you choose to read. You can set a credit cap on the key in ElevenLabs.

If the secret is no longer visible, create a new key. Do not remove restrictions or grant every permission to fix a connection error. The extension names the access it needs.

## Read a passage

Select text on a normal webpage, then click **Read aloud**, choose **Read selection with Human Reader** in the right-click menu, or open the popup and click **Read selection**.

The page shows Pause, Resume, and Stop while reading. Stop cancels the network request, although ElevenLabs may still charge for work already generated. Starting another passage stops the previous reading. You can also stop audio from the popup after leaving the original page.

Use the popup to search voices by name, language, or accent. **Preview** plays the voice's existing sample without generating new speech. Add voices to your account in ElevenLabs, then click **Refresh**. Models come from ElevenLabs' current API, so new text-to-speech models appear without an extension update. Availability can depend on your account and voice.

Speed changes apply to current playback. Hide the floating selection button in settings if you prefer the context menu or keyboard shortcut.

The suggested shortcuts are **Alt+Shift+R** to read and **Alt+Shift+S** to stop. Open **Keyboard shortcuts** in the popup to change them. Chrome can leave a shortcut unassigned if another extension uses it. Human Reader no longer intercepts Ctrl+H or Cmd+H.

## Resolve a problem

- **Missing permission:** edit the key in ElevenLabs and enable the specific access named by the error.
- **Rejected key:** paste the secret rather than its name or ID. Check that the key has not expired or been revoked.
- **Denied access:** check endpoint permissions, key IP restrictions, and account access.
- **Credit limit:** check your account balance and the key's own credit cap.
- **Voice missing:** add the voice to your ElevenLabs account, refresh, and select it again.
- **Long selection:** select a shorter passage. Human Reader uses the selected model's reported limit and never silently truncates your text.
- **Unsupported page:** Chrome blocks extensions on internal pages and the Chrome Web Store. Browser PDF viewers, Google Docs canvas text, and some embedded editors do not expose ordinary text selections. Copy the passage to a normal webpage or select accessible page text.
- **New install or update:** reload an already-open webpage before trying its reading controls.

Temporary API failures do not erase your key or preferences. **Disconnect** removes the saved key and cached catalogs from this device. It does not revoke the key in ElevenLabs.

## Install the development version

Requires Chrome 116 or newer, or a Chromium browser with the same extension APIs.

1. Clone this repository or extract the extension ZIP.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Pin Human Reader, open its popup, and connect your key.
5. Reload the webpage you want to read.

No build or package installation is required. The `tests` and `scripts` folders are for development and are excluded from the release ZIP.

## Verify changes

With Node.js 20 or newer:

```sh
npm test
npm run check
npm run preview
```

Open the preview's local URL for a popup fixture. Use `?scenario=empty` for an empty voice library. The fixture accepts `fixture-secret`, reports a permission error for `missing-voices`, and simulates a connection failure for `offline`. Do not enter real keys in the fixture.

Open `/tests/player.html` on that server for the production streaming player and selection controls with simulated Chrome APIs and a muted bundled MP3. This checks actual browser decoding, selection, pause, stop, and completion without spending credits. It does not replace an unpacked-extension smoke test with your account.

See [verification notes](docs/verification.md) and [reviewed feedback](docs/feedback.md).

## Privacy and maintenance

The secret is stored in local extension storage, not Chrome Sync. Storage is restricted to trusted extension contexts. Content scripts do not receive the key. The extension sends selected text directly to ElevenLabs only when you start reading. Preview audio goes to the URL supplied by ElevenLabs without the key. There is no developer server, telemetry, or remote font.

Local extension storage is not an encrypted secret vault. Your browser profile and other software with access to that profile may expose its contents. ElevenLabs processes submitted text under its own terms and privacy policy.

`api.js` owns ElevenLabs requests and errors. `popup.js` owns settings and catalogs. `background.js` routes commands and manages the audio document. `player.js` owns one cancellable stream. `content.js` only captures selections and displays controls. There is no framework or bundler.

## Version 2.0

- Restricted-key setup with exact permission guidance.
- Searchable voices, sample previews, and dynamic models.
- Reliable streaming, cancellation, complete endings, and pause/resume.
- Configurable shortcuts, persistent playback controls, and saved-setting migration.

[MIT license](LICENSE)

### Typography and colors

Inter is bundled locally under the SIL Open Font License in `fonts/OFL.txt`. The interface uses the neutral and blue palette from [telli’s brand kit](https://www.telli.com/brand-kit). Human Reader is independent of telli.
