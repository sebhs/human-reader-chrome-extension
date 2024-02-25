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

const readStorage = async (keys) => {
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

const setSettingsScreen = async () => {
  const settings = document.getElementById("settings");
  const welcome = document.getElementById("welcome");
  settings.style.display = "block";
  welcome.style.display = "none";

  //assumes storage is already set
  storage = await readStorage(["mode", "speed"]);
  document.getElementById("mode").value = storage.mode;
  setSpeedValue(storage.speed || 1);
};

const setSpeedValue = (value) => {
  document.getElementById("speedInput").value = value;
  document.getElementById("speedValue").textContent = value + "x";
};

const loadStartupData = async () => {
  const voices = await fetchVoices();
  storage = await readStorage([
    "apiKey",
    "selectedVoiceId",
    "mode",
    "voices",
    "speed",
  ]);
  const mode = storage.mode || "englishfast";
  document.getElementById("mode").value = mode;
  const speedValue = storage.speed || 1;
  setSpeedValue(speedValue);

  const selectedVoiceId = storage.selectedVoiceId || voices[0].id;
  setStorageItem("selectedVoiceId", selectedVoiceId);
  setStorageItem("mode", mode);
};

const populateVoices = async () => {
  const storage = await readStorage(["voices", "selectedVoiceId"]);
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
  const storage = await readStorage(["apiKey", "selectedVoiceId", "mode"]);
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
        throw new Error("Invalid API key");
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
        return voices;
      }
    }
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const storage = await readStorage(["apiKey"]);
  if (storage.apiKey) {
    populateVoices();
    setSettingsScreen();
  } else {
    setWelcomeScreen();
  }
});

const select = document.getElementById("voices");
select.addEventListener("change", async (event) => {
  const selectedVoiceId = event.target.value;
  console.log(selectedVoiceId);
  await setStorageItem("selectedVoiceId", selectedVoiceId);
});

document.getElementById("setApiKey").addEventListener("click", async () => {
  const button = document.getElementById("setApiKey");
  const inputValue = document.getElementById("apiKey").value;
  button.textContent = "...";
  try {
    await setAPIKey(inputValue);
    await loadStartupData();
    await setSettingsScreen();
    button.textContent = "Set";
  } catch (error) {
    console.log(error);
    chrome.storage.local.clear();
    button.textContent = "Set";
    setWelcomeScreen();
    alert("Invalid API key, please try again.");
    console.error(error);
  }
});

document.getElementById("mode").addEventListener("change", async () => {
  const mode = document.getElementById("mode").value;
  await setStorageItem("mode", mode);
});

document.getElementById("speedInput").addEventListener("input", async (e) => {
  const value = document.getElementById("speedInput").value;
  setSpeedValue(value);
  await setStorageItem("speed", value);
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
