(() => {
  const host = document.createElement('human-reader-controls');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  const root = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('style.css');
  root.append(stylesheet);

  const readButton = document.createElement('button');
  readButton.type = 'button';
  readButton.className = 'read-selection';
  const icon = document.createElement('img');
  icon.alt = '';
  readButton.append(icon);
  readButton.setAttribute('aria-label', 'Read selected text with Human Reader');
  readButton.hidden = true;

  root.append(readButton);
  document.documentElement.append(host);

  let selection = null;
  let showSelectionButton = true;
  let playback = { status: 'idle', message: '' };
  let requestVersion = 0;
  let notifiedError = '';

  function isEditable(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return Boolean(element && (element.closest('input, textarea, select') || element.isContentEditable));
  }

  function selectedText() {
    const current = window.getSelection();
    if (!current || current.isCollapsed || !current.rangeCount ||
        isEditable(document.activeElement) || isEditable(current.anchorNode) || isEditable(current.focusNode)) {
      return '';
    }
    return current.toString().trim();
  }

  function render() {
    const active = ['loading', 'playing', 'paused'].includes(playback.status);
    const error = playback.status === 'error';
    const label = active ? 'Stop reading' : 'Read selected text with Human Reader';
    readButton.setAttribute('aria-label', label);
    readButton.title = label;
    icon.src = chrome.runtime.getURL(`images/${playback.status === 'loading' ? 'spinner' : active ? 'stop' : 'play'}.svg`);
    readButton.hidden = !showSelectionButton || !selection;
    if (!error) notifiedError = '';
    if (error && playback.message && notifiedError !== playback.message) {
      notifiedError = playback.message;
      window.alert(playback.message);
    }
    if (!readButton.hidden) {
      const width = readButton.offsetWidth || 20;
      const height = readButton.offsetHeight || 20;
      const left = Math.max(8, Math.min(selection.rect.right, window.innerWidth - width - 8));
      const below = selection.rect.bottom;
      const top = below + height <= window.innerHeight - 8 ? below : selection.rect.top - height - 8;
      readButton.style.left = `${left}px`;
      readButton.style.top = `${Math.max(8, top)}px`;
    }
  }

  function updateSelection() {
    if (root.activeElement) return;
    const text = selectedText();
    const current = window.getSelection();
    selection = null;
    if (text) {
      const rects = Array.from(current.getRangeAt(0).getClientRects());
      const rect = rects.reverse().find(item => item.width > 0 && item.height > 0);
      if (rect && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth) {
        selection = { text, rect };
      }
    }
    render();
  }

  async function send(action, fields = {}) {
    try {
      const result = await chrome.runtime.sendMessage({ target: 'background', action, ...fields });
      if (!result?.ok) throw new Error(result?.error || 'Human Reader could not respond. Reload this page and try again.');
      return result;
    } catch (error) {
      return { ok: false, error: error.message || 'Reload this page to reconnect Human Reader.' };
    }
  }

  async function command(action, fields = {}) {
    const version = ++requestVersion;
    if (action === 'read') {
      playback = { status: 'loading', message: 'Preparing audio…' };
      render();
    }
    const result = await send(action, fields);
    if (version !== requestVersion) return;
    if (!result.ok) playback = { status: 'error', message: result.error };
    else if (result.state) playback = result.state;
    render();
  }

  async function loadPreferences() {
    const result = await send('getPreferences');
    if (result.ok) {
      showSelectionButton = result.showSelectionButton !== false;
      updateSelection();
      render();
    }
  }

  readButton.addEventListener('pointerdown', event => event.preventDefault());
  readButton.addEventListener('click', () => {
    if (['loading', 'playing', 'paused'].includes(playback.status)) void command('stop');
    else if (selection) void command('read', { text: selection.text });
  });
  document.addEventListener('selectionchange', updateSelection);
  document.addEventListener('pointerup', updateSelection);
  window.addEventListener('scroll', updateSelection, { passive: true, capture: true });
  window.addEventListener('resize', updateSelection, { passive: true });

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.target === 'content' && message.action === 'getSelection') {
      respond({ text: selectedText() });
    } else if (message.target === 'ui' && message.action === 'playbackState') {
      ++requestVersion;
      playback = message.state;
      render();
    } else if (message.action === 'preferencesChanged') {
      void loadPreferences();
    } else if (message.target === 'content' && message.action === 'toggleSelection') {
      const text = selectedText();
      if (text) void command('read', { text });
    }
  });

  const initialVersion = requestVersion;
  void send('getPlayback').then(result => {
    if (result.ok && result.state && requestVersion === initialVersion) {
      playback = result.state;
      render();
    }
  });
  void loadPreferences();
})();
