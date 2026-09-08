// End-to-end smoke test: launches the real Electron app, loads the kitchen-sink
// document, exercises the slash menu and formatting, and verifies markdown round-trip.
import { _electron as electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = path.join(root, 'samples', 'kitchen-sink.md');
const shots = process.env.SHOT_DIR || path.join(os.tmpdir(), 'mdstudio-shots');
await fs.mkdir(shots, { recursive: true });

// Work on a temp copy so the sample stays pristine.
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdstudio-'));
const tmpDoc = path.join(tmpDir, 'kitchen-sink.md');
await fs.copyFile(sample, tmpDoc);
await fs.copyFile(path.join(root, 'samples', 'icon.png'), path.join(tmpDir, 'icon.png'));

const app = await electron.launch({ args: ['.', tmpDoc], cwd: root });
const win = await app.firstWindow();
win.on('pageerror', (err) => console.log('PAGE ERROR:', err.message, '\n', err.stack?.split('\n').slice(0, 6).join('\n')));
win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[renderer ${m.type()}]`, m.text().slice(0, 400)); });
await win.waitForSelector('.tiptap');
await app.evaluate(({ app, BrowserWindow }) => { app.focus({ steal: true }); BrowserWindow.getAllWindows()[0].focus(); });
await win.waitForTimeout(600);
// Start from a known state: Full Width off (the setting persists in the user's settings file).
const ensureFullWidth = (on) => app.evaluate(({ Menu }, on) => { const item = Menu.getApplicationMenu().getMenuItemById('fullWidth'); if (item.checked !== on) item.click(); }, on);
await ensureFullWidth(false);
await win.waitForTimeout(400);

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

// --- rendering of each element ---
const counts = await win.evaluate(() => {
  const q = (s) => document.querySelectorAll(`.tiptap ${s}`).length;
  return {
    h1: q('h1'), h2: q('h2'), h3: q('h3'), h6: q('h6'),
    ul: q('ul:not([data-type="taskList"])'), ol: q('ol'), tasks: q('ul[data-type="taskList"] li'),
    checked: q('ul[data-type="taskList"] li[data-checked="true"]'),
    quote: q('blockquote'), pre: q('pre'), hljs: q('pre .hljs-keyword'), table: q('table'), th: q('th'),
    img: q('img'), hr: q('hr'), strong: q('strong'), em: q('em'), s: q('s'), code: q('p code'), mark: q('mark'), a: q('a'), br: q('br'),
    imgSrc: document.querySelector('.tiptap img')?.getAttribute('src'),
    imgData: document.querySelector('.tiptap img')?.getAttribute('data-src'),
    imgLoaded: document.querySelector('.tiptap img')?.naturalWidth || 0,
  };
});
check('h1/h2/h3/h6 rendered', counts.h1 === 1 && counts.h2 >= 5 && counts.h3 === 1 && counts.h6 === 1, JSON.stringify([counts.h1, counts.h2, counts.h3, counts.h6]));
check('bullet + ordered lists', counts.ul >= 2 && counts.ol >= 2);
check('task list (3 items, 1 checked)', counts.tasks === 3 && counts.checked === 1, `${counts.tasks}/${counts.checked}`);
check('blockquote', counts.quote === 1);
check('code blocks with syntax highlighting', counts.pre === 2 && counts.hljs > 0, `pre=${counts.pre} keywords=${counts.hljs}`);
check('table with header', counts.table === 1 && counts.th === 3);
check('inline marks (strong/em/strike/code/mark/link)', counts.strong >= 2 && counts.em >= 2 && counts.s === 1 && counts.code >= 1 && counts.mark === 1 && counts.a >= 1);
check('hr + hard break', counts.hr === 1 && counts.br === 1);
check('relative image resolved to file://', counts.imgData === 'icon.png' && String(counts.imgSrc).startsWith('file://'), counts.imgSrc);
check('image actually loaded', counts.imgLoaded > 0, `naturalWidth=${counts.imgLoaded}`);
await win.screenshot({ path: path.join(shots, '1-rendered.png') });

// --- markdown round trip ---
const original = await fs.readFile(sample, 'utf8');
const roundTrip = await win.evaluate(() => window.__markdownStudio.getMarkdown());
const norm = (s) => s.replace(/\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
check('round-trip keeps headings', roundTrip.includes('# Markdown Studio') && roundTrip.includes('###### Sixth level'));
check('round-trip keeps task states', roundTrip.includes('- [x] Render markdown') && roundTrip.includes('- [ ] Ship a DMG'));
check('round-trip keeps code fence language', roundTrip.includes('```javascript') && roundTrip.includes('```python'));
check('round-trip keeps table', /\|\s*Feature\s*\|/.test(roundTrip) && /\|\s*-+\s*\|/.test(roundTrip));
check('round-trip keeps image path relative', roundTrip.includes('](icon.png)'));
check('round-trip keeps highlight/strike/code', roundTrip.includes('==highlighted==') && roundTrip.includes('~~strikethrough~~') && roundTrip.includes('`inline code`'));
check('round-trip keeps nested lists', /\n  - Nested bullet/.test(roundTrip) && /\n   1\. Nested ordered/.test(roundTrip));
check('document not marked dirty after open', (await win.evaluate(() => document.getElementById('dirty-dot').hidden)) === true);
if (norm(original) !== norm(roundTrip)) {
  console.log('NOTE  round-trip differs from source (normalisation). Diff written to', path.join(shots, 'roundtrip.md'));
  await fs.writeFile(path.join(shots, 'roundtrip.md'), roundTrip);
}

// --- slash menu ---
await win.evaluate(() => window.__markdownStudio.editor.commands.focus('end'));
await win.keyboard.press('Enter');
await win.keyboard.type('/');
await win.waitForTimeout(150);
check('slash menu opens on "/"', await win.isVisible('#slash-menu'));
const itemCount = await win.locator('#slash-menu .slash-item').count();
check('slash menu lists commands', itemCount >= 12, `${itemCount} items`);
await win.screenshot({ path: path.join(shots, '2-slash-menu.png') });
await win.keyboard.type('tab');
await win.waitForTimeout(150);
const filtered = await win.locator('#slash-menu .slash-item .slash-title').allTextContents();
check('slash menu filters ("tab" → Table)', filtered[0] === 'Table', filtered.join(', '));
await win.keyboard.press('Enter');
await win.waitForTimeout(150);
check('slash Table inserted a table', (await win.locator('.tiptap table').count()) === 2);
check('slash menu closed after selection', !(await win.isVisible('#slash-menu')));

// heading via slash + typing
await win.evaluate(() => window.__markdownStudio.editor.commands.focus('end'));
await win.keyboard.press('Enter');
await win.keyboard.type('/h2');
await win.waitForTimeout(150);
await win.keyboard.press('Enter');
await win.keyboard.type('Added heading');
check('slash Heading 2 works', (await win.locator('.tiptap h2:has-text("Added heading")').count()) === 1);
check('dirty state set after edit', (await win.evaluate(() => !document.getElementById('dirty-dot').hidden)));

// --- markdown input rule + bold shortcut ---
await win.keyboard.press('Enter');
await win.keyboard.type('- bullet via input rule');
check('"- " input rule makes a bullet list', (await win.locator('.tiptap li:has-text("bullet via input rule")').count()) === 1);
await win.keyboard.press('Shift+Meta+ArrowLeft');
await win.waitForTimeout(200); // let the editor sync the keyboard-made selection
await win.keyboard.press('Meta+b');
await win.waitForTimeout(300);
check('⌘B bolds selection', (await win.locator('.tiptap li strong:has-text("bullet via input rule")').count()) === 1);

// --- bubble menu appears on selection ---
await win.waitForTimeout(300);
check('bubble menu visible on selection', await win.evaluate(() => getComputedStyle(document.getElementById('bubble-menu')).visibility === 'visible'));
await win.screenshot({ path: path.join(shots, '3-editing.png') });

// --- source view ---
await win.keyboard.press('End');
await win.click('#btn-source');
await win.waitForTimeout(100);
const src = await win.inputValue('#source');
check('source view shows markdown', src.includes('## Added heading') && src.includes('**bullet via input rule**'));
await win.fill('#source', src + '\n\n> Added from source view\n');
await win.click('#btn-source');
await win.waitForTimeout(150);
check('edits in source view flow back to editor', (await win.locator('.tiptap blockquote:has-text("Added from source view")').count()) === 1);

// --- save (Cmd+S writes the file since it already has a path) ---
const saved = await app.evaluate(async ({ BrowserWindow, Menu }) => {
  const win = BrowserWindow.getAllWindows()[0];
  const menu = Menu.getApplicationMenu();
  const item = menu.items.find((i) => i.label === 'File').submenu.items.find((i) => i.label === 'Save');
  item.click(undefined, win, win.webContents);
  await new Promise((r) => setTimeout(r, 500));
  return win.isDocumentEdited();
});
check('window no longer marked edited after save', saved === false);
const savedText = await fs.readFile(tmpDoc, 'utf8');
check('saved file contains edits', savedText.includes('## Added heading') && savedText.includes('> Added from source view') && savedText.includes('**bullet via input rule**'));
check('saved file ends with newline', savedText.endsWith('\n'));
check('saved file still has original content', savedText.includes('```javascript') && savedText.includes('- [x] Render markdown'));

// --- full width toggle ---
const editorWidth = () => win.evaluate(() => document.getElementById('editor').getBoundingClientRect().width);
const normalWidth = await editorWidth();
await win.click('#btn-width');
await win.waitForTimeout(400);
const wideWidth = await editorWidth();
check('full-width button widens the writing area', wideWidth > normalWidth + 200, `${normalWidth} → ${wideWidth}`);
check('View > Full Width menu item is checked', await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('fullWidth').checked) === true);
await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('fullWidth').click()); // click() toggles a checkbox item
await win.waitForTimeout(400);
check('menu item toggles back to normal width', Math.abs((await editorWidth()) - normalWidth) < 2);
await win.click('#btn-width');
await win.waitForTimeout(300);
await win.screenshot({ path: path.join(shots, '5-full-width.png') });

// --- new document window ---
await app.evaluate(({ Menu }) => {
  const menu = Menu.getApplicationMenu();
  menu.items.find((i) => i.label === 'File').submenu.items.find((i) => i.label === 'New').click();
});
await win.waitForTimeout(600);
check('⌘N opens a second window', (await app.windows()).length === 2);
const second = (await app.windows()).find((w) => w !== win);
await second.waitForSelector('.tiptap');
await second.waitForTimeout(300);
check('new window inherits full-width setting', await second.evaluate(() => document.body.classList.contains('full-width')));
await ensureFullWidth(false); // leave the user's setting as we found it

await app.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURE(S)'} — screenshots in ${shots}`);
process.exit(failures ? 1 : 0);
