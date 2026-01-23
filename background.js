chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    "id": "readOutLoud",
    "title": "Human Reader - Start reading",
    "contexts": ["selection"],
  });
});

// Offscreen document management
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  if (existingContexts.length > 0) return;
  
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Play TTS audio without page CSP restrictions",
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

// Relay audio messages from content script to offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "offscreen") {
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage(message.data).then(sendResponse);
    });
    return true;
  }
});

// Could be adde in future
//chrome.contextMenus.create({
//    "id": "stopReading",
//    "title": "Stop reading",
//    "contexts": ["all"],
//});

// Detect click on context menu
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    transmitSignal();
})

// Send message to content.js file
async function transmitSignal() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "readOutLoud"});
    }
}