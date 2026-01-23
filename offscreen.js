// Offscreen document for audio playback (bypasses page CSP)
const codec = "audio/mpeg";
const maxBufferDuration = 90;
let streamingCompleted = true;
let mediaSource = null;
let audioElement = null;
let sourceBuffer = null;
let audioQueue = [];

const initAudio = () => {
  mediaSource = new MediaSource();
  audioElement = new Audio();
  audioElement.src = URL.createObjectURL(mediaSource);
  audioQueue = [];
  streamingCompleted = false;
  sourceBuffer = null;
  
  // Notify content script when playback ends
  audioElement.addEventListener("ended", () => {
    chrome.runtime.sendMessage({ action: "playbackEnded" });
  });
};

const processAudioQueue = () => {
  if (!sourceBuffer || sourceBuffer.updating || audioQueue.length === 0) return;
  
  // Remove old buffered data if needed
  if (sourceBuffer.buffered.length > 0 && 
      sourceBuffer.buffered.end(0) - sourceBuffer.buffered.start(0) > maxBufferDuration) {
    const removeEnd = sourceBuffer.buffered.end(0) - maxBufferDuration;
    if (removeEnd > sourceBuffer.buffered.start(0)) {
      sourceBuffer.remove(sourceBuffer.buffered.start(0), removeEnd);
      return;
    }
  }
  
  const chunk = audioQueue.shift();
  try {
    sourceBuffer.appendBuffer(chunk);
  } catch (e) {
    console.error("Error appending buffer:", e);
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "initAudio") {
    initAudio();
    mediaSource.addEventListener("sourceopen", () => {
      sourceBuffer = mediaSource.addSourceBuffer(codec);
      sourceBuffer.addEventListener("updateend", processAudioQueue);
      sendResponse({ success: true });
    }, { once: true });
    return true; // async response
  }
  
  if (message.action === "appendAudio") {
    const chunk = new Uint8Array(message.chunk);
    audioQueue.push(chunk);
    processAudioQueue();
  }
  
  if (message.action === "playAudio") {
    if (audioElement) {
      audioElement.playbackRate = message.speed || 1;
      audioElement.play();
    }
  }
  
  if (message.action === "pauseAudio") {
    if (audioElement) audioElement.pause();
  }
  
  if (message.action === "stopAudio") {
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }
  
  if (message.action === "streamComplete") {
    streamingCompleted = true;
    if (mediaSource && mediaSource.readyState === "open") {
      // Wait for queue to empty before ending
      const checkAndEnd = () => {
        if (audioQueue.length === 0 && sourceBuffer && !sourceBuffer.updating) {
          mediaSource.endOfStream();
        } else {
          setTimeout(checkAndEnd, 100);
        }
      };
      checkAndEnd();
    }
  }
  
  if (message.action === "getState") {
    sendResponse({
      playing: audioElement && !audioElement.paused,
      currentTime: audioElement ? audioElement.currentTime : 0,
      duration: audioElement ? audioElement.duration : 0
    });
    return true;
  }
});
