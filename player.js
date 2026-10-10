export class SpeechPlayer {
  constructor({ requestSpeech, onState, audioFactory = () => new Audio(), mediaSourceFactory = () => new MediaSource(), urls = URL, timeoutMs = 20000 }) {
    Object.assign(this, { requestSpeech, onState, audioFactory, mediaSourceFactory, urls, timeoutMs });
    this.session = null;
    this.state = { status: 'idle', message: '', sourceTabId: null };
  }

  publish(session, status, message = '') {
    if (session && this.session !== session) return;
    this.state = { status, message, sourceTabId: session?.sourceTabId ?? this.state.sourceTabId };
    this.onState(this.state);
  }

  release(session) {
    session.playAttempt = null;
    session.controller.abort();
    clearTimeout(session.timer);
    session.reader?.cancel().catch(() => {});
    session.audio.pause();
    session.audio.removeAttribute('src');
    session.audio.load();
    if (session.url) this.urls.revokeObjectURL(session.url);
  }

  stop(message = '') {
    const old = this.session;
    this.session = null;
    if (old) this.release(old);
    this.publish(null, 'idle', message);
  }

  fail(session, error) {
    if (this.session !== session) return;
    this.session = null;
    this.release(session);
    this.publish(null, 'error', error.message || 'Audio could not be played. Try again.');
  }

  async play(session) {
    const attempt = Symbol('play');
    session.playAttempt = attempt;
    const current = () => this.session === session && session.playAttempt === attempt && !session.paused;
    try {
      await session.audio.play();
      if (current()) this.publish(session, 'playing');
    } catch (error) {
      if (current()) this.fail(session, error);
    }
  }

  async deadline(session, operation) {
    clearTimeout(session.timer);
    const timeout = new Promise((_, reject) => {
      session.timer = setTimeout(() => reject(new Error('ElevenLabs took too long to send audio. Try again.')), this.timeoutMs);
    });
    try { return await Promise.race([operation, timeout]); }
    finally { clearTimeout(session.timer); }
  }

  async start(settings, text, sourceTabId) {
    this.stop();
    const session = { controller: new AbortController(), audio: this.audioFactory(), sourceTabId, paused: false };
    this.session = session;
    this.publish(session, 'loading');
    session.audio.playbackRate = Math.min(2.5, Math.max(0.5, Number(settings.speed) || 1));
    session.audio.addEventListener('playing', () => this.publish(session, session.paused ? 'paused' : 'playing'));
    session.audio.addEventListener('ended', () => { if (this.session === session) this.stop(); });
    session.audio.addEventListener('error', () => this.fail(session, new Error('Chrome could not decode this audio. Try a different voice or model.')));
    try {
      const media = this.mediaSourceFactory();
      session.url = this.urls.createObjectURL(media);
      const opened = new Promise((resolve, reject) => {
        media.addEventListener('sourceopen', resolve, { once: true });
        session.controller.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      });
      session.audio.src = session.url;
      const ready = Promise.all([this.requestSpeech(settings, text, session.controller.signal), opened]);
      const [response] = await this.deadline(session, ready);
      if (this.session !== session) return;
      if (!response.body) throw new Error('ElevenLabs returned no audio. Try again.');
      const buffer = media.addSourceBuffer('audio/mpeg');
      session.reader = response.body.getReader();
      let received = false;
      while (this.session === session) {
        const { done, value } = await this.deadline(session, session.reader.read());
        if (this.session !== session) return;
        if (done) break;
        if (!value?.byteLength) continue;
        await this.deadline(session, new Promise((resolve, reject) => {
          const cleanup = () => {
            buffer.removeEventListener('updateend', updated);
            buffer.removeEventListener('error', failed);
            session.controller.signal.removeEventListener('abort', aborted);
          };
          const updated = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error('The audio stream was interrupted. Try again.')); };
          const aborted = () => { cleanup(); reject(new DOMException('Stopped', 'AbortError')); };
          buffer.addEventListener('updateend', updated, { once: true });
          buffer.addEventListener('error', failed, { once: true });
          session.controller.signal.addEventListener('abort', aborted, { once: true });
          try { buffer.appendBuffer(value); } catch (error) { cleanup(); reject(error); }
        }));
        if (this.session !== session) return;
        if (!received) {
          received = true;
          if (!session.paused) void this.play(session);
        }
      }
      if (this.session !== session) return;
      if (!received) throw new Error('ElevenLabs returned empty audio. Try again.');
      media.endOfStream();
    } catch (error) {
      if (this.session === session) this.fail(session, error);
    }
  }

  setSpeed(value) {
    const speed = Number(value);
    if (this.session && Number.isFinite(speed)) this.session.audio.playbackRate = Math.min(2.5, Math.max(0.5, speed));
  }

  async toggle() {
    const session = this.session;
    if (!session) return;
    session.paused = !session.paused;
    if (session.paused) {
      session.playAttempt = null;
      session.audio.pause();
      this.publish(session, 'paused');
    } else {
      await this.play(session);
    }
  }
}
