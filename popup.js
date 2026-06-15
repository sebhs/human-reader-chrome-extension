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

// The provider currently selected in the popup.
let currentProvider = DEFAULT_PROVIDER;
const getProvider = () => PROVIDERS[currentProvider];

const setWelcomeScreen = () => {
  document.getElementById("settings").style.display = "none";
  document.getElementById("welcome").style.display = "block";
  document.getElementById("info").style.display = "none";
};

const setSettingsScreen = async () => {
  const provider = getProvider();
  document.getElementById("settings").style.display = "block";
  document.getElementById("welcome").style.display = "none";
  document.getElementById("info").style.display = "block";

  //assumes storage is already set
  const storage = await readStorage([pkey(currentProvider, "mode"), "speed"]);
  if (provider.models.length) {
    document.getElementById("mode").value =
      storage[pkey(currentProvider, "mode")] || provider.defaultModel;
  }
  setSpeedValue(storage.speed || 1);
};

const setSpeedValue = (value) => {
  document.getElementById("speedInput").value = value;
  document.getElementById("speedValue").textContent = value + "x";
};

// Reflect provider-specific UI: welcome links, "powered by" credit, and whether
// a model selector applies (60db models are voice-bound, so the row is hidden).
const updateProviderUi = () => {
  const provider = getProvider();

  const poweredBy = document.getElementById("poweredByLink");
  poweredBy.href = provider.homeUrl;
  poweredBy.textContent = provider.label;

  const signup = document.getElementById("signupLink");
  signup.href = provider.signupUrl;
  signup.textContent = provider.signupLabel;
  document.getElementById("apiKeyHelpLink").href = provider.apiKeyHelpUrl;

  const hasModels = provider.models.length > 0;
  document.getElementById("modelRow").style.display = hasModels
    ? "flex"
    : "none";
  document.getElementById("modelNote").style.display = hasModels
    ? "flex"
    : "none";
};

// Fill the model dropdown from the active provider's model list.
const populateModelOptions = () => {
  const select = document.getElementById("mode");
  select.innerHTML = "";
  getProvider().models.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.value;
    option.text = model.label;
    select.appendChild(option);
  });
};

const populateVoices = async () => {
  const storage = await readStorage([
    pkey(currentProvider, "voices"),
    pkey(currentProvider, "selectedVoiceId"),
  ]);
  const voices = storage[pkey(currentProvider, "voices")];
  const select = document.getElementById("voices");
  select.innerHTML = ""; // Clear existing options
  if (voices) {
    voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.text = voice.name;
      select.appendChild(option);
    });
    const selectedVoiceId = storage[pkey(currentProvider, "selectedVoiceId")];
    if (selectedVoiceId) select.value = selectedVoiceId;
  }
};

const setAPIKey = async (apiKey) => {
  const provider = getProvider();
  const response = await fetch(provider.validateUrl, {
    method: "GET",
    headers: {
      ...provider.authHeaders(apiKey),
      "Content-Type": "application/json",
    },
  });
  if (response.ok) {
    await setStorageItem(pkey(currentProvider, "apiKey"), apiKey);
  } else {
    throw new Error("API request failed");
  }
};

const fetchVoices = async () => {
  const provider = getProvider();
  const storage = await readStorage([pkey(currentProvider, "apiKey")]);
  const apiKey = storage[pkey(currentProvider, "apiKey")];
  if (!apiKey) return;

  let response = await fetch(provider.voicesUrl, {
    method: "GET",
    headers: {
      ...provider.authHeaders(apiKey),
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      await clearProviderData(currentProvider);
      throw new Error("Invalid API key");
    } else {
      console.error(`HTTP error! status: ${response.status}`);
      return;
    }
  }
  response = await response.json();
  const voices = provider.parseVoices(response);
  await setStorageItem(pkey(currentProvider, "voices"), voices);
  await populateVoices();
  return voices;
};

// Remove only the active provider's credentials/cache.
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

const loadStartupData = async () => {
  const provider = getProvider();
  const voices = await fetchVoices();
  const storage = await readStorage([
    pkey(currentProvider, "selectedVoiceId"),
    pkey(currentProvider, "mode"),
    "speed",
  ]);

  if (provider.models.length) {
    const mode = storage[pkey(currentProvider, "mode")] || provider.defaultModel;
    document.getElementById("mode").value = mode;
    await setStorageItem(pkey(currentProvider, "mode"), mode);
  }

  setSpeedValue(storage.speed || 1);

  const selectedVoiceId =
    storage[pkey(currentProvider, "selectedVoiceId")] ||
    (voices && voices[0] && voices[0].id) ||
    provider.fallbackVoiceId;
  if (selectedVoiceId) {
    await setStorageItem(pkey(currentProvider, "selectedVoiceId"), selectedVoiceId);
  }
};

// Show settings or welcome depending on whether the active provider has a key.
const refreshScreen = async () => {
  updateProviderUi();
  populateModelOptions();
  const storage = await readStorage([pkey(currentProvider, "apiKey")]);
  if (storage[pkey(currentProvider, "apiKey")]) {
    await populateVoices();
    await setSettingsScreen();
  } else {
    setWelcomeScreen();
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await readStorage(["provider"]);
  currentProvider =
    stored.provider && PROVIDERS[stored.provider]
      ? stored.provider
      : DEFAULT_PROVIDER;
  await setStorageItem("provider", currentProvider);
  document.getElementById("provider").value = currentProvider;
  await refreshScreen();
});

document.getElementById("provider").addEventListener("change", async (event) => {
  currentProvider = event.target.value;
  await setStorageItem("provider", currentProvider);
  document.getElementById("apiKey").value = "";
  await refreshScreen();
});

document.getElementById("voices").addEventListener("change", async (event) => {
  await setStorageItem(pkey(currentProvider, "selectedVoiceId"), event.target.value);
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
    await clearProviderData(currentProvider);
    button.textContent = "Set";
    setWelcomeScreen();
    alert("Invalid API key, please try again.");
    console.error(error);
  }
});

document.getElementById("mode").addEventListener("change", async () => {
  const mode = document.getElementById("mode").value;
  await setStorageItem(pkey(currentProvider, "mode"), mode);
});

document.getElementById("speedInput").addEventListener("input", async () => {
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
    chrome.storage.local.clear(() => {
      setStorageItem("provider", currentProvider);
      setWelcomeScreen();
      document.getElementById("apiKey").value = "";
    });
  }
});
