document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["apiKey", "voiceId", "mode"], (result) => {
    const apiKey = result.apiKey ? result.apiKey : "";
    document.getElementById("apiKey").value = apiKey;

    const voiceId = result.voiceId ? result.voiceId : "21m00Tcm4TlvDq8ikWAM";
    document.getElementById("voiceId").value = voiceId;
    chrome.storage.local.set({ voiceId: voiceId });

    const mode = result.mode ? result.mode : "englishfast";
    document.getElementById("mode").value = mode;
    chrome.storage.local.set({ mode: mode });
  });
});

function setStorageItem(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, function () {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

const readLocalStorage = async (keys) => {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, function (result) {
      resolve(result);
    });
  });
};

const populateVoices = async () => {
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

const select = document.getElementById("voices");

select.addEventListener("change", async (event) => {
  const selectedVoiceId = event.target.value;
  await chrome.storage.local.set({ voiceId: selectedVoiceId });
});

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
        populateVoices();
      }
    }
  }
};

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

document.getElementById("mode").addEventListener("change", () => {
  const mode = document.getElementById("mode").value;
  chrome.storage.local.set({ mode: mode });
});

//call each time popup is opened
populateVoices();
