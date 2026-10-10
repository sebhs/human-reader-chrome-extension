(() => {
  const host = document.createElement('human-reader-controls');
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', 'important');
  host.style.setProperty('font-size', '14px', 'important');
  host.style.setProperty('line-height', '1.45', 'important');
  host.style.setProperty('color', '#242235', 'important');
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
  readButton.textContent = 'Read aloud';
  readButton.setAttribute('aria-label', 'Read selected text with Human Reader');
  readButton.hidden = true;

  const toolbar = document.createElement('section');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('aria-label', 'Human Reader playback');
  toolbar.hidden = true;
  const title = document.createElement('strong');
  title.textContent = 'Human Reader';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const controls = document.createElement('div');
  controls.className = 'controls';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.textContent = 'Stop';
  const settings = document.createElement('button');
  settings.type = 'button';
  settings.textContent = 'Settings';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Dismiss';
  controls.append(toggle, stop, settings, dismiss);
  toolbar.append(title, status, controls);
  root.append(readButton, toolbar);
  document.documentElement.append(host);

  let selection = null;
  let showSelectionButton = true;
  let playback = { status: 'idle', message: '' };
  let requestVersion = 0;

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
    toolbar.hidden = !active && !error;
    toolbar.classList.toggle('error', error);
    status.textContent = playback.message || ({ loading: 'Preparing audio…', playing: 'Reading aloud', paused: 'Paused' }[playback.status] || '');
    toggle.hidden = !['playing', 'paused'].includes(playback.status);
    toggle.textContent = playback.status === 'paused' ? 'Resume' : 'Pause';
    stop.hidden = !active;
    settings.hidden = !error;
    dismiss.hidden = !error;
    readButton.hidden = !showSelectionButton || !selection || active || error;
    if (!readButton.hidden) {
      const width = readButton.offsetWidth || 110;
      const height = readButton.offsetHeight || 38;
      const left = Math.max(8, Math.min(selection.rect.right, window.innerWidth - width - 8));
      const below = selection.rect.bottom + 8;
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
    if (selection) void command('read', { text: selection.text });
  });
  toggle.addEventListener('click', () => void command('toggle'));
  stop.addEventListener('click', () => void command('stop'));
  settings.addEventListener('click', () => void command('openSettings'));
  dismiss.addEventListener('click', () => {
    ++requestVersion;
    playback = { status: 'idle', message: '' };
    selection = null;
    render();
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

  void loadPreferences();
})();
