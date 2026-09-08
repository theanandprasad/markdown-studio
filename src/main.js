import './styles.css';
import { EditorState } from '@tiptap/pm/state';
import { createEditor, setDocDir, refreshImageSources } from './editor.js';
import { SlashMenu } from './slash-menu.js';
import { icons } from './icons.js';
import { promptDialog, showHelp } from './dialog.js';

const api = window.api;
const $ = (s) => document.querySelector(s);

const els = {
  editor: $('#editor'),
  source: $('#source'),
  bubble: $('#bubble-menu'),
  slash: $('#slash-menu'),
  docName: $('#doc-name'),
  dirtyDot: $('#dirty-dot'),
  statusPath: $('#status-path'),
  statusCounts: $('#status-counts'),
  toolbar: $('#toolbar'),
  blockType: $('#block-type'),
  btnSource: $('#btn-source'),
  findbar: $('#findbar'),
  findInput: $('#find-input'),
  btnWidth: $('#btn-width'),
};

const state = { filePath: null, lastSaved: '', sourceMode: false, dirty: false, fullWidth: false };

// ---------- editor ----------
const slashMenu = new SlashMenu(els.slash);
const editor = createEditor({
  element: els.editor,
  bubbleElement: els.bubble,
  slashMenu,
  onUpdate: () => scheduleDirtyCheck(),
  onSelection: () => updateToolbarState(),
});

window.__markdownStudio = { getMarkdown, editor };

function getMarkdown() {
  const md = state.sourceMode ? els.source.value : editor.getMarkdown();
  return md.endsWith('\n') ? md : `${md}\n`;
}

function dirname(fp) {
  return fp ? fp.slice(0, fp.lastIndexOf('/')) : null;
}

function loadDocument(filePath, content) {
  state.filePath = filePath;
  setDocDir(dirname(filePath));
  // Replace the document and reset undo history.
  const json = editor.markdown.parse(content || '');
  const doc = editor.schema.nodeFromJSON(json);
  editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins }));
  if (state.sourceMode) els.source.value = editor.getMarkdown();
  state.lastSaved = getMarkdown();
  setDirty(false);
  updateHeader();
  updateCounts();
  editor.commands.focus('start');
}

// ---------- dirty tracking ----------
let dirtyTimer = null;
function scheduleDirtyCheck() {
  clearTimeout(dirtyTimer);
  dirtyTimer = setTimeout(checkDirty, 200);
}
function checkDirty() {
  setDirty(getMarkdown() !== state.lastSaved);
  updateCounts();
}
function setDirty(dirty) {
  if (state.dirty !== dirty) {
    state.dirty = dirty;
    api.setDirty(dirty);
  }
  els.dirtyDot.hidden = !dirty;
}

// ---------- header / status ----------
function updateHeader() {
  const name = state.filePath ? state.filePath.split('/').pop() : 'Untitled';
  els.docName.textContent = name;
  document.title = name;
  els.statusPath.textContent = state.filePath ? state.filePath.replace(/^\/Users\/[^/]+/, '~') : 'Not saved yet';
}
function updateCounts() {
  let text;
  if (state.sourceMode) text = els.source.value;
  else text = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  els.statusCounts.textContent = `${words.toLocaleString()} words · ${text.length.toLocaleString()} characters`;
}

// ---------- toolbar ----------
function decorateButtons() {
  document.querySelectorAll('[data-cmd]').forEach((btn) => {
    if (!btn.classList.contains('text') && icons[btn.dataset.cmd]) btn.innerHTML = icons[btn.dataset.cmd];
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => runCommand(btn.dataset.cmd));
  });
}
function updateToolbarState() {
  if (state.sourceMode) return;
  document.querySelectorAll('[data-active]').forEach((btn) => {
    btn.classList.toggle('active', editor.isActive(btn.dataset.active));
  });
  let value = 'paragraph';
  for (let l = 1; l <= 4; l++) if (editor.isActive('heading', { level: l })) value = `heading-${l}`;
  if (editor.isActive('codeBlock')) value = 'codeBlock';
  else if (editor.isActive('blockquote')) value = 'blockquote';
  if (els.blockType.value !== value) els.blockType.value = value;
}
els.blockType.addEventListener('change', () => {
  const v = els.blockType.value;
  const chain = editor.chain().focus();
  if (v.startsWith('heading-')) chain.setHeading({ level: Number(v.split('-')[1]) }).run();
  else if (v === 'codeBlock') chain.setCodeBlock().run();
  else if (v === 'blockquote') chain.setParagraph().toggleBlockquote().run();
  else chain.setParagraph().run();
});

// ---------- link editing ----------
async function editLink() {
  const current = editor.getAttributes('link').href || '';
  const href = await promptDialog({
    title: current ? 'Edit link' : 'Add link',
    placeholder: 'https://',
    value: current,
    okLabel: current ? 'Update' : 'Add',
    secondary: current ? 'Remove link' : null,
  });
  if (href === null) return;
  if (href === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  const { from, to } = editor.state.selection;
  if (from === to && !current) {
    editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }
}

async function insertImageFromDisk() {
  const src = await api.chooseImage();
  if (src) editor.chain().focus().setImage({ src, alt: src.split('/').pop().replace(/\.[^.]+$/, '') }).run();
}

// ---------- full width (Notion-style) ----------
function applyFullWidth(value) {
  state.fullWidth = !!value;
  document.body.classList.toggle('full-width', state.fullWidth);
  els.btnWidth.classList.toggle('active', state.fullWidth);
  els.btnWidth.innerHTML = icons[state.fullWidth ? 'collapse' : 'expand'];
  els.btnWidth.title = state.fullWidth ? 'Normal width (⌥⌘F)' : 'Full width (⌥⌘F)';
}
els.btnWidth.addEventListener('mousedown', (e) => e.preventDefault());
els.btnWidth.addEventListener('click', () => api.setFullWidth(!state.fullWidth));
api.onSettingsChanged(({ fullWidth }) => { if (typeof fullWidth === 'boolean') applyFullWidth(fullWidth); });

// ---------- source mode ----------
function toggleSource(force) {
  const next = typeof force === 'boolean' ? force : !state.sourceMode;
  if (next === state.sourceMode) return;
  if (next) {
    els.source.value = editor.getMarkdown();
    els.editor.hidden = true;
    els.source.hidden = false;
    els.source.focus();
  } else {
    const md = els.source.value;
    els.source.hidden = true;
    els.editor.hidden = false;
    state.sourceMode = false;
    editor.chain().setMeta('addToHistory', true).setContent(md, { contentType: 'markdown', emitUpdate: false }).run();
    editor.commands.focus();
  }
  state.sourceMode = next;
  els.btnSource.classList.toggle('active', next);
  els.toolbar.classList.toggle('disabled', next);
  checkDirty();
}
els.source.addEventListener('input', scheduleDirtyCheck);
els.btnSource.addEventListener('click', () => toggleSource());

// ---------- find ----------
function openFind() {
  els.findbar.hidden = false;
  els.findInput.focus();
  els.findInput.select();
}
function closeFind() {
  els.findbar.hidden = true;
  if (state.sourceMode) els.source.focus(); else editor.commands.focus();
}
function findNext(backwards = false) {
  const q = els.findInput.value;
  if (!q) return;
  const found = window.find(q, false, backwards, true, false, false, false);
  els.findInput.classList.toggle('no-match', !found);
}
els.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
els.findInput.addEventListener('input', () => els.findInput.classList.remove('no-match'));
$('#find-next').addEventListener('click', () => findNext(false));
$('#find-prev').addEventListener('click', () => findNext(true));
$('#find-close').addEventListener('click', closeFind);

// ---------- commands (toolbar, bubble menu, native menu) ----------
const commands = {
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  underline: () => editor.chain().focus().toggleUnderline().run(),
  strike: () => editor.chain().focus().toggleStrike().run(),
  code: () => editor.chain().focus().toggleCode().run(),
  highlight: () => editor.chain().focus().toggleHighlight().run(),
  link: editLink,
  paragraph: () => editor.chain().focus().setParagraph().run(),
  heading: (level) => editor.chain().focus().toggleHeading({ level: Number(level) || 1 }).run(),
  bulletList: () => editor.chain().focus().toggleBulletList().run(),
  orderedList: () => editor.chain().focus().toggleOrderedList().run(),
  taskList: () => editor.chain().focus().toggleTaskList().run(),
  blockquote: () => editor.chain().focus().toggleBlockquote().run(),
  codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
  clearFormatting: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
  table: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  image: insertImageFromDisk,
  horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
  hardBreak: () => editor.chain().focus().setHardBreak().run(),
  addRowBefore: () => editor.chain().focus().addRowBefore().run(),
  addRowAfter: () => editor.chain().focus().addRowAfter().run(),
  addColumnBefore: () => editor.chain().focus().addColumnBefore().run(),
  addColumnAfter: () => editor.chain().focus().addColumnAfter().run(),
  deleteRow: () => editor.chain().focus().deleteRow().run(),
  deleteColumn: () => editor.chain().focus().deleteColumn().run(),
  deleteTable: () => editor.chain().focus().deleteTable().run(),
};

function runCommand(cmd, arg) {
  if (cmd === 'toggleSource') return toggleSource();
  if (cmd === 'toggleToolbar') { els.toolbar.hidden = !els.toolbar.hidden; return; }
  if (cmd === 'showHelp') return showHelp();
  if (cmd === 'find') return openFind();
  if (state.sourceMode) return; // formatting commands only apply to the rich editor
  const fn = commands[cmd];
  if (fn) fn(arg);
}

api.onMenuCommand((cmd, arg) => runCommand(cmd, arg));

// ---------- file events from main ----------
api.onLoad(({ filePath, content }) => loadDocument(filePath, content));
api.onSaved(({ filePath }) => {
  const dirChanged = dirname(filePath) !== dirname(state.filePath);
  state.filePath = filePath;
  setDocDir(dirname(filePath));
  if (dirChanged) refreshImageSources(els.editor);
  state.lastSaved = getMarkdown();
  setDirty(false);
  updateHeader();
});

// ---------- links: ⌘-click opens externally ----------
els.editor.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (a && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    api.openExternal(a.getAttribute('href'));
  }
});

// ---------- drag & drop: .md opens, images insert ----------
const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MD_RE = /\.(md|markdown|mdown|mkd|mkdn|txt)$/i;
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); }, true);
document.addEventListener('drop', async (e) => {
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  e.stopPropagation();
  const coords = { left: e.clientX, top: e.clientY };
  for (const file of files) {
    const fp = api.getPathForFile(file);
    if (!fp) continue;
    if (MD_RE.test(fp)) { api.openPath(fp); continue; }
    if (IMG_RE.test(fp) && !state.sourceMode) {
      const src = await api.relativeImagePath(fp);
      const pos = editor.view.posAtCoords(coords);
      const at = pos ? pos.pos : editor.state.selection.to;
      editor.chain().focus().insertContentAt(at, { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } }).run();
    }
  }
}, true);

// ---------- keyboard: Tab in source mode ----------
els.source.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const { selectionStart: s, selectionEnd: en } = els.source;
    els.source.setRangeText('  ', s, en, 'end');
    scheduleDirtyCheck();
  }
});

// ---------- boot ----------
decorateButtons();
updateToolbarState();
applyFullWidth(false);
api.getInitialDocument().then(({ filePath, content, fullWidth }) => {
  applyFullWidth(!!fullWidth);
  loadDocument(filePath, content);
});
