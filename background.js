chrome.runtime.onInstalled.addListener(function () {
  const apiKey = window.prompt(
    "Paste your Elevenlabs API key to use this service. If you don't have one, go to elevenlabs.io to get one.\n\nPaste the API key at your own risk. You can check out the source code on my Github @sebhs."
  );
  if (apiKey) localStorage.setItem("apiKey", apiKey);
  if (!localStorage.getItem("voiceId"))
    localStorage.setItem("voiceId", "21m00Tcm4TlvDq8ikWAM");
  if (!localStorage.getItem("mode"))
    localStorage.setItem("mode", "englishfast");
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

function handleNoAPIKey() {
  alert(
    "Please set your API key in the extension options. If you don't have one, go to elevenlabs.io to get one."
  );
  setStopPlaying();
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
    if (!localStorage.getItem("apiKey")) {
      handleNoAPIKey();
    } else {
      const api_key = localStorage.getItem("apiKey");
      const voiceId = localStorage.getItem("voiceId")
        ? localStorage.getItem("voiceId")
        : "21m00Tcm4TlvDq8ikWAM";
      const model_id =
        localStorage.getItem("mode") === "multilingual"
          ? "eleven_multilingual_v2"
          : "eleven_turbo_v2";
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
  }
});
