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
    ttsButton.src = chrome.runtime.getURL("images/stop.svg");
    ttsButton.disabled = false;
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

// Resolve the active provider (defaults to ElevenLabs) from storage.
const getActiveProvider = async () => {
  const { provider } = await readStorage(["provider"]);
  const id = provider && PROVIDERS[provider] ? provider : DEFAULT_PROVIDER;
  return PROVIDERS[id];
};

// Decode a base64 audio chunk (used by the 60db NDJSON stream) into bytes.
const base64ToUint8Array = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

// Remove only the given provider's credentials/cache, leaving the other intact.
const clearProviderData = (providerId) => {
  return new Promise((resolve) => {
    chrome.storage.local.remove(
      [
        pkey(providerId, "apiKey"),
        pkey(providerId, "voices"),
        pkey(providerId, "selectedVoiceId"),
      ],
      resolve
    );
  });
};

const fetchResponse = async () => {
  const provider = await getActiveProvider();
  const storage = await readStorage([
    pkey(provider.id, "apiKey"),
    pkey(provider.id, "selectedVoiceId"),
    pkey(provider.id, "mode"),
  ]);
  const selectedVoiceId =
    storage[pkey(provider.id, "selectedVoiceId")] || provider.fallbackVoiceId;
  const mode = storage[pkey(provider.id, "mode")];

  const request = provider.buildTtsRequest({
    voiceId: selectedVoiceId,
    text: textToPlay,
    mode: mode,
  });

  const response = await fetch(request.url, {
    method: "POST",
    headers: {
      ...provider.authHeaders(storage[pkey(provider.id, "apiKey")]),
      ...request.headers,
    },
    body: JSON.stringify(request.body),
  });
  return { response, provider };
};

// Handle a 401 from either provider: surface ElevenLabs' detail messages when
// present, otherwise treat it as a bad key and drop that provider's credentials.
const handleUnauthorized = async (response, provider) => {
  let detail;
  try {
    detail = (await response.json()).detail;
  } catch (e) {
    detail = undefined;
  }
  if (
    detail &&
    (detail.status === "detected_unusual_activity" ||
      detail.status === "quota_exceeded")
  ) {
    alert(`MESSAGE FROM ${provider.label.toUpperCase()}: ${detail.message}`);
  } else {
    alert("Unauthorized. Please set your API key again.");
    await clearProviderData(provider.id);
  }
  setButtonState("play");
};

const handleMissingApiKey = (providerId) => {
  setButtonState("speak");
  const audio = new Audio(chrome.runtime.getURL("media/error-no-api-key.mp3"));
  audio.play();
  //since alert() is blocking, timeout is needed so audio plays while alert is visible.
  setTimeout(() => {
    alert(
      "Please set your API key in the extension settings to use Human Reader."
    );
    if (providerId) clearProviderData(providerId);
    setButtonState("play");
  }, 100);
};

const clearBuffer = () => {
  if (mediaSource.readyState === "open") {
    const sourceBuffers = mediaSource.sourceBuffers;
    for (let i = 0; i < sourceBuffers.length; i++) {
      sourceBuffers[i].abort();
      mediaSource.removeSourceBuffer(sourceBuffers[i]);
    }
  }
  audioElement.pause();
  audioElement.src = "";
  streamingCompleted = true;
};

const stopAudio = () => {
  isStopped = true;
  clearBuffer();
  setButtonState("play");
};

let sourceOpenEventAdded = false;
const streamAudio = async () => {
  const provider = await getActiveProvider();
  const storage = await readStorage([pkey(provider.id, "apiKey"), "speed"]);
  if (!storage[pkey(provider.id, "apiKey")]) {
    handleMissingApiKey(provider.id);
    return;
  }
  isStopped = false;
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
          if (chunk && mediaSource.sourceBuffers.length > 0) {
            sourceBuffer.appendBuffer(chunk);
          } else {
            isAppending = false;
          }
        }
      };

      sourceBuffer.addEventListener("updateend", () => {
        isAppending = false;
        processAppendQueue();
      });

      const appendChunk = (chunk) => {
        if (isStopped) return;

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

      // Parse one frame of a 60db NDJSON stream and queue any audio it carries.
      const handleNdjsonLine = (line) => {
        let message;
        try {
          message = JSON.parse(line);
        } catch (e) {
          return;
        }
        if (message.type === "chunk") {
          const audioContent = message.result && message.result.audioContent;
          if (audioContent) {
            appendChunk(base64ToUint8Array(audioContent).buffer);
          }
        } else if (message.type === "complete") {
          streamingCompleted = true;
        } else if (message.type === "error") {
          console.error("60db stream error:", message);
          alert(
            `Error from 60db: ${
              message.message || message.error || "synthesis failed"
            }`
          );
          setButtonState("play");
        }
      };

      const fetchAndAppendChunks = async () => {
        try {
          const { response, provider } = await fetchResponse();

          if (response.status === 401) {
            await handleUnauthorized(response, provider);
            return;
          }

          if (!response.ok || !response.body) {
            const errorMessage = "Error fetching audio, please try again";
            alert(errorMessage);
            console.error(errorMessage);
            setButtonState("play");
            return;
          }

          const reader = response.body.getReader();

          if (provider.streamFormat === "ndjson") {
            // 60db: newline-delimited JSON frames wrapping base64 audio.
            const decoder = new TextDecoder();
            let textBuffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                streamingCompleted = true;
                break;
              }
              textBuffer += decoder.decode(value, { stream: true });
              let newlineIndex;
              while ((newlineIndex = textBuffer.indexOf("\n")) >= 0) {
                const line = textBuffer.slice(0, newlineIndex).trim();
                textBuffer = textBuffer.slice(newlineIndex + 1);
                if (line) handleNdjsonLine(line);
              }
            }
          } else {
            // ElevenLabs: raw binary MP3 frames.
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Signal the end of the stream
                streamingCompleted = true;
                break;
              }
              appendChunk(value.buffer);
            }
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
    stopAudio();
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
    if (audioElement.buffered.length > 0) {
      const bufferEndTime = audioElement.buffered.end(audioElement.buffered.length - 1);
      const timeLeft = bufferEndTime - audioElement.currentTime;

      if (timeLeft <= playbackEndThreshold) {
        setButtonState("play");
      }
    }
  }
});

document.addEventListener("selectionchange", function () {
  const selection = window.getSelection();

  if (!selection.anchorNode || !selection.focusNode) {
    return;
  }

  // Detect if input element was selected
  if (selection.anchorNode.tagName === "FORM" || selection.focusNode.tagName === "INPUT") {
    return;
  }
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

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "h") {
    onClickTtsButton();
  }
});