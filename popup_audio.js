// popup_audio.js
// Spiller av lyd i extension-popup for å omgå CSP-restriksjoner på enkelte sider

// Lytt etter meldinger fra content-script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "playAudioBlob" && message.audioUrl) {
    try {
      // Hent lyd som ArrayBuffer
      const response = await fetch(message.audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      // Opprett AudioContext og dekod lyden
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      // Spill av
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start();
      sendResponse({ played: true });
    } catch (e) {
      console.error("Kunne ikke spille av lyd via Web Audio API", e);
      sendResponse({ played: false });
    }
  }
});
