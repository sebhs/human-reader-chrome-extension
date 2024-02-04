const spinnerIcon = chrome.runtime.getURL("images/spinner.svg");
const playIcon = chrome.runtime.getURL("images/play.svg");
const stopIcon = chrome.runtime.getURL("images/stop.svg");

const button = document.createElement("img");
button.id = "speakButton";
button.alt = "Speak button";
button.setAttribute("role", "button");
button.src = playIcon;
button.style.display = "none";
document.body.appendChild(button);

function onClickSpeakButton() {
  button.src = spinnerIcon;

  chrome.runtime.sendMessage(
    {
      action: "speak",
      text: window.getSelection().toString(),
    },
    function (response) {
      button.src = playIcon;
      button.textContent = response.status;
      button.disabled = false;
    }
  );
}

document.addEventListener("selectionchange", function () {
  const selection = window.getSelection();
  if (!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    button.style.left = window.scrollX + lastRect.right + "px";
    button.style.top = window.scrollY + lastRect.bottom + "px";
    button.style.display = "block";
  } else {
    button.style.display = "none";
  }
  button.onclick = onClickSpeakButton;
});

button.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    onClickSpeakButton();
  }
});

chrome.runtime.onMessage.addListener(function (message) {
  if (message.action === "playing") {
    button.src = stopIcon;
  }
  if (message.action === "stopPlaying") {
    button.src = playIcon;
  }
});
