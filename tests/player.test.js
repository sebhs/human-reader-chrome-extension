import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlayer } from '../player.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
class AudioStub extends EventTarget {
  set src(value) { this.source = value; }
  play() { this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() {}
  load() {}
  removeAttribute() {}
}
class MediaStub extends EventTarget {
  constructor() { super(); this.chunks = []; }
  addSourceBuffer() {
    const buffer = new EventTarget();
    buffer.appendBuffer = value => { this.chunks.push([...value]); queueMicrotask(() => buffer.dispatchEvent(new Event('updateend'))); };
    return buffer;
  }
  endOfStream() { this.finished = true; }
}
function setup(requestSpeech, timeoutMs) {
  const media = [], audio = [], revoked = [];
  const player = new SpeechPlayer({ requestSpeech, onState() {}, timeoutMs,
    audioFactory() { const item = new AudioStub(); audio.push(item); return item; },
    mediaSourceFactory() { const item = new MediaStub(); media.push(item); return item; },
    urls: { createObjectURL(item) { queueMicrotask(() => item.dispatchEvent(new Event('sourceopen'))); return `blob:${media.length}`; }, revokeObjectURL(url) { revoked.push(url); } }
  });
  return { player, media, audio, revoked };
}
const response = chunks => new Response(new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(new Uint8Array(chunk))); controller.close(); } }));
test('drains every chunk and waits for the real ended event', async () => {
  const { player, media, audio } = setup(async () => response([[1, 2], [3, 4]]));
  await player.start({ speed: 1.5 }, 'hello', 7);
  assert.deepEqual(media[0].chunks, [[1, 2], [3, 4]]);
  assert.equal(media[0].finished, true);
  assert.equal(player.state.status, 'playing');
  assert.equal(audio[0].playbackRate, 1.5);
  audio[0].dispatchEvent(new Event('ended'));
  assert.equal(player.state.status, 'idle');
});
test('Stop aborts pending synthesis and late responses cannot restart playback', async () => {
  let finish, signal;
  const { player, revoked } = setup((settings, text, abortSignal) => { signal = abortSignal; return new Promise(resolve => { finish = resolve; }); });
  const reading = player.start({}, 'hello', 4);
  await tick();
  player.stop();
  finish(response([[1]]));
  await reading;
  assert.equal(signal.aborted, true);
  assert.deepEqual(player.state, { status: 'idle', message: '', sourceTabId: 4 });
  assert.deepEqual(revoked, ['blob:1']);
});
test('replacing playback isolates old audio events and supports pause/resume', async () => {
  const { player, audio } = setup(async () => response([[1]]));
  await player.start({}, 'first', 1);
  await player.start({}, 'second', 2);
  audio[0].dispatchEvent(new Event('ended'));
  audio[0].dispatchEvent(new Event('error'));
  assert.deepEqual(player.state, { status: 'playing', message: '', sourceTabId: 2 });
  await player.toggle();
  assert.equal(player.state.status, 'paused');
  await player.toggle();
  assert.equal(player.state.status, 'playing');
  player.stop();
});
test('stalled synthesis becomes an actionable error and aborts the request', async () => {
  let signal;
  const { player } = setup((settings, text, abortSignal) => { signal = abortSignal; return new Promise(() => {}); }, 10);
  await player.start({}, 'hello', 2);
  assert.equal(player.state.status, 'error');
  assert.match(player.state.message, /too long/);
  assert.equal(signal.aborted, true);
});
test('keeps feeding chunks while audio.play waits for enough data', async () => {
  const { player, media, audio } = setup(async () => response([[1], [2], [3]]));
  const start = player.start({}, 'hello', 1);
  audio[0].play = () => new Promise(() => {});
  await start;
  assert.deepEqual(media[0].chunks, [[1], [2], [3]]);
  assert.equal(media[0].finished, true);
  player.stop();
});
test('pausing while initial playback buffers ignores its interrupted play promise', async () => {
  const { player, audio, revoked } = setup(async () => response([[1], [2]]));
  let rejectPlay;
  const start = player.start({}, 'hello', 1);
  audio[0].play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  await start;
  await player.toggle();
  rejectPlay(new DOMException('Playback interrupted by pause', 'AbortError'));
  await tick();
  assert.equal(player.state.status, 'paused');
  assert.deepEqual(revoked, []);
  audio[0].play = AudioStub.prototype.play;
  await player.toggle();
  assert.equal(player.state.status, 'playing');
  player.stop();
});
test('a rejected old resume cannot destroy a newer successful resume', async () => {
  const { player, audio, revoked } = setup(async () => response([[1]]));
  await player.start({}, 'hello', 1);
  await player.toggle();
  let rejectPlay;
  audio[0].play = () => new Promise((resolve, reject) => { rejectPlay = reject; });
  const resuming = player.toggle();
  await player.toggle();
  audio[0].play = AudioStub.prototype.play;
  await player.toggle();
  rejectPlay(new DOMException('Playback interrupted by pause', 'AbortError'));
  await resuming;
  assert.equal(player.state.status, 'playing');
  assert.deepEqual(revoked, []);
  player.stop();
});
test('a late resume resolution cannot publish playing after another pause', async () => {
  const { player, audio } = setup(async () => response([[1]]));
  await player.start({}, 'hello', 1);
  await player.toggle();
  let resolvePlay;
  audio[0].play = () => new Promise(resolve => { resolvePlay = resolve; });
  const resuming = player.toggle();
  await player.toggle();
  resolvePlay();
  await resuming;
  assert.equal(player.state.status, 'paused');
  player.stop();
});
test('a current playback rejection still reports an error and releases audio', async () => {
  const { player, audio, revoked } = setup(async () => response([[1]]));
  await player.start({}, 'hello', 1);
  await player.toggle();
  audio[0].play = () => Promise.reject(new Error('Playback unavailable'));
  await player.toggle();
  assert.equal(player.state.status, 'error');
  assert.equal(player.state.message, 'Playback unavailable');
  assert.deepEqual(revoked, ['blob:1']);
});
