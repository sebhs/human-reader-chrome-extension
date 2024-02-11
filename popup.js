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

const setWelcomeScreen = () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  settings.style.display = "none";
  welcome.style.display = "block";
};

const setSettingsScreen = () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  settings.style.display = "block";
  welcome.style.display = "none";
};

const renderSettings = async (storage) => {
  if (!storage)
    storage = await readLocalStorage([
      "apiKey",
      "selectedVoiceId",
      "mode",
      "voices",
    ]);
  setSettingsScreen();
  if (!storage.apiKey) {
    setWelcomeScreen();
    chrome.storage.local.clear();
    return;
  }
  if (!storage.selectedVoiceId || !storage.voices) {
    await fetchVoices();
    await setStorageItem("selectedVoiceId", storage.voices[0].id);
    document.getElementById("selectedVoiceId").value = storage.voices[0].id;
  }
  if (!storage.mode) {
    const defaultMode = "englishfast";
    document.getElementById("mode").value = defaultMode;
    await setStorageItem("mode", defaultMode);
  }
  document.getElementById("mode").value = storage.mode;
};

const populateVoices = async () => {
  const storage = await readLocalStorage(["voices", "selectedVoiceId"]);
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
    const selectedVoiceId = storage.selectedVoiceId;
    if (selectedVoiceId) select.value = selectedVoiceId;
  }
};

const setAPIKey = async (apiKey) => {
  const response = await fetch("https://api.elevenlabs.io/v1/user", {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
  if (response.ok) {
    console.log(response);
    await setStorageItem("apiKey", apiKey);
  } else {
    throw new Error("API request failed");
  }
};

const fetchVoices = async () => {
  const storage = await readLocalStorage(["apiKey", "selectedVoiceId", "mode"]);
  if (storage.apiKey) {
    let response = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": storage.apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        chrome.storage.local.clear();
        setWelcomeScreen();
      } else {
        console.error(`HTTP error! status: ${response.status}`);
      }
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
    "selectedVoiceId",
    "mode",
    "voices",
  ]);
  if (storage.apiKey) {
    renderSettings(storage);
  } else {
    setWelcomeScreen();
  }
});

const select = document.getElementById("voices");
select.addEventListener("change", async (event) => {
  const selectedVoiceId = event.target.value;
  await setStorageItem("selectedVoiceId", selectedVoiceId);
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
  try {
    await setAPIKey(inputValue);
    await fetchVoices();
    renderSettings();
  } catch (error) {
    setWelcomeScreen();
    alert("Invalid API key, please try again.");
    console.error(error);
  }
});

document.getElementById("mode").addEventListener("change", async () => {
  const mode = document.getElementById("mode").value;
  await setStorageItem("mode", mode);
});

document.getElementById("clearStorage").addEventListener("click", function () {
  if (
    confirm(
      "Are you sure you want to clear your data? This will remove your API key and all your settings."
    )
  ) {
    chrome.storage.local.clear();
    setWelcomeScreen();
    document.getElementById("apiKey").value = "";
  }
});
