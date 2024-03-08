const codec = "audio/mpeg";
const maxBufferDuration = 90;
let streamingCompleted = true;
const mediaSource = new MediaSource();
const audioElement = new Audio();

const ttsButton = document.createElement("img");
ttsButton.id = "ttsButton";
ttsButton.alt = "Text to speech button";
ttsButton.setAttribute("role", "button");
ttsButton.src = chrome.runtime.getURL("images/play.svg");
ttsButton.style.display = "none";
document.body.appendChild(ttsButton);

let buttonState = "play";
const setButtonState = (state) => {
  if (state === "loading") {
    buttonState = "loading";
    ttsButton.src = chrome.runtime.getURL("images/spinner.svg");
    ttsButton.disabled = true;
  } else if (state === "play") {
    buttonState = "play";
    ttsButton.src = chrome.runtime.getURL("images/play.svg");
    ttsButton.disabled = false;
    audioElement.pause();
  } else if (state === "speak") {
    buttonState = "speak";
    ttsButton.src = chrome.runtime.getURL("images/speak.svg");
    ttsButton.disabled = true;
  }
};

let textToPlay = "";
const setTextToPlay = (text) => {
  textToPlay = text;
};

const readStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, function (result) {
      resolve(result);
    });
  });
};

const fetchResponse = async () => {
  const storage = await readStorage(["apiKey", "selectedVoiceId", "mode"]);
  const selectedVoiceId = storage.selectedVoiceId
    ? storage.selectedVoiceId
    : "21m00Tcm4TlvDq8ikWAM"; //fallback Voice ID
  const mode = storage.mode ? storage.mode : "englishfast";
  const model_id =
    mode === "multilingual" ? "eleven_multilingual_v2" : "eleven_turbo_v2";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream`,
    {
      method: "POST",
      headers: {
        Accept: codec,
        "xi-api-key": storage.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_id: model_id,
        text: textToPlay,
        voice_settings: {
          similarity_boost: 0.5,
          stability: 0.5,
        },
      }),
    }
  );
  return response;
};

const handleMissingApiKey = () => {
  setButtonState("speak");
  const audio = new Audio(chrome.runtime.getURL("media/error-no-api-key.mp3"));
  audio.play();
  //since alert() is blocking, timeout is needed so audio plays while alert is visible.
  setTimeout(() => {
    alert(
      "Please set your Elevenlabs API key in the extension settings to use Human Reader."
    );
    chrome.storage.local.clear();
    setButtonState("play");
  }, 100);
};
let sourceOpenEventAdded = false;
const streamAudio = async () => {
  const storage = await readStorage(["apiKey", "speed"]);
  if (!storage.apiKey) {
    handleMissingApiKey();
    return;
  }
  streamingCompleted = false;
  audioElement.src = URL.createObjectURL(mediaSource);
  const playbackRate = storage.speed ? storage.speed : 1;
  audioElement.playbackRate = playbackRate;
  audioElement.play();
  if (!sourceOpenEventAdded) {
    sourceOpenEventAdded = true;
    mediaSource.addEventListener("sourceopen", () => {
      const sourceBuffer = mediaSource.addSourceBuffer(codec);

      let isAppending = false;
      let appendQueue = [];

      const processAppendQueue = () => {
        if (!isAppending && appendQueue.length > 0) {
          isAppending = true;
          const chunk = appendQueue.shift();
          chunk && sourceBuffer.appendBuffer(chunk);
        }
      };

      sourceBuffer.addEventListener("updateend", () => {
        isAppending = false;
        processAppendQueue();
      });

      const appendChunk = (chunk) => {
        setButtonState("speak");
        appendQueue.push(chunk);
        processAppendQueue();

        while (
          mediaSource.duration - mediaSource.currentTime >
          maxBufferDuration
        ) {
          const removeEnd = mediaSource.currentTime - maxBufferDuration;
          sourceBuffer.remove(0, removeEnd);
        }
      };

      const fetchAndAppendChunks = async () => {
        try {
          const response = await fetchResponse();

          if (response.status === 401) {
            alert("Unauthorized. Please set your API key.");
            chrome.storage.local.clear();
            setButtonState("play");
            return;
          }

          if (!response.body) {
            const errorMessage = "Error fetching audio, please try again";
            alert(errorMessage);
            console.error(errorMessage);
            setButtonState("play");
            return;
          }

          const reader = response.body.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Signal the end of the stream
              streamingCompleted = true;
              break;
            }

            appendChunk(value.buffer);
          }
        } catch (error) {
          setButtonState("play");
          console.error("Error fetching and appending chunks:", error);
        }
      };
      fetchAndAppendChunks();
    });
  }
};

async function onClickTtsButton() {
  if (buttonState === "loading" || buttonState === "speak") {
    return;
  }
  setButtonState("loading");
  try {
    setTextToPlay(window.getSelection().toString());
    await streamAudio();
  } catch (error) {
    console.error(error);
    setButtonState("play");
  }
}

audioElement.addEventListener("timeupdate", () => {
  // This is a hacky way to deterimne that the audio has ended. I couldn't find a better way to do it.
  // If you have an idea, please let me know.
  const playbackEndThreshold = 0.5;
  if (streamingCompleted) {
    const bufferEndTime = audioElement.buffered.end(
      audioElement.buffered.length - 1
    );
    const timeLeft = bufferEndTime - audioElement.currentTime;

    if (timeLeft <= playbackEndThreshold) {
      setButtonState("play");
    }
  }
});

document.addEventListener("selectionchange", function () {
  const selection = window.getSelection();
  if (!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    ttsButton.style.left = window.scrollX + lastRect.right + "px";
    ttsButton.style.top = window.scrollY + lastRect.bottom + "px";
    ttsButton.style.display = "block";
  } else {
    ttsButton.style.display = "none";
  }
  ttsButton.onclick = onClickTtsButton;
});

ttsButton.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    onClickTtsButton();
  }
});

// Receive sent message from background worker and trigger readOutLoud action
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "readOutLoud") {
    onClickTtsButton();
  }
  return true
});