'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const MD_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'txt'];
const IMG_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

/** @type {Map<number, {win: BrowserWindow, filePath: string|null, dirty: boolean, forceClose: boolean, pendingContent: string|null}>} */
const docs = new Map();
let pendingOpenPaths = [];

// ---------- helpers ----------
function docOf(win) {
  return win ? docs.get(win.id) : undefined;
}
function focusedDoc() {
  return docOf(targetWindow());
}
function displayName(doc) {
  return doc.filePath ? path.basename(doc.filePath) : 'Untitled';
}
function updateTitle(win) {
  const doc = docOf(win);
  if (!doc) return;
  win.setTitle(`${displayName(doc)}${doc.dirty ? ' — Edited' : ''}`);
  win.setDocumentEdited(doc.dirty);
  win.setRepresentedFilename(doc.filePath || '');
}
function ensureMdExtension(fp) {
  return /\.md$/i.test(fp) ? fp : `${fp}.md`;
}

async function getMarkdownFrom(win) {
  const md = await win.webContents.executeJavaScript('window.__markdownStudio && window.__markdownStudio.getMarkdown()', true);
  return typeof md === 'string' ? md : '';
}

// ---------- settings (appearance) ----------
const THEMES = ['system', 'light', 'dark'];
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { theme: 'system' };

function loadSettings() {
  try {
    const parsed = JSON.parse(fsSync.readFileSync(settingsPath(), 'utf8'));
    if (THEMES.includes(parsed.theme)) settings.theme = parsed.theme;
  } catch { /* first run or unreadable file: keep defaults */ }
}
function saveSettings() {
  try {
    fsSync.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fsSync.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Could not save settings:', err);
  }
}
function applyTheme(theme) {
  settings.theme = THEMES.includes(theme) ? theme : 'system';
  // Drives prefers-color-scheme in the page as well as native dialogs and the window chrome.
  nativeTheme.themeSource = settings.theme;
  for (const doc of docs.values()) doc.win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#ffffff');
}

// ---------- windows ----------
function createWindow(filePath = null, content = null) {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 560,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e20' : '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });
  docs.set(win.id, { win, filePath, dirty: false, forceClose: false, pendingContent: content });

  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => handleClose(e, win));
  win.on('closed', () => docs.delete(win.id));
  win.on('focus', () => updateTitle(win));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
  });

  updateTitle(win);
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

async function handleClose(e, win) {
  const doc = docOf(win);
  if (!doc || !doc.dirty || doc.forceClose) return;
  e.preventDefault();
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', 'Cancel', "Don't Save"],
    defaultId: 0,
    cancelId: 1,
    message: `Do you want to save the changes you made to “${displayName(doc)}”?`,
    detail: "Your changes will be lost if you don't save them.",
  });
  if (response === 1) return;
  if (response === 2) {
    doc.forceClose = true;
    win.close();
    return;
  }
  if (await saveDoc(win, false)) {
    doc.forceClose = true;
    win.close();
  }
}

// ---------- file operations ----------
async function readFileSafe(fp, win) {
  try {
    return await fs.readFile(fp, 'utf8');
  } catch (err) {
    dialog.showMessageBox(win || null, { type: 'error', message: `Could not open “${path.basename(fp)}”`, detail: String(err.message || err) });
    return null;
  }
}

async function openPath(fp, preferredWin) {
  fp = path.resolve(fp);
  for (const doc of docs.values()) {
    if (doc.filePath === fp) {
      doc.win.focus();
      return;
    }
  }
  const content = await readFileSafe(fp, preferredWin);
  if (content === null) return;
  app.addRecentDocument(fp);

  const doc = docOf(preferredWin);
  // Reuse a pristine, untitled window instead of opening another one.
  if (doc && !doc.filePath && !doc.dirty) {
    doc.filePath = fp;
    updateTitle(preferredWin);
    preferredWin.webContents.send('document:load', { filePath: fp, content });
    preferredWin.focus();
    return;
  }
  createWindow(fp, content);
}

async function openDialog(win) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win || null, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: MD_EXTENSIONS },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled) return;
  for (const fp of filePaths) await openPath(fp, win);
}

async function saveDoc(win, saveAs) {
  const doc = docOf(win);
  if (!doc) return false;
  let target = doc.filePath;
  if (saveAs || !target) {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: target || path.join(app.getPath('documents'), 'Untitled.md'),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (canceled || !filePath) return false;
    target = ensureMdExtension(filePath);
  }
  try {
    const markdown = await getMarkdownFrom(win);
    await fs.writeFile(target, markdown, 'utf8');
  } catch (err) {
    dialog.showMessageBox(win, { type: 'error', message: 'Could not save the file', detail: String(err.message || err) });
    return false;
  }
  doc.filePath = target;
  doc.dirty = false;
  updateTitle(win);
  app.addRecentDocument(target);
  win.webContents.send('document:saved', { filePath: target });
  return true;
}

// ---------- IPC ----------
ipcMain.handle('document:initial', (e) => {
  const doc = docOf(BrowserWindow.fromWebContents(e.sender));
  if (!doc) return { filePath: null, content: '' };
  const content = doc.pendingContent ?? '';
  doc.pendingContent = null;
  return { filePath: doc.filePath, content };
});
ipcMain.on('document:dirty', (e, dirty) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const doc = docOf(win);
  if (!doc || doc.dirty === !!dirty) return;
  doc.dirty = !!dirty;
  updateTitle(win);
});
ipcMain.handle('document:save', (e) => saveDoc(BrowserWindow.fromWebContents(e.sender), false));
ipcMain.handle('document:save-as', (e) => saveDoc(BrowserWindow.fromWebContents(e.sender), true));
ipcMain.handle('document:open', (e) => openDialog(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('document:open-path', (e, fp) => openPath(fp, BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('document:new', () => { createWindow(); });
ipcMain.handle('document:reveal', (e) => {
  const doc = docOf(BrowserWindow.fromWebContents(e.sender));
  if (doc && doc.filePath) shell.showItemInFolder(doc.filePath);
});
ipcMain.handle('shell:open-external', (_e, url) => {
  if (/^https?:|^mailto:/i.test(url)) return shell.openExternal(url);
});
ipcMain.handle('dialog:choose-image', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const doc = docOf(win);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: IMG_EXTENSIONS }],
  });
  if (canceled || !filePaths[0]) return null;
  return relativeImagePath(filePaths[0], doc);
});
ipcMain.handle('path:relative-image', (e, absPath) => relativeImagePath(absPath, docOf(BrowserWindow.fromWebContents(e.sender))));

function relativeImagePath(absPath, doc) {
  if (doc && doc.filePath) {
    const rel = path.relative(path.dirname(doc.filePath), absPath);
    if (!rel.startsWith('..')) return rel.split(path.sep).join('/');
  }
  return absPath;
}

// ---------- menu ----------
function targetWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows().find((w) => w.isVisible()) || null;
}
function send(cmd, arg) {
  const win = targetWindow();
  if (win) win.webContents.send('menu:command', cmd, arg);
}
function fmt(label, cmd, accelerator, arg) {
  return { label, accelerator, click: () => send(cmd, arg) };
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => openDialog(targetWindow()) },
        { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
        { type: 'separator' },
        { role: 'close' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => { const w = targetWindow(); if (w) saveDoc(w, false); } },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: () => { const w = targetWindow(); if (w) saveDoc(w, true); } },
        { type: 'separator' },
        { label: 'Reveal in Finder', accelerator: 'Alt+CmdOrCtrl+R', click: () => { const d = focusedDoc(); if (d && d.filePath) shell.showItemInFolder(d.filePath); } },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        fmt('Find…', 'find', 'CmdOrCtrl+F'),
      ],
    },
    {
      label: 'Format',
      submenu: [
        fmt('Bold', 'bold', 'CmdOrCtrl+B'),
        fmt('Italic', 'italic', 'CmdOrCtrl+I'),
        fmt('Underline', 'underline', 'CmdOrCtrl+U'),
        fmt('Strikethrough', 'strike', 'Shift+CmdOrCtrl+X'),
        fmt('Inline Code', 'code', 'CmdOrCtrl+E'),
        fmt('Highlight', 'highlight', 'Shift+CmdOrCtrl+H'),
        fmt('Link…', 'link', 'CmdOrCtrl+K'),
        { type: 'separator' },
        fmt('Paragraph', 'paragraph', 'Alt+CmdOrCtrl+0'),
        fmt('Heading 1', 'heading', 'Alt+CmdOrCtrl+1', 1),
        fmt('Heading 2', 'heading', 'Alt+CmdOrCtrl+2', 2),
        fmt('Heading 3', 'heading', 'Alt+CmdOrCtrl+3', 3),
        fmt('Heading 4', 'heading', 'Alt+CmdOrCtrl+4', 4),
        { type: 'separator' },
        fmt('Bulleted List', 'bulletList', 'Shift+CmdOrCtrl+8'),
        fmt('Numbered List', 'orderedList', 'Shift+CmdOrCtrl+7'),
        fmt('Task List', 'taskList', 'Shift+CmdOrCtrl+9'),
        fmt('Quote', 'blockquote', 'Shift+CmdOrCtrl+B'),
        fmt('Code Block', 'codeBlock', 'Alt+CmdOrCtrl+C'),
        { type: 'separator' },
        fmt('Clear Formatting', 'clearFormatting', 'CmdOrCtrl+\\'),
      ],
    },
    {
      label: 'Insert',
      submenu: [
        fmt('Table', 'table'),
        fmt('Image…', 'image'),
        fmt('Horizontal Rule', 'horizontalRule'),
        fmt('Line Break', 'hardBreak', 'Shift+Return'),
        { type: 'separator' },
        { label: 'Table', submenu: [
          fmt('Add Row Above', 'addRowBefore'),
          fmt('Add Row Below', 'addRowAfter'),
          fmt('Add Column Left', 'addColumnBefore'),
          fmt('Add Column Right', 'addColumnAfter'),
          { type: 'separator' },
          fmt('Delete Row', 'deleteRow'),
          fmt('Delete Column', 'deleteColumn'),
          fmt('Delete Table', 'deleteTable'),
        ] },
      ],
    },
    {
      label: 'View',
      submenu: [
        fmt('Toggle Markdown Source', 'toggleSource', 'Shift+CmdOrCtrl+M'),
        fmt('Toggle Toolbar', 'toggleToolbar', 'Alt+CmdOrCtrl+T'),
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: [
            { label: 'System', type: 'radio', checked: settings.theme === 'system', click: () => { applyTheme('system'); saveSettings(); } },
            { label: 'Light', type: 'radio', checked: settings.theme === 'light', click: () => { applyTheme('light'); saveSettings(); } },
            { label: 'Dark', type: 'radio', checked: settings.theme === 'dark', click: () => { applyTheme('dark'); saveSettings(); } },
          ],
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(DEV_URL || !app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: () => send('showHelp') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- app lifecycle ----------
app.on('open-file', (e, fp) => {
  e.preventDefault();
  if (app.isReady()) openPath(fp, BrowserWindow.getFocusedWindow());
  else pendingOpenPaths.push(fp);
});

app.whenReady().then(async () => {
  loadSettings();
  applyTheme(settings.theme);
  buildMenu();
  const argPaths = process.argv.slice(1).filter((a) => !a.startsWith('-') && /\.(md|markdown|mdown|mkd|txt)$/i.test(a));
  const toOpen = [...pendingOpenPaths, ...argPaths];
  pendingOpenPaths = [];
  if (toOpen.length) {
    for (const fp of toOpen) await openPath(fp, null);
  } else {
    createWindow();
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
