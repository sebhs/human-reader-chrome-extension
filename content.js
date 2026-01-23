const codec = "audio/mpeg";
let streamingCompleted = true;
let isStopped = false;

// Helper to send messages to offscreen document via background
const sendToOffscreen = (data) => {
  return chrome.runtime.sendMessage({ target: "offscreen", data });
};
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
    sendToOffscreen({ action: "pauseAudio" });
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

const fetchResponse = async () => {
  const storage = await readStorage([
    "apiKey", "selectedVoiceId", "mode", "provider", 
    "openaiApiKey", "openaiVoice", "openaiModel"
  ]);
  const provider = storage.provider || "elevenlabs";

  if (provider === "openai") {
    return fetchOpenAIResponse(storage);
  } else {
    return fetchElevenLabsResponse(storage);
  }
};

const fetchOpenAIResponse = async (storage) => {
  const voice = storage.openaiVoice || "alloy";
  const model = storage.openaiModel || "gpt-4o-mini-tts";
  
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${storage.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model,
      input: textToPlay,
      voice: voice,
      response_format: "mp3",
    }),
  });
  return response;
};

const fetchElevenLabsResponse = async (storage) => {
  const selectedVoiceId = storage.selectedVoiceId || "21m00Tcm4TlvDq8ikWAM";
  const mode = storage.mode || "eleven_turbo_v2_5";
  
  // Normalize model_id
      const model_id =
    (mode === "eleven_v3_(alpha)" || mode === "eleven_v3") ? "eleven_v3" :
    (mode === "eleven_multilingual_v2" || mode === "eleven_multilingual_v2") ? "eleven_multilingual_v2" :
    (mode === "eleven_flash_v2.5" || mode === "eleven_flash_v2_5") ? "eleven_flash_v2_5" :
    (mode === "eleven_turbo_v2.5" || mode === "eleven_turbo_v2_5") ? "eleven_turbo_v2_5" :
    (mode === "eleven_turbo_v2" || mode === "eleven_turbo_v2") ? "eleven_turbo_v2" :
    (mode === "eleven_flash_v2" || mode === "eleven_flash_v2") ? "eleven_flash_v2" :
    (mode === "eleven_english_v1" || mode === "eleven_monolingual_v1") ? "eleven_monolingual_v1" :
    "eleven_multilingual_v1"; // default
    (mode === "eleven_multilingual_v2" || mode === "eleven_multilingual_v2") ? "eleven_multilingual_v2" :
    (mode === "eleven_flash_v2.5" || mode === "eleven_flash_v2_5") ? "eleven_flash_v2_5" :
    (mode === "eleven_turbo_v2.5" || mode === "eleven_turbo_v2_5") ? "eleven_turbo_v2_5" :
    (mode === "eleven_turbo_v2" || mode === "eleven_turbo_v2") ? "eleven_turbo_v2" :
    (mode === "eleven_flash_v2" || mode === "eleven_flash_v2") ? "eleven_flash_v2" :
    (mode === "eleven_multilingual_v1" || mode === "eleven_multilingual_v1") ? "eleven_multilingual_v1" :
    "eleven_monolingual_v1"; // default
    mode.includes("multilingual_v2") ? "eleven_multilingual_v2" :
    mode.includes("flash_v2_5") || mode.includes("flash_v2.5") ? "eleven_flash_v2_5" :
    mode.includes("turbo_v2_5") || mode.includes("turbo_v2.5") ? "eleven_turbo_v2_5" :
    mode.includes("turbo_v2") ? "eleven_turbo_v2" :
    mode.includes("flash_v2") ? "eleven_flash_v2" :
    mode.includes("monolingual") || mode.includes("english_v1") ? "eleven_monolingual_v1" :
    mode.includes("multilingual_v1") ? "eleven_multilingual_v1" :
    "eleven_turbo_v2_5";

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


const handleMissingApiKey = async () => {
  const storage = await readStorage(["provider"]);
  const provider = storage.provider || "elevenlabs";
  const providerName = provider === "openai" ? "OpenAI" : "ElevenLabs";
  
  setButtonState("speak");
  const audio = new Audio(chrome.runtime.getURL("media/error-no-api-key.mp3"));
  audio.play();
  //since alert() is blocking, timeout is needed so audio plays while alert is visible.
  setTimeout(() => {
    alert(
      `Please set your ${providerName} API key in the extension settings to use Human Reader.`
    );
    setButtonState("play");
  }, 100);
};

const stopAudio = () => {
  isStopped = true;
  streamingCompleted = true;
  sendToOffscreen({ action: "stopAudio" });
  setButtonState("play");
};

const streamAudio = async () => {
  const storage = await readStorage(["apiKey", "speed", "provider", "openaiApiKey"]);
  const provider = storage.provider || "elevenlabs";
  const hasApiKey = provider === "openai" ? storage.openaiApiKey : storage.apiKey;
  
  if (!hasApiKey) {
    handleMissingApiKey();
    return;
  }
  
  isStopped = false;
  streamingCompleted = false;
  const playbackRate = storage.speed ? storage.speed : 1;
  
  // Initialize offscreen audio
  await sendToOffscreen({ action: "initAudio" });
  
  try {
    const response = await fetchResponse();

    if (response.status === 401) {
      const errorBody = await response.json();
      const errorStatus = errorBody.detail?.status;
      if (errorStatus === "detected_unusual_activity" || errorStatus === "quota_exceeded") {
        alert(`MESSAGE FROM ELEVENLABS: ${errorBody.detail.message}`);
      } else {
        alert("Unauthorized. Please set your API key again.");
      }
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
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        streamingCompleted = true;
        sendToOffscreen({ action: "streamComplete" });
        break;
      }
      
      if (isStopped) break;

      // Send chunk to offscreen document (convert to array for messaging)
      sendToOffscreen({ action: "appendAudio", chunk: Array.from(value) });
      
      if (firstChunk) {
        firstChunk = false;
        setButtonState("speak");
        sendToOffscreen({ action: "playAudio", speed: playbackRate });
      }
    }
  } catch (error) {
    setButtonState("play");
    console.error("Error fetching and appending chunks:", error);
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

// Listen for playback ended message from offscreen
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "playbackEnded") {
    setButtonState("play");
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
});

document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "h") {
    onClickTtsButton();
  }
});