# Feedback addressed in version 2.0

Reviewed the [Chrome Web Store reviews](https://chromewebstore.google.com/detail/human-reader-powered-by-e/klohmfhfijipahknljjelpfgjpmandmg/reviews) on 2026-10-10. The page showed 3.5 stars across 58 ratings. The following are paraphrases of visible reviews, not inferred requests.

| Feedback | Evidence | Change |
| --- | --- | --- |
| Valid keys rejected, setup unclear | Kamil, Jan 29 2026; Jeremy, Sep 20 2025; Rex, Jul 8 2025; multiple similar reports | Removed the unrelated `/v1/user` gate. Added exact restricted-key instructions and separate permission, credential, quota, and network errors. |
| Workaround requires broad permissions | Sanjay, Nov 22 2025; Sandro, Aug 9 2025 | Only Text to Speech, Voices read, and Models read are needed. Do not copy advice to enable every permission. |
| Ctrl+H conflicts with browser history; shortcut cannot be changed | Jonathan, Aug 19 2025; Ali, Jul 19 2025; Yarden, Mar 27 2025; Wesley, Feb 19 2025 | Registered configurable Chrome commands and removed the page key listener. |
| Voice/model choices fail to take effect | Maria, Aug 5 2025 | Persist the actual API model ID. Refresh available catalogs and keep unavailable saved choices visible. |
| Playback controls are missing | David, May 15 2025 | Added persistent page controls and popup Stop/Pause/Resume. |
| Speech endings are cut short | André, Feb 16 2025 | Removed the half-second early-stop heuristic. Drain the stream and wait for the audio ended event. |
| Unstable behavior or failures on particular sites | K X, Mar 22 2026; Jack, Jul 15 2025; Gamma, Jun 22 2025; Hunter, Jun 9 2025 | Moved authenticated requests and audio out of content scripts. Isolated controls with Shadow DOM. Site-specific behavior still needs the unpacked-browser release pass. |
| Costs and affiliation are unclear | Jonathan, Aug 19 2025; Yonatan, Aug 14 2025 | Say that the extension is independent and free, and reading uses the user's ElevenLabs credits. |
| Google Docs does not work | Wesley, Feb 19 2025 | Document the limitation of canvas editors instead of claiming support for every page. |

Mobile support, additional providers, forced copying on restrictive websites, and word-by-word highlighting remain outside this refresh. The extension keeps its original selection-to-speech purpose.

## Official API references

- [API key creation and restrictions](https://help.elevenlabs.io/hc/en-us/articles/14599447207697-How-do-I-authorize-myself-using-an-API-key)
- [Authentication](https://elevenlabs.io/docs/api-reference/authentication)
- [Voice search and pagination](https://elevenlabs.io/docs/api-reference/voices/search)
- [Model discovery](https://elevenlabs.io/docs/api-reference/models/list)
- [Current models](https://elevenlabs.io/docs/overview/models)
- [Public OpenAPI schema](https://api.elevenlabs.io/openapi.json)

The schema defines `text_to_speech`, `voices_read`, and `models_read` separately from `user_read`. Model discovery supplies `maximum_text_length_per_request`. Speech requests omit optional voice settings so server defaults can accommodate different model families.
