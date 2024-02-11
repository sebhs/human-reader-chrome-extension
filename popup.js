const setStorageItem = async (key, value) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
};

const readLocalStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, function (result) {
      resolve(result);
    });
  });
};

const populateVoices = async () => {
  alert("populateVoices");
  const storage = await readLocalStorage(["voices", "voiceId"]);
  const voices = storage.voices;
  if (voices) {
    const select = document.getElementById("voices");

    select.innerHTML = ""; // Clear existing options

    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.text = voice.name;
      select.appendChild(option);
    });
    const selectedVoiceId = storage.voiceId;
    if (selectedVoiceId) select.value = selectedVoiceId;
  }
};

const fetchVoices = async () => {
  const storage = await readLocalStorage(["apiKey", "voiceId", "mode"]);
  if (storage.apiKey) {
    let response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": storage.apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
    } else {
      response = await response.json();
      if (response.voices) {
        const voices = response.voices.map((voice) => {
          return {
            id: voice.voice_id,
            name: voice.name,
          };
        });
        await setStorageItem("voices", voices);
        await populateVoices();
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  populateVoices();
  const storage = await readLocalStorage([
    "apiKey",
    "voiceId",
    "mode",
    "voices",
  ]);
  if (storage.apiKey) document.getElementById("apiKey").value = apiKey;
  if (storage.voiceId) {
    document.getElementById("voiceId").value = voiceId;
  } else if (storage.voices) {
    document.getElementById("voiceId").value = storage.voices[0].id;
    await setStorageItem("voiceId", storage.voices[0].id);
  }

  if (storage.mode) {
    document.getElementById("mode").value = storage.mode;
  } else {
    const defaultMode = "englishfast";
    document.getElementById("mode").value = defaultMode;
    await setStorageItem("mode", defaultMode);
  }
});

const select = document.getElementById("voices");
select.addEventListener("change", async (event) => {
  const selectedVoiceId = event.target.value;
  await setStorageItem("voiceId", selectedVoiceId);
});

document.getElementById("syncVoices").addEventListener("click", async () => {
  const button = document.getElementById("syncVoices");
  await fetchVoices();
  button.innerHTML = "&#10003;"; //checkmark
  setTimeout(function () {
    button.textContent = "Sync";
  }, 1000);
});

document.getElementById("setApiKey").addEventListener("click", async () => {
  const inputValue = document.getElementById("apiKey").value;
  const button = document.getElementById("setApiKey");
  await setStorageItem("apiKey", inputValue);
  button.innerHTML = "&#10003;"; //checkmark
  setTimeout(function () {
    button.textContent = "Set";
  }, 1000);
  fetchVoices();
});

document.getElementById("mode").addEventListener("change", async () => {
  const mode = document.getElementById("mode").value;
  await setStorageItem("mode", mode);
});
