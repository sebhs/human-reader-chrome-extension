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

function handleSetValue(inputId, buttonId, storageId) {
  const inputValue = document.getElementById(inputId).value;
  const button = document.getElementById(buttonId);
  chrome.storage.local.set({ [storageId]: inputValue }, () => {
    button.innerHTML = "&#10003;"; //checkmark
    setTimeout(function () {
      button.textContent = "Set";
    }, 1000);
  });
}

document
  .getElementById("setApiKey")
  .addEventListener("click", () =>
    handleSetValue("apiKey", "setApiKey", "apiKey")
  );
document
  .getElementById("setVoiceId")
  .addEventListener("click", () =>
    handleSetValue("voiceId", "setVoiceId", "voiceId")
  );

document.getElementById("mode").addEventListener("change", () => {
  const mode = document.getElementById("mode").value;
  chrome.storage.local.set({ mode: mode });
});
