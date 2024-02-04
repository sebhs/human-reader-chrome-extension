chrome.runtime.onInstalled.addListener(function () {
  const apiKey = window.prompt(
    "Paste your Elevenlabs API key to use this service. If you don't have one, go to elevenlabs.io to get one.\n\nPaste the API key at your own risk. You can check out the source code on my Github @sebhs."
  );
  if (apiKey) localStorage.setItem("apiKey", apiKey);
  const voiceId = window.prompt(
    "Enter the voice ID of the voice you want to use to read text. You can find your voice IDs in your Elevenlabs account."
  );
  if (voiceId) localStorage.setItem("voiceId", voiceId);
});

function setPlaying() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "playing" });
  });
}

function setStopPlaying() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "stopPlaying" });
  });
}

let audio = null;

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "speak") {
    // If audio is already playing, stop it
    if (audio) {
      audio.pause();
      audio = null;
      setStopPlaying();
      return;
    }
    const api_key = localStorage.getItem("apiKey");
    const voice_id = localStorage.getItem("voiceId");
    const multiLingual = true;
    const model_id = multiLingual
      ? "eleven_multilingual_v2"
      : "eleven_turbo_v2";
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: model_id,
        text: request.text,
        voice_settings: {
          similarity_boost: 0.5,
          stability: 0.5,
        },
      }),
    })
      .then((response) => {
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        audio = new Audio(url);
        audio.play();
        setPlaying();

        audio.onended = function () {
          audio = null;
          setStopPlaying();
        };
      })
      .catch((error) => {
        console.error(error);
        setStopPlaying();
      });
    return true;
  }
});
