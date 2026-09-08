const root = () => document.getElementById('modal-root');

function mount(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
  root().appendChild(overlay);
  return overlay;
}

/** Text prompt. Resolves to string or null if cancelled. */
export function promptDialog({ title, label = '', placeholder = '', value = '', okLabel = 'OK', secondary = null }) {
  return new Promise((resolve) => {
    const overlay = mount(`
      <h3>${title}</h3>
      ${label ? `<label class="modal-label">${label}</label>` : ''}
      <input class="modal-input" type="text" spellcheck="false" placeholder="${placeholder}" />
      <div class="modal-actions">
        ${secondary ? `<button class="btn btn-secondary" data-act="secondary">${secondary}</button>` : ''}
        <span class="spacer"></span>
        <button class="btn" data-act="cancel">Cancel</button>
        <button class="btn btn-primary" data-act="ok">${okLabel}</button>
      </div>`);
    const input = overlay.querySelector('input');
    input.value = value;
    const done = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
    overlay.querySelector('[data-act=cancel]').onclick = () => done(null);
    overlay.querySelector('[data-act=ok]').onclick = () => done(input.value.trim());
    const sec = overlay.querySelector('[data-act=secondary]');
    if (sec) sec.onclick = () => done('');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim()); }
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
    });
    requestAnimationFrame(() => { input.focus(); input.select(); });
  });
}

export function showHelp() {
  const rows = [
    ['⌘N / ⌘O / ⌘S / ⇧⌘S', 'New · Open · Save · Save As'],
    ['/', 'Open the command menu (Notion-style)'],
    ['⌘B · ⌘I · ⌘U · ⇧⌘X', 'Bold · Italic · Underline · Strikethrough'],
    ['⌘E · ⇧⌘H · ⌘K', 'Inline code · Highlight · Link'],
    ['⌥⌘1…4 · ⌥⌘0', 'Heading 1–4 · Plain text'],
    ['⇧⌘8 · ⇧⌘7 · ⇧⌘9', 'Bulleted · Numbered · Task list'],
    ['⇧⌘B · ⌥⌘C', 'Quote · Code block'],
    ['⇧⌘M', 'Toggle raw Markdown source'],
    ['⌘F', 'Find in document'],
    ['# , ## , - , 1. , [ ] , > , ```', 'Markdown shortcuts at the start of a line'],
    ['**bold** *italic* `code` ~~strike~~', 'Inline Markdown as you type'],
    ['⌘-click a link', 'Open it in your browser'],
  ];
  const overlay = mount(`
    <h3>Keyboard Shortcuts</h3>
    <table class="help-table">${rows.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>
    <div class="modal-actions"><span class="spacer"></span><button class="btn btn-primary" data-act="ok">Done</button></div>`);
  const close = () => overlay.remove();
  overlay.querySelector('[data-act=ok]').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}
