import { requestSpeech, errorMessage } from './api.js';
import { SpeechPlayer } from './player.js';

let requestId = null;
const player = new SpeechPlayer({
  requestSpeech: async (...args) => {
    try { return await requestSpeech(...args); }
    catch (error) { throw new Error(errorMessage(error)); }
  },
  onState: state => chrome.runtime.sendMessage({ target: 'background', action: 'playerState', requestId, state }).catch(() => {})
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.target !== 'offscreen' || sender.id !== chrome.runtime.id || sender.tab) return;
  if (message.action === 'start') {
    player.stop();
    requestId = message.requestId;
    void player.start(message.settings, message.text, message.sourceTabId);
    respond({ ok: true, state: player.state, requestId });
  } else if (message.action === 'stop') {
    player.stop();
    requestId = null;
    respond({ ok: true, state: player.state });
  } else if (message.action === 'toggle') {
    player.toggle().then(() => respond({ ok: true, state: player.state, requestId }));
    return true;
  } else if (message.action === 'setSpeed') {
    player.setSpeed(message.speed);
    respond({ ok: true });
  } else if (message.action === 'getState') {
    respond({ ok: true, state: player.state, requestId });
  }
});
