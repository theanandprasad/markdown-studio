import { Editor, Extension, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TableKit } from '@tiptap/extension-table';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import Suggestion from '@tiptap/suggestion';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common);

// ---------- local image path resolution ----------
let docDir = null;
export function setDocDir(dir) { docDir = dir; }

export function resolveAssetSrc(src) {
  if (!src) return src;
  if (/^(https?:|data:|file:|blob:)/i.test(src)) return src;
  let abs = src;
  if (!src.startsWith('/')) {
    if (!docDir) return src;
    abs = `${docDir}/${src.replace(/^\.\//, '')}`;
  }
  return `file://${encodeURI(abs)}`;
}

export function refreshImageSources(root) {
  root.querySelectorAll('img[data-src]').forEach((img) => {
    img.src = resolveAssetSrc(img.dataset.src);
  });
}

const LocalImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
    return ['img', { ...attrs, 'data-src': attrs.src, src: resolveAssetSrc(attrs.src) }];
  },
});

// ---------- slash command extension ----------
export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addOptions() {
    return { suggestion: {} };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        command: ({ editor, range, props }) => props.run({ editor, range }),
        ...this.options.suggestion,
      }),
    ];
  },
});

// ---------- app shortcuts that must beat Tiptap's defaults ----------
// Tiptap binds Mod-Shift-s to strikethrough, which would swallow macOS "Save As…".
const AppShortcuts = Extension.create({
  name: 'appShortcuts',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-s': () => { window.api.saveAs(); return true; },
      'Mod-s': () => { window.api.save(); return true; },
      'Mod-Shift-x': () => this.editor.commands.toggleStrike(),
    };
  },
});

// ---------- editor factory ----------
export function createEditor({ element, bubbleElement, slashMenu, onUpdate, onSelection }) {
  return new Editor({
    element,
    contentType: 'markdown',
    content: '',
    autofocus: 'start',
    editorProps: {
      attributes: { class: 'tiptap', spellcheck: 'true' },
    },
    extensions: [
      AppShortcuts,
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https' },
        dropcursor: { color: 'var(--accent)', width: 2 },
      }),
      Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      TableKit.configure({ table: { resizable: false, HTMLAttributes: { class: 'md-table' } } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      LocalImage.configure({ inline: false, allowBase64: true }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: ({ node, editor }) => {
          if (node.type.name === 'heading') return `Heading ${node.attrs.level}`;
          if (editor.isEmpty) return 'Start writing, or type “/” for commands…';
          return 'Type “/” for commands';
        },
      }),
      BubbleMenu.configure({
        element: bubbleElement,
        updateDelay: 120,
        shouldShow: ({ editor, state, from, to }) => {
          if (from === to || !editor.isEditable) return false;
          if (editor.isActive('codeBlock') || editor.isActive('image')) return false;
          const text = state.doc.textBetween(from, to, ' ');
          return text.trim().length > 0;
        },
      }),
      SlashCommand.configure({
        suggestion: {
          items: ({ query }) => slashMenu.filter(query),
          render: () => ({
            onStart: (props) => slashMenu.start(props),
            onUpdate: (props) => slashMenu.update(props),
            onKeyDown: (props) => slashMenu.keyDown(props),
            onExit: () => slashMenu.exit(),
          }),
        },
      }),
    ],
    onUpdate: ({ editor }) => onUpdate && onUpdate(editor),
    onSelectionUpdate: ({ editor }) => onSelection && onSelection(editor),
    onTransaction: ({ editor }) => onSelection && onSelection(editor),
  });
}
