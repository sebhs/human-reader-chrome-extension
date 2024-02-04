document.addEventListener("DOMContentLoaded", () => {
  const apiKey = localStorage.getItem("apiKey");
  const voiceId = localStorage.getItem("voiceId");
  const mode = localStorage.getItem("mode")
    ? localStorage.getItem("mode")
    : "englishfast";

  if (apiKey) document.getElementById("apiKey").value = apiKey;
  if (voiceId) document.getElementById("voiceId").value = voiceId;

  document.getElementById("mode").value = mode;
});

function handleSetValue(inputId, buttonId, storageId) {
  const inputValue = document.getElementById(inputId).value;
  const button = document.getElementById(buttonId);
  button.innerHTML = "&#10003;"; //checkmark
  localStorage.setItem(storageId, inputValue);
  setTimeout(function () {
    button.textContent = "Set";
  }, 1000);
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

document.addEventListener("DOMContentLoaded", () => {
  const mode = localStorage.getItem("mode")
    ? localStorage.getItem("mode")
    : "englishfast";
  document.getElementById("mode").value = mode;
});
document.getElementById("mode").addEventListener("change", () => {
  const mode = document.getElementById("mode").value;
  localStorage.setItem("mode", mode);
});
