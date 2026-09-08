import { icons } from './icons.js';
import { promptDialog } from './dialog.js';

const del = (editor, range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS = [
  { group: 'Basic blocks', title: 'Text', desc: 'Plain paragraph text', icon: 'text', keywords: ['paragraph', 'plain', 'p'],
    run: ({ editor, range }) => del(editor, range).setParagraph().run() },
  { group: 'Basic blocks', title: 'Heading 1', desc: 'Large section heading', icon: 'h1', keywords: ['h1', 'title', 'big'],
    run: ({ editor, range }) => del(editor, range).setHeading({ level: 1 }).run() },
  { group: 'Basic blocks', title: 'Heading 2', desc: 'Medium section heading', icon: 'h2', keywords: ['h2', 'subtitle'],
    run: ({ editor, range }) => del(editor, range).setHeading({ level: 2 }).run() },
  { group: 'Basic blocks', title: 'Heading 3', desc: 'Small section heading', icon: 'h3', keywords: ['h3'],
    run: ({ editor, range }) => del(editor, range).setHeading({ level: 3 }).run() },
  { group: 'Basic blocks', title: 'Bulleted list', desc: 'Simple bulleted list', icon: 'bulletList', keywords: ['ul', 'unordered', 'bullets'],
    run: ({ editor, range }) => del(editor, range).toggleBulletList().run() },
  { group: 'Basic blocks', title: 'Numbered list', desc: 'List with numbers', icon: 'orderedList', keywords: ['ol', 'ordered', 'numbers'],
    run: ({ editor, range }) => del(editor, range).toggleOrderedList().run() },
  { group: 'Basic blocks', title: 'To-do list', desc: 'Track tasks with checkboxes', icon: 'taskList', keywords: ['todo', 'task', 'checkbox', 'check'],
    run: ({ editor, range }) => del(editor, range).toggleTaskList().run() },
  { group: 'Basic blocks', title: 'Quote', desc: 'Capture a quotation', icon: 'blockquote', keywords: ['blockquote', 'citation'],
    run: ({ editor, range }) => del(editor, range).toggleBlockquote().run() },
  { group: 'Basic blocks', title: 'Code block', desc: 'Code with syntax highlighting', icon: 'codeBlock', keywords: ['code', 'snippet', 'pre', 'fence'],
    run: ({ editor, range }) => del(editor, range).setCodeBlock().run() },
  { group: 'Basic blocks', title: 'Divider', desc: 'Horizontal rule', icon: 'horizontalRule', keywords: ['hr', 'rule', 'separator', 'line'],
    run: ({ editor, range }) => del(editor, range).setHorizontalRule().run() },

  { group: 'Insert', title: 'Table', desc: '3 × 3 table with a header row', icon: 'table', keywords: ['grid', 'rows', 'columns'],
    run: ({ editor, range }) => del(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { group: 'Insert', title: 'Image', desc: 'Pick an image file from your Mac', icon: 'image', keywords: ['picture', 'photo', 'img', 'file'],
    run: async ({ editor, range }) => {
      del(editor, range).run();
      const src = await window.api.chooseImage();
      if (src) editor.chain().focus().setImage({ src, alt: src.split('/').pop().replace(/\.[^.]+$/, '') }).run();
    } },
  { group: 'Insert', title: 'Image from URL', desc: 'Embed an image by web address', icon: 'image', keywords: ['picture', 'link', 'web', 'url', 'http'],
    run: async ({ editor, range }) => {
      del(editor, range).run();
      const src = await promptDialog({ title: 'Image URL', placeholder: 'https://example.com/image.png', okLabel: 'Insert' });
      if (src) editor.chain().focus().setImage({ src, alt: '' }).run();
    } },
  { group: 'Insert', title: 'Link', desc: 'Insert a hyperlink', icon: 'link', keywords: ['url', 'href', 'anchor', 'web'],
    run: async ({ editor, range }) => {
      del(editor, range).run();
      const href = await promptDialog({ title: 'Link URL', placeholder: 'https://', okLabel: 'Insert' });
      if (!href) return;
      const text = await promptDialog({ title: 'Link text', value: href, okLabel: 'Insert' });
      editor.chain().focus().insertContent({ type: 'text', text: text || href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } },
  { group: 'Insert', title: 'Line break', desc: 'Soft line break inside a paragraph', icon: 'hardBreak', keywords: ['br', 'newline', 'soft'],
    run: ({ editor, range }) => del(editor, range).setHardBreak().run() },
  { group: 'Insert', title: 'Date', desc: "Today's date", icon: 'text', keywords: ['today', 'time', 'now'],
    run: ({ editor, range }) => del(editor, range).insertContent(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })).run() },
];

export class SlashMenu {
  constructor(el) {
    this.el = el;
    this.items = [];
    this.index = 0;
    this.command = null;
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
  }

  filter(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return SLASH_ITEMS;
    const score = (item) => {
      const t = item.title.toLowerCase();
      if (t.startsWith(q)) return 3;
      if (item.keywords.some((k) => k.startsWith(q))) return 2;
      if (t.includes(q) || item.keywords.some((k) => k.includes(q))) return 1;
      return 0;
    };
    return SLASH_ITEMS.map((i) => [score(i), i]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  }

  start(props) {
    this.el.hidden = false;
    this.update(props);
  }

  update(props) {
    this.items = props.items || [];
    this.command = props.command;
    this.index = 0;
    this.render();
    this.position(props.clientRect);
  }

  exit() {
    this.el.hidden = true;
    this.items = [];
  }

  keyDown({ event }) {
    if (this.el.hidden) return false;
    if (event.key === 'ArrowDown') { this.move(1); return true; }
    if (event.key === 'ArrowUp') { this.move(-1); return true; }
    if (event.key === 'Enter' || event.key === 'Tab') { this.select(this.index); return true; }
    if (event.key === 'Escape') { this.exit(); return true; }
    return false;
  }

  move(delta) {
    if (!this.items.length) return;
    this.index = (this.index + delta + this.items.length) % this.items.length;
    this.highlight();
  }

  select(i) {
    const item = this.items[i];
    if (item && this.command) this.command(item);
  }

  position(clientRect) {
    const rect = clientRect && clientRect();
    if (!rect) return;
    const menu = this.el.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + menu.height > window.innerHeight - 8) top = Math.max(8, rect.top - menu.height - 6);
    if (left + menu.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menu.width - 8);
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }

  render() {
    if (!this.items.length) {
      this.el.innerHTML = '<div class="slash-empty">No matching commands</div>';
      return;
    }
    let html = '';
    let lastGroup = null;
    this.items.forEach((item, i) => {
      if (item.group !== lastGroup) {
        html += `<div class="slash-group">${item.group}</div>`;
        lastGroup = item.group;
      }
      html += `<button class="slash-item${i === this.index ? ' is-selected' : ''}" data-index="${i}">
        <span class="slash-icon">${icons[item.icon] || ''}</span>
        <span class="slash-text"><span class="slash-title">${item.title}</span><span class="slash-desc">${item.desc}</span></span>
      </button>`;
    });
    this.el.innerHTML = html;
    this.el.querySelectorAll('.slash-item').forEach((btn) => {
      btn.addEventListener('click', () => this.select(Number(btn.dataset.index)));
      btn.addEventListener('mousemove', () => {
        const i = Number(btn.dataset.index);
        if (i !== this.index) { this.index = i; this.highlight(); }
      });
    });
  }

  highlight() {
    this.el.querySelectorAll('.slash-item').forEach((btn, i) => {
      const on = i === this.index;
      btn.classList.toggle('is-selected', on);
      if (on) btn.scrollIntoView({ block: 'nearest' });
    });
  }
}
