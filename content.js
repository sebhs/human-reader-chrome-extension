const speakButton = document.createElement("img");
speakButton.id = "speakButton";
speakButton.alt = "Speak button";
speakButton.setAttribute("role", "button");
speakButton.src = chrome.runtime.getURL("images/play.svg");
speakButton.style.display = "none";
document.body.appendChild(speakButton);

const setButtonSpinning = () => {
  speakButton.src = chrome.runtime.getURL("images/spinner.svg");
  speakButton.disabled = true;
};

const setButtonPlay = () => {
  speakButton.src = chrome.runtime.getURL("images/play.svg");
  speakButton.disabled = false;
};

const setButtonStop = () => {
  speakButton.src = chrome.runtime.getURL("images/stop.svg");
  speakButton.disabled = false;
};

let audio = null;

const readLocalStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, function (result) {
      resolve(result);
    });
  });
};

const fetchAudio = async (text) => {
  const storage = await readLocalStorage(["apiKey", "selectedVoiceId", "mode"]);
  if (!storage.apiKey) {
    alert(
      "Please set your elevenlabs API key in the extension settings. If you don't have one, go to elevenlabs.io to get one."
    );
    setButtonPlay();
  } else {
    //FIXME: handle the defaults in content.js
    const selectedVoiceId = storage.selectedVoiceId
      ? storage.selectedVoiceId
      : "21m00Tcm4TlvDq8ikWAM";
    const mode = storage.mode ? storage.mode : "englishfast";
    const model_id =
      mode === "multilingual" ? "eleven_multilingual_v2" : "eleven_turbo_v2";
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": storage.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: model_id,
          text: text,
          voice_settings: {
            similarity_boost: 0.5,
            stability: 0.5,
          },
        }),
      }
    );
    return response;
  }
};

async function onClickSpeakButton() {
  setButtonSpinning();

  // If audio is already playing, stop it
  if (audio) {
    audio.pause();
    audio = null;
    setButtonPlay();
    return;
  }
  try {
    const response = await fetchAudio(window.getSelection().toString());
    if (response.status && response.status === 200) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      audio.play();
      setButtonStop();
      audio.onended = function () {
        audio = null;
        setButtonPlay();
      };
    } else if (response.status === 401) {
      alert("Unauthorized. Please check your API key.");
      setButtonPlay();
    } else {
      alert("Error fetching audio. Check console.");
      setButtonPlay();
    }
  } catch (error) {
    console.error(error);
    setButtonPlay();
  }
}

document.addEventListener("selectionchange", function () {
  const selection = window.getSelection();
  if (!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    speakButton.style.left = window.scrollX + lastRect.right + "px";
    speakButton.style.top = window.scrollY + lastRect.bottom + "px";
    speakButton.style.display = "block";
  } else {
    speakButton.style.display = "none";
  }
  speakButton.onclick = onClickSpeakButton;
});

speakButton.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    onClickSpeakButton();
  }
});
